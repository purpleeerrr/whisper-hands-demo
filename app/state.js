const templates = [
  {
    id: 'tpl_ceramic_glaze_v1',
    name: '陶艺釉料测试',
    subtitle: '完整 Demo',
    fields: ['泥料', '釉料', '施釉方式', '层数', '烧制条件', '观察', '结果'],
  },
  {
    id: 'tpl_watercolor_v1',
    name: '水彩配色实验',
    subtitle: '可查看与复制',
    fields: ['纸张', '颜料', '配色', '水量', '技法', '观察', '结果'],
  },
  {
    id: 'tpl_glass_firing_v1',
    name: '玻璃烧制记录',
    subtitle: '可查看与复制',
    fields: ['玻璃类型', '拼接方式', '温度曲线', '退火', '结果'],
  },
];

function createCeramicProject() {
  return {
    id: 'project_blue_cup',
    templateId: 'tpl_ceramic_glaze_v1',
    name: '蓝色杯子试片',
    stage: '上釉',
    fields: {
      clay: '白色石器泥',
      glaze: '深海蓝透明釉',
      method: '浸釉',
      coats: 3,
      firing: '待定',
      observation: '',
      result: '等待结果',
    },
  };
}

function stashCurrentProject(state) {
  if (!state.project?.templateId) return;
  state.projectDrafts ||= {};
  state.projectDrafts[state.project.templateId] = structuredClone(state.project);
}

export function createDemoState() {
  const project = createCeramicProject();
  return {
    templates: structuredClone(templates),
    activeTemplateId: 'tpl_ceramic_glaze_v1',
    project,
    projectDrafts: { [project.templateId]: structuredClone(project) },
    inbox: [],
    confirmedRecords: [],
    recall: null,
    currentMedia: [],
    reminders: [],
    activeReminder: null,
    visualMatches: [],
    device: { status: 'disconnected', label: '等待连接' },
    activeMomentId: null,
    voiceCapture: {
      status: 'idle',
      source: '电脑／USB 麦克风',
      targetInboxId: null,
      eventId: null,
      error: null,
    },
    meaningCandidates: [],
    confirmedPrinciples: [],
  };
}

export function leaveMoment(state, { eventId, note }) {
  if (state.inbox.some((item) => item.eventId === eventId)) return null;

  const item = {
    id: `inbox_${state.inbox.length + 1}`,
    eventId,
    capturedAt: new Date().toISOString(),
    note,
    status: 'ready_to_shape',
    media: structuredClone(state.currentMedia || []),
    projectSnapshot: {
      templateId: state.activeTemplateId,
      projectName: state.project.name,
      fields: structuredClone(state.project.fields),
      templateValues: structuredClone(state.project.templateValues || {}),
    },
  };
  state.inbox.unshift(item);
  state.activeMomentId = item.id;
  state.currentMedia = [];
  return item;
}

export function confirmCandidate(state, inboxId) {
  const item = state.inbox.find((entry) => entry.id === inboxId);
  if (!item || item.status === 'confirmed') return null;
  const candidate = item.candidate || shapeInboxItem(state, inboxId);
  if (!candidate) return null;

  const record = {
    id: `record_${state.confirmedRecords.length + 1}`,
    templateId: candidate.templateId,
    projectName: candidate.projectName,
    createdAt: new Date().toISOString(),
    sourceNote: item.note,
    fields: structuredClone(candidate.fields),
    media: structuredClone(item.media || []),
    templateValues: structuredClone(candidate.templateValues || {}),
    evidenceRefs: [
      item.id,
      ...(item.media || []).map((media) => media.id),
      ...(item.audioEvidence?.audio?.id ? [item.audioEvidence.audio.id] : []),
    ],
  };
  item.status = 'confirmed';
  state.confirmedRecords.unshift(record);
  return record;
}

export function selectGlaze(state, glaze) {
  state.project.fields.glaze = glaze;
  const record = state.confirmedRecords.find(
    (entry) => entry.templateId === state.activeTemplateId && entry.fields.glaze === glaze,
  );
  if (!record) {
    state.recall = null;
    return null;
  }

  const recall = {
    record,
    reason: `因为你选择了${glaze}，找到了 1 条已确认记录。`,
  };
  state.recall = recall;
  return recall;
}

