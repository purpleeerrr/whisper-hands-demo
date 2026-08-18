import { RoadshowMediaController } from './media-controller.js';
import { SessionModel, SESSION_STATES } from './session-model.js';
import { buildSessionRecord, formatClock } from './session-record.js';
import { SessionStore } from './session-store.js';
import { SpeechTranscriber } from './speech-transcriber.js';
import { mirrorRecordToKB } from './memory-bridge.js';

const $ = (selector, root = document) => root.querySelector(selector);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function showToast(text, isError = false) {
  const target = $('#toast');
  if (!target) return;
  target.textContent = text;
  target.classList.toggle('wh-runtime-error', isError);
  target.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => target.classList.remove('show'), 2300);
}

function stopOriginalEvent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function boot() {
  const liveWindow = $('.live-window');
  const pauseButton = $('#pauseBtn');
  const snapshotButton = $('#markBtn');
  const voiceButton = $('#voiceBtn');
  const finishButton = $('#endBtn');
  if (!liveWindow || !pauseButton || !snapshotButton || !voiceButton || !finishButton) return;

  const liveImage = createElement('img', 'wh-live-source');
  liveImage.id = 'liveImage';
  liveImage.alt = '摄像头实时画面';
  liveImage.src = `/api/t5/stream?ts=${Date.now()}`;
  const canvas = createElement('canvas', 'wh-capture-canvas');
  canvas.id = 'captureCanvas';
  canvas.width = 640;
  canvas.height = 480;
  const overlay = createElement('div', 'wh-source-overlay');
  overlay.innerHTML = '<strong>CAMERA</strong><span id="whSourceStatus">正在连接实时画面…</span>';
  liveWindow.replaceChildren(liveImage, canvas, overlay);

  const liveCard = liveWindow.closest('.paper-card');
  const deviceRow = createElement('div', 'wh-device-row');
  deviceRow.innerHTML = '<span class="wh-device" id="whCamBadge">CAMERA</span><span class="wh-device" id="whCtrlBadge">CONTROL</span><span class="wh-device online">MAC MIC</span>';
  liveCard?.append(deviceRow);

  const timelineCard = $('#timeline')?.closest('.paper-card');
  const transcriptPanel = createElement('div', 'wh-transcript');
  transcriptPanel.innerHTML = '<label><span>实时语音记录（可编辑）</span><span id="whSpeechStatus">WAITING</span></label>';
  const transcriptArea = document.createElement('textarea');
  transcriptArea.id = 'whTranscript';
  transcriptArea.placeholder = '开始创作后，Chrome 会在这里显示语音转写。识别不可用时，原声录像仍会保存。';
  const recordLink = createElement('a', 'wh-record-link', '▶ 播放刚才的完整录像');
  recordLink.target = '_blank';
  transcriptPanel.append(transcriptArea, recordLink);
  timelineCard?.append(transcriptPanel);

  const model = new SessionModel();
  const store = new SessionStore();
  const media = new RoadshowMediaController({ canvas, source: liveImage });
  let snapshots = [];
  let transcript = [];
  let activeSource = liveImage;
  let currentRecord = null;
  let currentVideoUrl = '';
  let sourceReady = false;
  let commandQueue = Promise.resolve();
  const sourceStatus = $('#whSourceStatus');
  const speechStatus = $('#whSpeechStatus');

  const transcriber = new SpeechTranscriber({
    elapsed: () => model.elapsedAt(),
    isPriority: () => Boolean(model.activeAudioMark),
    onAvailability: (available) => { speechStatus.textContent = available ? 'LIVE' : 'CHROME ASR OFF'; },
    onUpdate: (segments, interim) => {
      transcript = segments;
      const finalText = segments.map((segment) => segment.text).join('\n');
      transcriptArea.value = `${finalText}${interim ? `${finalText ? '\n' : ''}${interim}` : ''}`;
    },
  });

  function setSource(source, label) {
    activeSource = source;
    media.setSource(source);
    sourceReady = true;
    sourceStatus.textContent = label;
    sourceStatus.classList.remove('wh-runtime-error');
  }

  liveImage.addEventListener('load', () => {
    if (!liveImage.hidden) setSource(liveImage, '实时画面');
  });
  liveImage.addEventListener('error', () => {
    if (activeSource !== liveImage) return;
    sourceReady = false;
    sourceStatus.textContent = '摄像头未连接';
    sourceStatus.classList.add('wh-runtime-error');
  });

  function updateUi() {
    const state = model.state;
    const recState = $('#recState');
    const liveStatus = $('#liveStatus');
    const micState = $('#micState');
    const recDot = $('#recDot');
    $('#durationStat').textContent = formatClock(model.elapsedAt());
    if (state === SESSION_STATES.RECORDING) {
      recState.textContent = 'REC · CAMERA';
      liveStatus.textContent = 'CAMERA + MAC MIC · RECORDING';
      micState.textContent = model.activeAudioMark ? 'PRIORITY VOICE' : 'MIC ON';
      recDot.className = 'rec-dot on';
      pauseButton.textContent = 'Ⅱ 暂停';
      finishButton.textContent = '结束创作';
    } else if (state === SESSION_STATES.PAUSED) {
      recState.textContent = 'PAUSED';
      liveStatus.textContent = 'PREVIEW ON · RECORDING PAUSED';
      micState.textContent = 'MIC PAUSED';
      recDot.className = 'rec-dot pause';
      pauseButton.textContent = '▶ 继续';
    } else if (state === SESSION_STATES.COMPLETE) {
      recState.textContent = 'SAVED LOCALLY';
      liveStatus.textContent = 'SESSION COMPLETE';
      micState.textContent = 'MIC OFF';
      recDot.className = 'rec-dot';
      finishButton.textContent = '开始新创作';
    } else {
      recState.textContent = 'IDLE';
      liveStatus.textContent = sourceReady ? 'READY' : 'WAITING FOR CAMERA';
      micState.textContent = 'MIC OFF';
      recDot.className = 'rec-dot';
      finishButton.textContent = '开始创作';
    }
    voiceButton.classList.toggle('wh-priority-active', Boolean(model.activeAudioMark));
    voiceButton.textContent = model.activeAudioMark ? '● 正在记重点… 点击结束' : '🎙 标记语音';
  }

  function clearActualTimeline() {
    $('#timeline')?.replaceChildren();
    $('#nodeStat').textContent = '0';
  }

  function addTimeline(kind, text, imageBlob = null) {
    const timeline = $('#timeline');
    if (!timeline) return;
    const item = createElement('div', 'event');
    const thumb = createElement('div', 'event-thumb');
    thumb.dataset.kind = kind;
    if (imageBlob) thumb.style.backgroundImage = `url(${URL.createObjectURL(imageBlob)})`;
    const copy = createElement('div', 'event-text');
    const heading = document.createElement('b');
    heading.textContent = `${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · ${kind}`;
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    copy.append(heading, paragraph);
    item.append(thumb, copy);
    timeline.prepend(item);
    $('#nodeStat').textContent = String(model.events.length);
  }

  async function startSession() {
    if (!sourceReady || !media.sourceDimensions().width) throw new Error('请先连接摄像头');
    snapshots = [];
    transcript = [];
    transcriptArea.value = '';
    currentRecord = null;
    recordLink.classList.remove('ready');
    clearActualTimeline();
    await media.start();
    model.apply('VIDEO_TOGGLE');
    transcriber.start();
    addTimeline('START', '开始记录画面和 Mac 原声。');
    updateUi();
    showToast('已开始记录 · 画面 + Mac 原声');
  }

  async function toggleVideo() {
    if ([SESSION_STATES.IDLE, SESSION_STATES.COMPLETE].includes(model.state)) return startSession();
    if (model.state === SESSION_STATES.RECORDING) {
      model.apply('VIDEO_TOGGLE');
      media.pause();
      addTimeline('PAUSE', '录像已暂停，预览仍保留。');
    } else if (model.state === SESSION_STATES.PAUSED) {
      model.apply('VIDEO_TOGGLE');
      media.resume();
      addTimeline('RESUME', '继续记录。');
    }
    updateUi();
  }

  async function takeSnapshot() {
    const result = model.apply('SNAPSHOT');
    if (!result.accepted) throw new Error('请先开始创作');
    const blob = await media.snapshot();
    const snapshot = { id: `shot_${Date.now()}`, atMs: model.elapsedAt(), blob };
    snapshots.push(snapshot);
    addTimeline('SNAPSHOT', '已保存当前画面。', blob);
    showToast('留一刻 · 截图已保存');
  }

  function startAudioMark() {
    const result = model.apply('AUDIO_MARK_START');
    if (!result.accepted) throw new Error('请先开始创作');
    addTimeline('VOICE START', '开始标记重点语音区间。');
    updateUi();
  }

  function stopAudioMark() {
    const result = model.apply('AUDIO_MARK_STOP');
    if (!result.accepted) throw new Error('没有正在进行的语音标记');
    addTimeline('VOICE END', '重点语音区间已保存。');
    updateUi();
  }

  function showFinishedRecord(record) {
    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = URL.createObjectURL(record.videoBlob);
    recordLink.href = currentVideoUrl;
    recordLink.classList.add('ready');
    $('#finishDuration').textContent = `${formatClock(record.durationMs)} · SESSION`;
    $('#finishNodes').textContent = `${record.events.length} NODES`;
    const thumbs = [...document.querySelectorAll('.finish-thumb')];
    thumbs.forEach((thumb, index) => {
      const shot = record.snapshots[index];
      if (shot) thumb.style.backgroundImage = `url(${URL.createObjectURL(shot.blob)})`;
    });
    const modal = $('#finishModal');
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
    const reviewPhoto = $('#reviewHeader .wake-photo');
    if (reviewPhoto) {
      reviewPhoto.replaceChildren();
      const video = createElement('video', 'wh-review-video');
      video.src = currentVideoUrl;
      video.controls = true;
      video.playsInline = true;
      reviewPhoto.append(video);
    }
  }

  async function finishSession() {
    if (![SESSION_STATES.RECORDING, SESSION_STATES.PAUSED].includes(model.state)) return;
    model.apply('VIDEO_FINISH');
    transcriber.stop();
    transcriptArea.blur();
    const videoBlob = await media.finish();
    currentRecord = buildSessionRecord({ model, videoBlob, snapshots, transcript });
    await store.save(currentRecord);
    addSessionCard(currentRecord);
    showFinishedRecord(currentRecord);
    updateUi();
    showToast('完整录像已保存到这台 Mac');
    // 方案 A:同步镜像到队友知识库,失败不影响 NOW 主流程
    mirrorRecordToKB(currentRecord)
      .then((kbId) => {
        if (kbId && typeof window.__kbMemoryRefresh === 'function') {
          window.__kbMemoryRefresh();
        }
      })
      .catch((error) => console.warn('[MemoryBridge] 后台镜像失败', error));
  }

  async function runCommand(event, payload = {}) {
    try {
      if (event === 'VIDEO_TOGGLE') await toggleVideo();
      else if (event === 'SNAPSHOT') await takeSnapshot();
      else if (event === 'AUDIO_MARK_START') startAudioMark();
      else if (event === 'AUDIO_MARK_STOP') stopAudioMark();
      else if (event === 'VIDEO_FINISH') await finishSession();
      else if (event === 'MODE') {
        model.apply('MODE', payload);
        $('#modeHint').textContent = `控制端已选择功能 ${payload.mode || '?'}，按下时才执行。`;
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || '操作失败', true);
    }
  }

  function enqueue(event, payload) {
    commandQueue = commandQueue.then(() => runCommand(event, payload));
    return commandQueue;
  }

  pauseButton.addEventListener('click', (event) => { stopOriginalEvent(event); enqueue('VIDEO_TOGGLE'); }, true);
  snapshotButton.addEventListener('click', (event) => { stopOriginalEvent(event); enqueue('SNAPSHOT'); }, true);
  finishButton.addEventListener('click', (event) => {
    stopOriginalEvent(event);
    enqueue([SESSION_STATES.IDLE, SESSION_STATES.COMPLETE].includes(model.state) ? 'VIDEO_TOGGLE' : 'VIDEO_FINISH');
  }, true);
  voiceButton.addEventListener('pointerdown', (event) => {
    stopOriginalEvent(event);
    enqueue(model.activeAudioMark ? 'AUDIO_MARK_STOP' : 'AUDIO_MARK_START');
  }, true);
  transcriptArea.addEventListener('change', () => transcriber.replaceFromText(transcriptArea.value));

  const eventSource = new EventSource('/api/hardware/events');
  eventSource.addEventListener('hardware', (message) => {
    try {
      const packet = JSON.parse(message.data);
      enqueue(packet.event, packet.payload);
    } catch (error) { console.error('Invalid bridge event', error); }
  });

  async function refreshStatus() {
    try {
      const status = await (await fetch('/api/device/status', { cache: 'no-store' })).json();
      $('#whCamBadge')?.classList.toggle('online', Boolean(status.t5?.online));
      $('#whCtrlBadge')?.classList.toggle('online', Boolean(status.esp32?.online));
      const topStatus = $('.topbar .status');
      if (topStatus) topStatus.textContent = `● 摄像头 ${status.t5?.online ? 'ONLINE' : 'WAITING'} · 控制端 ${status.esp32?.online ? 'ONLINE' : 'WAITING'} · LOCAL ONLY`;
    } catch {
      $('#whCamBadge')?.classList.remove('online');
      $('#whCtrlBadge')?.classList.remove('online');
    }
  }
  setInterval(refreshStatus, 2_000);
  setInterval(() => {
    if ([SESSION_STATES.RECORDING, SESSION_STATES.PAUSED].includes(model.state)) updateUi();
  }, 500);

  function addSessionCard(record) {
    const board = $('#recordBoard');
    if (!board || board.querySelector(`[data-session-id="${record.sessionId}"]`)) return;
    const card = createElement('article', 'record-card wh-session-card');
    card.dataset.sessionId = record.sessionId;
    card.dataset.title = record.title;
    card.dataset.mode = 'create';
    card.style.left = `${5 + (board.querySelectorAll('.wh-session-card').length % 4) * 23}%`;
    card.style.top = `${600 + Math.floor(board.querySelectorAll('.wh-session-card').length / 4) * 270}px`;
    const meta = createElement('div', 'record-meta');
    meta.innerHTML = `<span>${new Date(record.startedAt).toLocaleDateString('zh-CN')} · ${formatClock(record.durationMs)}</span><span class="star">★</span>`;
    const cover = createElement('div', 'cover');
    if (record.snapshots[0]?.blob) cover.style.backgroundImage = `url(${URL.createObjectURL(record.snapshots[0].blob)})`;
    const title = createElement('h4', '', record.title);
    const summary = createElement('p', '', `${record.snapshots.length} 张截图 · ${record.audioMarks.length} 段重点语音 · ${record.transcript.length} 条文字`);
    const play = createElement('button', 'wh-play-session', '▶ 回放本次记录');
    play.type = 'button';
    play.addEventListener('click', (event) => {
      event.stopPropagation();
      showFinishedRecord(record);
    });
    card.append(meta, cover, title, summary, play);
    board.append(card);
    board.style.minHeight = `${Math.max(board.scrollHeight, parseInt(card.style.top, 10) + 250)}px`;
  }

  try {
    for (const record of await store.list()) addSessionCard(record);
  } catch (error) {
    console.warn('IndexedDB unavailable', error);
  }
  $('#memorySearch')?.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll('#recordBoard .wh-session-card').forEach((card) => {
      card.hidden = Boolean(query) && !card.textContent.toLowerCase().includes(query);
    });
  });
  $('#deleteSessionBtn')?.addEventListener('click', async (event) => {
    if (!currentRecord) return;
    stopOriginalEvent(event);
    await store.delete(currentRecord.sessionId);
    document.querySelector(`[data-session-id="${currentRecord.sessionId}"]`)?.remove();
    $('#finishModal')?.classList.remove('open');
    currentRecord = null;
    model.reset();
    updateUi();
    showToast('本次记录已删除');
  }, true);

  await sleep(250);
  refreshStatus();
  updateUi();
}

boot().catch((error) => {
  console.error(error);
  showToast(`路演媒体模块启动失败：${error.message}`, true);
});
