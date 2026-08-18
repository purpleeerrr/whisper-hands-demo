const MIME_CANDIDATES = Object.freeze([
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]);

export function selectRecorderMimeType(MediaRecorderCtor = globalThis.MediaRecorder) {
  if (!MediaRecorderCtor) return '';
  return MIME_CANDIDATES.find((type) => MediaRecorderCtor.isTypeSupported?.(type)) || '';
}

export function formatClock(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function buildSessionRecord({
  sessionId = `session_${Date.now()}`,
  templateId = 'ceramic-glaze-test',
  model,
  videoBlob,
  snapshots = [],
  transcript = [],
  title = '蓝色杯子试片',
}) {
  if (!model || model.state !== 'COMPLETE') throw new TypeError('session must be complete before it is saved');
  if (!(videoBlob instanceof Blob)) throw new TypeError('videoBlob is required');

  return {
    sessionId,
    templateId,
    title,
    status: 'complete',
    startedAt: model.startedAt,
    completedAt: model.completedAt,
    durationMs: model.durationMs,
    videoBlob,
    snapshots: snapshots.map((item) => ({ ...item })),
    audioMarks: model.audioMarks.map((item) => ({ ...item })),
    transcript: transcript.map((item) => ({ ...item })),
    events: model.events.map((item) => ({ ...item })),
    savedAt: Date.now(),
  };
}