export function selectTemplate(state, templateId) {
  const template = state.templates.find((entry) => entry.id === templateId);
  if (!template) return null;
  stashCurrentProject(state);
  state.activeTemplateId = templateId;
  const draft = state.projectDrafts?.[templateId];
  if (draft) state.project = structuredClone(draft);
  else if (templateId === 'tpl_ceramic_glaze_v1') state.project = createCeramicProject();
  return template;
}

export function forkTemplate(state, templateId, name) {
  const source = state.templates.find((entry) => entry.id === templateId);
  if (!source) return null;
  const copy = {
    ...structuredClone(source),
    id: `tpl_user_${state.templates.length + 1}`,
    name,
    parentTemplateId: source.id,
    editable: true,
    subtitle: '我的模板',
  };
  state.templates.push(copy);
  return copy;
}

export function startProjectFromTemplate(state, templateId) {
  const template = state.templates.find((entry) => entry.id === templateId);
  if (!template) return null;
  stashCurrentProject(state);
  state.activeTemplateId = templateId;
  state.project = {
    id: `project_${Date.now()}`,
    templateId,
    name: `${template.name} · 新记录`,
    stage: '记录中',
    fields: { observation: '', result: '等待结果' },
    templateValues: Object.fromEntries(template.fields.map((label) => [label, ''])),
  };
  state.projectDrafts ||= {};
  state.projectDrafts[templateId] = structuredClone(state.project);
  state.recall = null;
  return state.project;
}

export function startVoiceFirstProject(state) {
  stashCurrentProject(state);
  let template = state.templates.find((entry) => entry.voiceFirst);
  if (!template) {
    template = {
      id: `tpl_voice_first_${state.templates.length + 1}`,
      name: '自由语音记录',
      subtitle: '先说再整理',
      fields: [],
      editable: true,
      voiceFirst: true,
    };
    state.templates.push(template);
  }
  state.activeTemplateId = template.id;
  state.project = {
    id: `project_voice_${Date.now()}`,
    templateId: template.id,
    name: '未命名创作记录',
    stage: '自由记录',
    captureMode: 'voice_first',
    fields: { observation: '', result: '等待整理' },
    templateValues: {},
  };
  state.projectDrafts ||= {};
  state.projectDrafts[template.id] = structuredClone(state.project);
  state.recall = null;
  return state.project;
}

function organizeVoiceNote(note) {
  const segments = note.split(/[，。；！？\n]+/).map((part) => part.trim()).filter(Boolean);
  const findAll = (pattern) => segments.filter((part) => pattern.test(part)).join('；');
  return {
    '材料与对象': findAll(/泥|釉|纸|颜料|玻璃|材料|木|金属|树脂|布|线|杯|器|作品/) || '等待确认',
    '做了什么': findAll(/用|加|刷|涂|换|烧|画|做|切|磨|覆盖|移动|拼|缝|调/) || '等待确认',
    '观察与变化': findAll(/感觉|看起来|变|厚|薄|扩散|堆积|裂|亮|暗|灰|流|干|湿/) || note,
    '模糊与不确定': findAll(/好像|有点|可能|不确定|不知道|说不上来|似乎/) || '没有单独识别，保留在原始口述中',
    '下一步': findAll(/下次|之后|准备|想试|再试|接下来/) || '等待补充',
  };
}

export function saveCandidateStructureAsTemplate(state, inboxId, name) {
  const item = state.inbox.find((entry) => entry.id === inboxId);
  if (!item?.candidate?.voiceOrganized) return null;
  if (item.candidate.savedTemplateId) {
    return state.templates.find((template) => template.id === item.candidate.savedTemplateId) || null;
  }
  const template = {
    id: `tpl_user_${state.templates.length + 1}`,
    name,
    subtitle: '我的模板',
    fields: Object.keys(item.candidate.templateValues),
    editable: true,
    parentTemplateId: item.candidate.templateId,
  };
  state.templates.push(template);
  item.candidate.savedTemplateId = template.id;
  return template;
}

export function updateTemplateProjectValue(state, label, value) {
  if (!state.project.templateValues || !(label in state.project.templateValues)) return null;
  state.project.templateValues[label] = value;
  if (label === '观察') state.project.fields.observation = value;
  if (label === '结果') state.project.fields.result = value;
  return value;
}

export function updateProjectField(state, key, value) {
  state.project.fields[key] = value;
  if (key === 'observation' && state.project.templateValues && '观察' in state.project.templateValues) {
    state.project.templateValues['观察'] = value;
  }
  return state.project.fields[key];
}

