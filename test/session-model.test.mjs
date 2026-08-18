import test from 'node:test';
import assert from 'node:assert/strict';

import { SessionModel, SESSION_STATES } from '../app/session-model.js';

test('VIDEO_TOGGLE starts, pauses, and resumes one session', () => {
  let now = 1_000;
  const model = new SessionModel({ now: () => now });

  model.apply('VIDEO_TOGGLE');
  assert.equal(model.state, SESSION_STATES.RECORDING);
  assert.equal(model.startedAt, 1_000);

  now = 2_000;
  model.apply('VIDEO_TOGGLE');
  assert.equal(model.state, SESSION_STATES.PAUSED);

  now = 3_000;
  model.apply('VIDEO_TOGGLE');
  assert.equal(model.state, SESSION_STATES.RECORDING);
});

test('audio marks record one priority interval without creating another recording', () => {
  let now = 10_000;
  const model = new SessionModel({ now: () => now });
  model.apply('VIDEO_TOGGLE');

  now = 12_000;
  model.apply('AUDIO_MARK_START');
  assert.equal(model.activeAudioMark.startedAtMs, 2_000);

  now = 15_500;
  model.apply('AUDIO_MARK_STOP');
  assert.equal(model.activeAudioMark, null);
  assert.deepEqual(model.audioMarks, [{ startedAtMs: 2_000, endedAtMs: 5_500 }]);
  assert.equal(model.state, SESSION_STATES.RECORDING);
});

test('finishing closes an open audio mark and completes the session', () => {
  let now = 100;
  const model = new SessionModel({ now: () => now });
  model.apply('VIDEO_TOGGLE');
  now = 600;
  model.apply('AUDIO_MARK_START');
  now = 2_100;
  model.apply('VIDEO_FINISH');

  assert.equal(model.state, SESSION_STATES.COMPLETE);
  assert.equal(model.durationMs, 2_000);
  assert.deepEqual(model.audioMarks, [{ startedAtMs: 500, endedAtMs: 2_000 }]);
});

test('snapshot and audio commands are ignored before a session starts', () => {
  const model = new SessionModel({ now: () => 500 });

  assert.equal(model.apply('SNAPSHOT').accepted, false);
  assert.equal(model.apply('AUDIO_MARK_START').accepted, false);
  assert.equal(model.events.length, 0);
});

test('MODE accepts only values 1 through 4', () => {
  const model = new SessionModel();

  assert.equal(model.apply('MODE', { mode: 3 }).accepted, true);
  assert.equal(model.mode, 3);
  assert.equal(model.apply('MODE', { mode: 7 }).accepted, false);
  assert.equal(model.mode, 3);
});

test('paused time is excluded from elapsed session time', () => {
  let now = 1_000;
  const model = new SessionModel({ now: () => now });
  model.apply('VIDEO_TOGGLE');
  now = 3_000;
  model.apply('VIDEO_TOGGLE');
  now = 8_000;
  assert.equal(model.elapsedAt(), 2_000);
  model.apply('VIDEO_TOGGLE');
  now = 10_000;
  model.apply('VIDEO_FINISH');
  assert.equal(model.durationMs, 4_000);
});
