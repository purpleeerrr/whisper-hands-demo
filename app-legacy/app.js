import {
  attachMedia,
  beginVoiceCapture,
  completeVoiceCapture,
  confirmCandidate,
  confirmMeaningCandidate,
  createDemoState,
  deferCandidate,
  deferMeaningCandidate,
  discardMeaningCandidate,
  discardInboxItem,
  dueReminders,
  failVoiceCapture,
  forkTemplate,
  leaveMoment,
  requestMeaningCandidate,
  saveCandidateStructureAsTemplate,
  selectGlaze,
  selectTemplate,
  startProjectFromTemplate,
  startVoiceFirstProject,
  startNextProject,
  updateCandidateTemplateValue,
  updateProjectField,
  updateMeaningCandidate,
  updateTemplateProjectValue,
  updateVoiceTranscript,
  renameTemplateField,
  scheduleReminder,
  shapeInboxItem,
  updateCandidateField,
} from './state.js';
import { renderApp } from './view.js';
import { exportRecords, loadState, saveState } from './storage.js';
import { parseDeviceLine } from './hardware.js';
import { computeImageHash, rankByVisualHash } from './vision.js';

const state = loadState(window.localStorage, createDemoState());
const root = document.querySelector('#app');
const toast = document.querySelector('#toast');
let cameraStream = null;
let voiceStream = null;
let voiceRecorder = null;
let voiceChunks = [];
let speechRecognition = null;
let speechTranscript = '';
let voiceHoldRequested = false;
let voiceStartPending = false;
let voiceStopRequested = false;
let speechConsentGranted = false;
const VOICE_DEMO_NOTE = '我用了白色石器泥，刚刚刷了三层蓝釉。杯沿好像有点太厚，我也说不上来，下次想先试两层。';

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function draw() {
  saveState(window.localStorage, state);
  root.innerHTML = renderApp(state);
  const preview = root.querySelector('#camera-preview');
  if (preview && cameraStream) preview.srcObject = cameraStream;
}