export function renameTemplateField(state, templateId, fieldIndex, name) {
  const template = state.templates.find((entry) => entry.id === templateId);
  if (!template?.editable || !template.fields[fieldIndex] || !name.trim()) return null;
  template.fields[fieldIndex] = name.trim();
  return template;
}

export function startNextProject(state) {
  state.project = {
    id: `project_${state.confirmedRecords.length + 1}`,
    templateId: 'tpl_ceramic_glaze_v1',
    name: '下一次蓝釉试片',
    stage: '上釉',
    fields: {
      clay: '白色石器泥',
      glaze: '',
      method: '浸釉',
      coats: '',
      firing: '待定',
      observation: '',
      result: '等待结果',
    },
  };
  state.recall = null;
  return state.project;
}

export function attachMedia(state, media) {
  state.currentMedia ||= [];
  if (state.currentMedia.some((item) => item.id === media.id)) return null;
  state.currentMedia.push(media);
  return media;
}

export function scheduleReminder(state, recordId, dueAt) {
  state.reminders ||= [];
  const reminder = {
    id: `reminder_${state.reminders.length + 1}`,
    recordId,
    dueAt,
    status: 'scheduled',
  };
  state.reminders.push(reminder);
  return reminder;
}

export function dueReminders(state, now = new Date().toISOString()) {
  return (state.reminders || []).filter(
    (reminder) => reminder.status === 'scheduled' && reminder.dueAt <= now,
  );
}

