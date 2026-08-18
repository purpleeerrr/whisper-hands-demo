import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSessionRecord, formatClock, selectRecorderMimeType } from '../app/session-record.js';

test('builds the minimum persistent session record with real media blobs', () => {
  const videoBlob = new Blob(['video'], { type: 'video/webm' });
  const imageBlob = new Blob(['image'], { type: 'image/png' });
  const model = {
    state: 'COMPLETE',
    startedAt: 1_000,
    completedAt: 9_000,
    durationMs: 8_000,
    audioMarks: [{ startedAtMs: 2_000, endedAtMs: 4_000 }],
    events: [{ event: 'SNAPSHOT', atMs: 3_000 }],
  };

  const record = buildSessionRecord({
    sessionId: 'session-test',
    templateId: 'ceramic-glaze-test',
    model,
    videoBlob,
    snapshots: [{ id: 'shot-1', atMs: 3_000, blob: imageBlob }],
    transcript: [{ atMs: 2_500, text: '杯沿的釉有点厚', priority: true }],
  });

  assert.equal(record.sessionId, 'session-test');
  assert.equal(record.status, 'complete');
  assert.equal(record.videoBlob, videoBlob);
  assert.equal(record.snapshots[0].blob, imageBlob);
  assert.equal(record.transcript[0].priority, true);
  assert.deepEqual(record.audioMarks, model.audioMarks);
});

test('refuses to build an incomplete session record', () => {
  assert.throws(
    () => buildSessionRecord({ model: { state: 'RECORDING' }, videoBlob: new Blob() }),
    /complete/i,
  );
});

test('selects the first browser-supported WebM format', () => {
  const supported = new Set(['video/webm;codecs=vp8,opus', 'video/webm']);
  const MediaRecorderCtor = { isTypeSupported: (type) => supported.has(type) };
  assert.equal(selectRecorderMimeType(MediaRecorderCtor), 'video/webm;codecs=vp8,opus');
});

test('formats session time as mm:ss', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(65_400), '01:05');
});