function downloadArchive() {
  const blob = new Blob([exportRecords(state)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'whisper-hands-confirmed-records.json';
  link.click();
  URL.revokeObjectURL(url);
}

function eventId() {
  return `evt_${Date.now()}`;
}

function focusInboxItem(inboxId) {
  window.requestAnimationFrame(() => {
    document.querySelector(`#inbox-${inboxId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
}

async function captureMoment(sourceEventId = eventId()) {
  if (cameraStream) {
    try { await takePhoto({ quiet: true }); } catch { /* Keep the event even when the camera snapshot fails. */ }
  }
  const note = state.project.fields.observation?.trim() || '刚刚留下了一刻，稍后补充观察。';
  const item = leaveMoment(state, { eventId: sourceEventId, note });
  if (item) showToast(`已保存文字与 ${item.media.length} 个媒体证据。`);
  draw();
  return item;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function addMediaBlob(blob, type) {
  if (blob.size > 3_000_000) {
    showToast('单个媒体需小于 3 MB，方便在本机保存。');
    return null;
  }
  const url = await blobToDataUrl(blob);
  const media = { id: `media_${Date.now()}_${state.currentMedia?.length || 0}`, type, url };
  if (type === 'image') media.hash = await computeImageHash(url);
  attachMedia(state, media);
  draw();
  return media;
}

async function startCamera() {
  cameraStream ||= await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'environment' },
    audio: false,
  });
  draw();
  showToast('镜头已开启。可以拍照或录 3 秒视频。');
}

async function takePhoto({ quiet = false } = {}) {
  if (!cameraStream) await startCamera();
  const preview = root.querySelector('#camera-preview');
  const canvas = document.createElement('canvas');
  const width = Math.min(preview.videoWidth || 960, 960);
  const ratio = (preview.videoHeight || 720) / (preview.videoWidth || 960);
  canvas.width = width;
  canvas.height = Math.round(width * ratio);
  canvas.getContext('2d').drawImage(preview, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.74));
  await addMediaBlob(blob, 'image');
  if (!quiet) showToast('已拍照，按“留一刻”后进入过程收件箱。');
}

async function recordVideo() {
  if (!cameraStream) await startCamera();
  if (!window.MediaRecorder) throw new Error('当前浏览器不支持视频录制');
  const chunks = [];
  const recorder = new MediaRecorder(cameraStream, { videoBitsPerSecond: 360000 });
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start();
  showToast('正在录制 3 秒过程视频…');
  window.setTimeout(() => recorder.stop(), 3000);
  await stopped;
  await addMediaBlob(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }), 'video');
  showToast('视频已就绪，按“留一刻”一起保存。');
}

function startBrowserTranscription() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition || !speechConsentGranted) return null;
  const recognition = new Recognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    let current = '';
    for (let index = 0; index < event.results.length; index += 1) {
      current += event.results[index][0]?.transcript || '';
    }
    speechTranscript = current.trim();
  };
  recognition.onerror = () => { /* Raw local audio remains available. */ };
  try { recognition.start(); } catch { return null; }
  return recognition;
}

async function ensureVoiceTarget() {
  const active = state.inbox.find(
    (item) => item.id === state.activeMomentId && item.status !== 'confirmed',
  );
  if (active) return active;
  return captureMoment(`evt_voice_mark_${Date.now()}`);
}

async function startVoiceObservation(sourceEventId = `evt_voice_start_${Date.now()}`) {
  if (voiceStartPending || voiceRecorder?.state === 'recording') return;
  voiceStartPending = true;
  voiceStopRequested = false;
  try {
    await ensureVoiceTarget();
    voiceStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (!speechConsentGranted && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      speechConsentGranted = window.confirm(
        '原始录音会保存在本机。启用浏览器语音转写时，声音可能由浏览器服务处理。是否本次启用转写？',
      );
    }
    voiceChunks = [];
    speechTranscript = '';
    voiceRecorder = new MediaRecorder(voiceStream, { audioBitsPerSecond: 64000 });
    voiceRecorder.ondataavailable = (event) => {
      if (event.data.size) voiceChunks.push(event.data);
    };
    beginVoiceCapture(state, {
      eventId: sourceEventId,
      source: '电脑／USB 麦克风',
    });
    speechRecognition = startBrowserTranscription();
    voiceRecorder.start();
    draw();
    showToast('正在记录观察。松开按键结束。');
    if (voiceStopRequested || !voiceHoldRequested) await stopVoiceObservation();
  } catch {
    failVoiceCapture(state, '无法使用麦克风');
    draw();
    showToast('无法开启麦克风。画面记录仍在，可手动补充观察。');
  } finally {
    voiceStartPending = false;
  }
}

async function stopVoiceObservation(sourceEventId = `evt_voice_stop_${Date.now()}`) {
  voiceHoldRequested = false;
  if (voiceStartPending && voiceRecorder?.state !== 'recording') {
    voiceStopRequested = true;
    return;
  }
  if (!voiceRecorder || voiceRecorder.state !== 'recording') return;
  const recorder = voiceRecorder;
  const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
  recorder.stop();
  try { speechRecognition?.stop(); } catch { /* Recognition may already be stopped. */ }
  await stopped;
  const blob = new Blob(voiceChunks, { type: recorder.mimeType || 'audio/webm' });
  let audio = null;
  if (blob.size <= 1_500_000) {
    audio = {
      id: `audio_${Date.now()}`,
      type: 'audio',
      url: await blobToDataUrl(blob),
      mimeType: blob.type,
    };
  }
  const transcript = speechTranscript || state.project.fields.observation?.trim() || '';
  const item = completeVoiceCapture(state, {
    eventId: sourceEventId,
    transcript,
    audio,
  });
  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
  voiceRecorder = null;
  speechRecognition = null;
  voiceChunks = [];
  draw();
  if (item?.status === 'candidate_ready') focusInboxItem(item.id);
  if (!item) {
    showToast('没有找到对应的过程记录，请先短按留画面。');
  } else if (item.status === 'candidate_ready') {
    showToast('口述已整理成候选结构，请检查后确认。');
  } else if (transcript) {
    showToast('原始语音和转写已放入同一条过程记录。');
  } else {
    showToast('原始语音已保存。浏览器没有生成转写，可在收件箱补充。');
  }
}

async function handleDeviceEvent(deviceEvent) {
  if (deviceEvent.type === 'MARK_PRESSED') {
    await captureMoment(deviceEvent.eventId);
    return;
  }
  if (deviceEvent.type === 'VOICE_CAPTURE_STARTED') {
    voiceHoldRequested = true;
    await startVoiceObservation(deviceEvent.eventId);
    return;
  }
  if (deviceEvent.type === 'VOICE_CAPTURE_STOPPED') {
    await stopVoiceObservation(deviceEvent.eventId);
  }
}

async function readSerialPort(port) {
  const decoder = new TextDecoder();
  const reader = port.readable.getReader();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        const deviceEvent = parseDeviceLine(line);
        if (deviceEvent) await handleDeviceEvent(deviceEvent);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function connectDevice() {
  if (!navigator.serial) {
    showToast('当前浏览器没有 Web Serial。可让 AI Keyboard 按键发送 F8。');
    return;
  }
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  state.device = { status: 'connected', label: 'USB 串口 · 115200 baud · 等待 MARK' };
  draw();
  showToast('AI Keyboard 已连接。按键发送 MARK 即可“留一刻”。');
  readSerialPort(port).catch(() => {
    state.device = { status: 'disconnected', label: '连接已断开' };
    draw();
  });
}

function notifyReminder(record) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('絮手提醒', { body: `回来记录「${record?.projectName || '这次实验'}」的结果` });
  }
}

root.addEventListener('click', async (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action } = control.dataset;

  if (action === 'select-template') {
    const template = selectTemplate(state, control.dataset.templateId);
    if (template) showToast(`已打开「${template.name}」模板`);
  }

  if (action === 'fork-template') {
    const source = state.templates.find((template) => template.id === state.activeTemplateId);
    const copy = forkTemplate(state, state.activeTemplateId, `我的${source.name}`);
    if (copy) {
      selectTemplate(state, copy.id);
      showToast(`已复制为「${copy.name}」；修改字段后即可开始记录`);
    }
  }

  if (action === 'start-voice-first') {
    startVoiceFirstProject(state);
    showToast('已进入自由记录。直接长按说，完成后再整理结构。');
  }

  if (action === 'use-voice-demo') {
    const item = leaveMoment(state, {
      eventId: `evt_voice_demo_${Date.now()}`,
      note: VOICE_DEMO_NOTE,
    });
    if (item) {
      shapeInboxItem(state, item.id);
      draw();
      focusInboxItem(item.id);
      showToast('演示口述已整理成候选结构。');
    }
    return;
  }

  if (action === 'start-template-project') {
    const project = startProjectFromTemplate(state, control.dataset.templateId);
    if (project) showToast(`已用「${project.name.replace(' · 新记录', '')}」建立工作台`);
  }

  if (action === 'leave-moment') {
    await captureMoment();
    return;
  }

  if (action === 'confirm') {
    const record = confirmCandidate(state, control.dataset.inboxId);
    if (record) showToast('已确认并存入个人实验库。');
  }

  if (action === 'shape-inbox') {
    const candidate = shapeInboxItem(state, control.dataset.inboxId);
    if (candidate) showToast(candidate.voiceOrganized ? '已从完整口述中整理出候选结构，请检查。' : '已按当前模板生成候选记录，请检查后入库。');
  }

  if (action === 'save-candidate-template') {
    const template = saveCandidateStructureAsTemplate(state, control.dataset.inboxId, '我的语音整理模板');
    if (template) showToast('已把这套候选结构保存为可编辑模板。');
  }

  if (action === 'defer-candidate') {
    const item = deferCandidate(state, control.dataset.inboxId);
    if (item) showToast('已放回过程收件箱，可以稍后继续。');
  }

  if (action === 'discard-inbox') {
    const item = discardInboxItem(state, control.dataset.inboxId);
    if (item) showToast('这条过程记录已删除。');
  }

  if (action === 'request-meaning') {
    const candidate = requestMeaningCandidate(state, control.dataset.recordId);
    if (candidate) showToast('已生成一条意义候选，请由你决定是否保留。');
  }

  if (action === 'confirm-meaning') {
    const principle = confirmMeaningCandidate(state, control.dataset.meaningId);
    if (principle) showToast('已保存为你确认过的创作原则。');
  }

  if (action === 'defer-meaning') {
    const candidate = deferMeaningCandidate(state, control.dataset.meaningId);
    if (candidate) showToast('意义候选已稍后处理，事实记录保持不变。');
  }

  if (action === 'discard-meaning') {
    const candidate = discardMeaningCandidate(state, control.dataset.meaningId);
    if (candidate) showToast('已放弃这条意义候选。');
  }

  if (action === 'next-project') {
    startNextProject(state);
    showToast('已开始新试片。选择一支釉料，找回过去的经验。');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (action === 'open-recall') {
    document.querySelector('.archive-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('这条经验已在个人实验库中标出。');
  }

  if (action === 'dismiss-recall') {
    state.recall = null;
    showToast('已忽略这次提示；记录仍留在个人实验库。');
  }

  if (action === 'export-records') {
    downloadArchive();
    showToast(`已导出 ${state.confirmedRecords.length} 条确认记录。`);
  }

  if (action === 'start-camera') {
    try { await startCamera(); } catch { showToast('无法开启镜头，请检查浏览器权限。'); }
  }

  if (action === 'take-photo') {
    try { await takePhoto(); } catch { showToast('拍照失败，请先允许镜头权限。'); }
  }

  if (action === 'record-video') {
    try { await recordVideo(); } catch { showToast('视频录制失败，请检查浏览器权限。'); }
  }

  if (action === 'connect-device') {
    try { await connectDevice(); } catch { showToast('设备连接未完成，请重新选择串口。'); }
  }

  if (action === 'schedule-reminder') {
    const dueAt = new Date(Date.now() + 5000).toISOString();
    scheduleReminder(state, control.dataset.recordId, dueAt);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    showToast('已设置 5 秒后的演示提醒。');
  }

  if (action === 'complete-reminder') {
    const reminder = state.activeReminder;
    if (reminder) reminder.status = 'completed';
    state.activeReminder = null;
    showToast('提醒已完成。');
  }

  draw();
});

root.addEventListener('pointerdown', async (event) => {
  const control = event.target.closest('[data-action="hold-to-talk"]');
  if (!control) return;
  event.preventDefault();
  voiceHoldRequested = true;
  await startVoiceObservation();
});

document.addEventListener('pointerup', async () => {
  if (!voiceHoldRequested && state.voiceCapture?.status !== 'recording') return;
  await stopVoiceObservation();
});

root.addEventListener('change', async (event) => {
  if (event.target.id === 'media-upload') {
    for (const file of event.target.files) {
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      await addMediaBlob(file, type);
    }
    showToast('媒体已就绪，按“留一刻”一起保存。');
    return;
  }

  if (event.target.id === 'visual-query') {
    const file = event.target.files[0];
    if (!file) return;
    const url = await blobToDataUrl(file);
    const hash = await computeImageHash(url);
    state.visualMatches = rankByVisualHash(state.confirmedRecords, hash);
    draw();
    showToast(state.visualMatches.length ? '已按画面相似度找回记录。' : '实验库里还没有带图片的确认记录。');
    return;
  }
  const field = event.target.dataset.field;
  if (!field) return;
  const value = event.target.value;
  updateProjectField(state, field, value);
  if (field === 'glaze') {
    const recall = selectGlaze(state, value);
    if (recall) showToast('找到了与你当前材料相关的个人经验。');
  }
  draw();
});

root.addEventListener('input', (event) => {
  if (event.target.dataset.transcriptField !== undefined) {
    updateVoiceTranscript(state, event.target.dataset.inboxId, event.target.value);
    saveState(window.localStorage, state);
    return;
  }
  const meaningField = event.target.dataset.meaningField;
  if (meaningField) {
    updateMeaningCandidate(state, event.target.dataset.meaningId, meaningField, event.target.value);
    saveState(window.localStorage, state);
    return;
  }
  const candidateTemplateLabel = event.target.dataset.candidateTemplateLabel;
  if (candidateTemplateLabel) {
    updateCandidateTemplateValue(state, event.target.dataset.inboxId, candidateTemplateLabel, event.target.value);
    saveState(window.localStorage, state);
    return;
  }
  const candidateField = event.target.dataset.candidateField;
  if (candidateField) {
    updateCandidateField(state, event.target.dataset.inboxId, candidateField, event.target.value);
    saveState(window.localStorage, state);
    return;
  }
  const field = event.target.dataset.field;
  if (field === 'observation') updateProjectField(state, field, event.target.value);
  const templateValue = event.target.dataset.templateValue;
  if (templateValue) updateTemplateProjectValue(state, templateValue, event.target.value);
  const fieldIndex = event.target.dataset.templateFieldIndex;
  if (fieldIndex !== undefined) renameTemplateField(state, state.activeTemplateId, Number(fieldIndex), event.target.value);
  saveState(window.localStorage, state);
});

draw();

document.addEventListener('keydown', async (event) => {
  if (event.key === 'F8') {
    event.preventDefault();
    if (event.repeat) return;
    await captureMoment(`evt_hid_${Date.now()}`);
    showToast('收到实体键 F8，已留下当前画面。');
  }
  if (event.key === 'F9') {
    event.preventDefault();
    if (event.repeat) return;
    voiceHoldRequested = true;
    await startVoiceObservation(`evt_hid_voice_start_${Date.now()}`);
  }
});

document.addEventListener('keyup', async (event) => {
  if (event.key !== 'F9') return;
  event.preventDefault();
  await stopVoiceObservation(`evt_hid_voice_stop_${Date.now()}`);
});

window.setInterval(() => {
  const reminder = dueReminders(state)[0];
  if (!reminder) return;
  reminder.status = 'presented';
  state.activeReminder = reminder;
  const record = state.confirmedRecords.find((item) => item.id === reminder.recordId);
  notifyReminder(record);
  draw();
}, 1000);