function nextExperimentFromNote(note) {
  const chineseNumbers = { '一': 1, '两': 2, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const match = note.match(/下次[^\d一两二三四五六七八九]*([\d一两二三四五六七八九]+)层/);
  if (!match) return '窑后回看并补充下次实验';
  const value = /^\d+$/.test(match[1]) ? match[1] : chineseNumbers[match[1]];
  return `尝试 ${value} 层`;
}

export function shapeInboxItem(state, inboxId) {
  const item = state.inbox.find((entry) => entry.id === inboxId);
  if (!item || item.status === 'confirmed') return null;
  if (item.candidate) {
    item.status = 'candidate_ready';
    return item.candidate;
  }
  const snapshot = item.projectSnapshot || {
    templateId: state.activeTemplateId,
    projectName: state.project.name,
    fields: structuredClone(state.project.fields),
  };
  const sourceTemplate = state.templates.find((template) => template.id === snapshot.templateId);
  const voiceOrganized = Boolean(sourceTemplate?.voiceFirst);
  item.candidate = {
    id: `candidate_${item.id}`,
    templateId: snapshot.templateId,
    projectName: snapshot.projectName,
    fields: {
      ...structuredClone(snapshot.fields),
      observation: item.note,
      nextExperiment: nextExperimentFromNote(item.note),
    },
    templateValues: voiceOrganized ? organizeVoiceNote(item.note) : structuredClone(snapshot.templateValues || {}),
    voiceOrganized,
  };
  item.status = 'candidate_ready';
  return item.candidate;
}

export function updateCandidateField(state, inboxId, key, value) {
  const item = state.inbox.find((entry) => entry.id === inboxId);
  if (!item?.candidate || item.status === 'confirmed') return null;
  item.candidate.fields[key] = value;
  return value;
}

export function updateCandidateTemplateValue(state, inboxId, label, value) {
  const item = state.inbox.find((entry) => entry.id === inboxId);
  if (!item?.candidate?.templateValues || item.status === 'confirmed') return null;
  item.candidate.templateValues[label] = value;
  return value;
}

export function deferCandidate(state, inboxId) {
  const item = state.inbox.find((entry) => entry.id === inboxId);
  if (!item?.candidate || item.status === 'confirmed') return null;
  item.status = 'deferred';
  return item;
}

export function discardInboxItem(state, inboxId) {
  const index = state.inbox.findIndex((entry) => entry.id === inboxId && entry.status !== 'confirmed');
  if (index < 0) return null;
  return state.inbox.splice(index, 1)[0];
}

export function beginVoiceCapture(state, { eventId, source = '电脑／USB 麦克风' }) {
  let targetInboxId = state.activeMomentId || state.inbox[0]?.id || null;
  if (!targetInboxId) {
    const item = leaveMoment(state, {
      eventId: `${eventId}_moment`,
      note: '语音记录整理中。',
    });
    targetInboxId = item?.id || null;
  }
  state.voiceCapture = {
    status: 'recording',
    source,
    targetInboxId,
    eventId,
    error: null,
  };
  return state.voiceCapture;
}

export function completeVoiceCapture(state, { eventId, transcript = '', audio = null }) {
  const targetInboxId = state.voiceCapture?.targetInboxId || state.activeMomentId;
  const item = state.inbox.find((entry) => entry.id === targetInboxId);
  if (!item) return null;
  const cleanTranscript = transcript.trim();
  item.audioEvidence = {
    id: `voice_${item.id}`,
    audio,
    transcript: cleanTranscript,
    source: state.voiceCapture?.source || '电脑／USB 麦克风',
    status: 'review_ready',
    startedEventId: state.voiceCapture?.eventId || null,
    stoppedEventId: eventId,
  };
  if (cleanTranscript) {
    item.note = cleanTranscript;
    if (state.project.fields) updateProjectField(state, 'observation', cleanTranscript);
    const sourceTemplate = state.templates.find(
      (template) => template.id === item.projectSnapshot?.templateId,
    );
    if (sourceTemplate?.voiceFirst) shapeInboxItem(state, item.id);
  }
  state.voiceCapture = {
    ...state.voiceCapture,
    status: 'review_ready',
    eventId,
    error: null,
  };
  return item;
}

export function failVoiceCapture(state, message) {
  state.voiceCapture = {
    ...state.voiceCapture,
    status: 'failed',
    error: message,
  };
  return state.voiceCapture;
}

export function updateVoiceTranscript(state, inboxId, transcript) {
  const item = state.inbox.find((entry) => entry.id === inboxId);
  if (!item?.audioEvidence) return null;
  item.audioEvidence.transcript = transcript;
  item.note = transcript;
  if (item.candidate && item.status !== 'confirmed') item.candidate.fields.observation = transcript;
  return transcript;
}

export function requestMeaningCandidate(state, recordId) {
  state.meaningCandidates ||= [];
  const record = state.confirmedRecords.find((entry) => entry.id === recordId);
  if (!record) return null;
  const existing = state.meaningCandidates.find(
    (entry) => entry.recordId === recordId && entry.status !== 'discarded',
  );
  if (existing) return existing;
  const candidate = {
    id: `meaning_${state.meaningCandidates.length + 1}`,
    recordId,
    reflectionQuestion: '你为什么决定先减少层数？',
    candidateMeaning: '我会先用更小的变量变化验证材料边界。',
    evidenceRefs: [record.id],
    privacyIntent: 'confirmed_fact_only',
    status: 'awaiting_confirmation',
  };
  state.meaningCandidates.unshift(candidate);
  record.meaningCandidateId = candidate.id;
  return candidate;
}

export function updateMeaningCandidate(state, candidateId, key, value) {
  const candidate = (state.meaningCandidates || []).find((entry) => entry.id === candidateId);
  if (!candidate || candidate.status === 'confirmed') return null;
  if (!['reflectionQuestion', 'candidateMeaning'].includes(key)) return null;
  candidate[key] = value;
  return value;
}

export function confirmMeaningCandidate(state, candidateId) {
  const candidate = (state.meaningCandidates || []).find((entry) => entry.id === candidateId);
  if (!candidate || candidate.status === 'confirmed') return null;
  state.confirmedPrinciples ||= [];
  const principle = {
    id: `principle_${state.confirmedPrinciples.length + 1}`,
    recordId: candidate.recordId,
    text: candidate.candidateMeaning,
    evidenceRefs: structuredClone(candidate.evidenceRefs),
    confirmedAt: new Date().toISOString(),
  };
  candidate.status = 'confirmed';
  state.confirmedPrinciples.unshift(principle);
  return principle;
}

export function deferMeaningCandidate(state, candidateId) {
  const candidate = (state.meaningCandidates || []).find((entry) => entry.id === candidateId);
  if (!candidate || candidate.status === 'confirmed') return null;
  candidate.status = 'deferred';
  return candidate;
}

export function discardMeaningCandidate(state, candidateId) {
  const candidate = (state.meaningCandidates || []).find((entry) => entry.id === candidateId);
  if (!candidate || candidate.status === 'confirmed') return null;
  candidate.status = 'discarded';
  return candidate;
}
