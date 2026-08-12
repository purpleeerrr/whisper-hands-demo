import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDeviceLine } from '../app/hardware.js';

test('accepts the newline JSON event sent by the AI Keyboard', () => {
  const event = parseDeviceLine('{"event_id":"evt_board_1","type":"MARK_PRESSED"}');

  assert.equal(event.eventId, 'evt_board_1');
  assert.equal(event.type, 'MARK_PRESSED');
});

test('accepts a simple MARK line as a low-friction firmware fallback', () => {
  const event = parseDeviceLine('MARK');

  assert.equal(event.type, 'MARK_PRESSED');
  assert.match(event.eventId, /^evt_serial_/);
});

test('rejects unrelated serial output', () => {
  assert.equal(parseDeviceLine('booting...'), null);
});

test('accepts voice start and stop events for press-and-hold input', () => {
  const started = parseDeviceLine('VOICE_START');
  const stopped = parseDeviceLine('VOICE_STOP');

  assert.equal(started.type, 'VOICE_CAPTURE_STARTED');
  assert.equal(stopped.type, 'VOICE_CAPTURE_STOPPED');
});

test('keeps voice event types sent as JSON', () => {
  const event = parseDeviceLine('{"event_id":"evt_voice_board","type":"VOICE_CAPTURE_STARTED"}');

  assert.equal(event.eventId, 'evt_voice_board');
  assert.equal(event.type, 'VOICE_CAPTURE_STARTED');
});
