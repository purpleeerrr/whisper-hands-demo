import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_EVENTS,
  normalizeHardwareEvent,
} from '../app/event-protocol.js';

test('accepts and normalizes a valid ESP32 event', () => {
  const event = normalizeHardwareEvent({
    deviceId: 'whisper-hands-esp32',
    event: 'snapshot',
    seq: 12,
    ts: 1786765200000,
  });

  assert.equal(event.deviceId, 'whisper-hands-esp32');
  assert.equal(event.event, 'SNAPSHOT');
  assert.equal(event.seq, 12);
  assert.equal(event.ts, 1786765200000);
  assert.deepEqual(event.payload, {});
});

test('rejects an unsupported hardware event', () => {
  assert.throws(
    () => normalizeHardwareEvent({ deviceId: 'esp32', event: 'DELETE_ALL', seq: 1 }),
    /unsupported event/i,
  );
});

test('rejects missing device IDs and invalid sequence numbers', () => {
  assert.throws(
    () => normalizeHardwareEvent({ event: 'SNAPSHOT', seq: 1 }),
    /deviceId/i,
  );
  assert.throws(
    () => normalizeHardwareEvent({ deviceId: 'esp32', event: 'SNAPSHOT', seq: -1 }),
    /seq/i,
  );
});

test('publishes exactly the roadshow event contract', () => {
  assert.deepEqual([...ALLOWED_EVENTS], [
    'VIDEO_TOGGLE',
    'SNAPSHOT',
    'AUDIO_MARK_START',
    'AUDIO_MARK_STOP',
    'VIDEO_FINISH',
    'MODE',
  ]);
});
