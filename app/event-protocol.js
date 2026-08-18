export const ALLOWED_EVENTS = Object.freeze([
  'VIDEO_TOGGLE',
  'SNAPSHOT',
  'AUDIO_MARK_START',
  'AUDIO_MARK_STOP',
  'VIDEO_FINISH',
  'MODE',
]);

const ALLOWED_EVENT_SET = new Set(ALLOWED_EVENTS);

export function normalizeHardwareEvent(input, now = Date.now) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('hardware event body must be an object');
  }

  const deviceId = String(input.deviceId || '').trim();
  if (!deviceId) throw new TypeError('deviceId is required');

  const event = String(input.event || '').trim().toUpperCase();
  if (!ALLOWED_EVENT_SET.has(event)) {
    throw new TypeError(`unsupported event: ${event || '(empty)'}`);
  }

  const seq = Number(input.seq);
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new TypeError('seq must be a non-negative integer');
  }

  const suppliedTs = Number(input.ts);
  const ts = Number.isFinite(suppliedTs) && suppliedTs > 0 ? suppliedTs : now();
  const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? { ...input.payload }
    : {};

  return { deviceId, event, seq, ts, payload };
}
