import test from 'node:test';
import assert from 'node:assert/strict';

import * as demoState from '../app/state.js';
import { renderApp } from '../app/view.js';

test('starts a voice observation for the latest captured moment', () => {
  assert.equal(typeof demoState.beginVoiceCapture, 'function');
  const state = demoState.createDemoState();
  const item = demoState.leaveMoment(state, { eventId: 'evt_mark_voice_1', note: '' });

  const capture = demoState.beginVoiceCapture(state, {
    eventId: 'evt_voice_start_1',
    source: '电脑／USB 麦克风',
  });

  assert.equal(capture.status, 'recording');
  assert.equal(capture.targetInboxId, item.id);
  assert.equal(capture.source, '电脑／USB 麦克风');
});

test('keeps raw audio and transcript on the same inbox item', () => {
  assert.equal(typeof demoState.completeVoiceCapture, 'function');
  const state = demoState.createDemoState();
  const item = demoState.leaveMoment(state, { eventId: 'evt_mark_voice_2', note: '' });
  demoState.beginVoiceCapture(state, {
    eventId: 'evt_voice_start_2',
    source: '电脑／USB 麦克风',
  });

  const completed = demoState.completeVoiceCapture(state, {
    eventId: 'evt_voice_stop_2',
    transcript: '第三层釉料在杯沿堆积，下次先试两层。',
    audio: {
      id: 'audio_001',
      type: 'audio',
      url: 'data:audio/webm;base64,AAAA',
      mimeType: 'audio/webm',
    },
  });

  assert.equal(completed.id, item.id);
  assert.equal(completed.audioEvidence.audio.id, 'audio_001');
  assert.equal(completed.audioEvidence.transcript, '第三层釉料在杯沿堆积，下次先试两层。');
  assert.equal(completed.audioEvidence.status, 'review_ready');
  assert.equal(completed.note, '第三层釉料在杯沿堆积，下次先试两层。');
});

test('lets the user edit a transcript without changing the raw audio', () => {
  assert.equal(typeof demoState.updateVoiceTranscript, 'function');
  const state = demoState.createDemoState();
  const item = demoState.leaveMoment(state, { eventId: 'evt_mark_voice_3', note: '' });
  demoState.beginVoiceCapture(state, { eventId: 'evt_voice_start_3', source: '电脑／USB 麦克风' });
  demoState.completeVoiceCapture(state, {
    eventId: 'evt_voice_stop_3',
    transcript: '杯沿堆积。',
    audio: { id: 'audio_002', type: 'audio', url: 'data:audio/webm;base64,BBBB' },
  });

  demoState.updateVoiceTranscript(state, item.id, '杯沿堆积明显，窑后回看。');

  assert.equal(item.note, '杯沿堆积明显，窑后回看。');
  assert.equal(item.audioEvidence.transcript, '杯沿堆积明显，窑后回看。');
  assert.equal(item.audioEvidence.audio.id, 'audio_002');
});

test('renders voice-first controls and the real capture source', () => {
  const state = demoState.createDemoState();
  const html = renderApp(state);

  assert.match(html, /短按留画面/);
  assert.match(html, /长按说观察/);
  assert.match(html, /电脑／USB 麦克风采集/);
  assert.match(html, /data-action="hold-to-talk"/);
});

test('creates a moment automatically when free voice recording starts first', () => {
  const state = demoState.createDemoState();
  demoState.startVoiceFirstProject(state);

  const capture = demoState.beginVoiceCapture(state, {
    eventId: 'evt_voice_first_start',
    source: '电脑／USB 麦克风',
  });

  assert.equal(state.inbox.length, 1);
  assert.equal(capture.targetInboxId, state.inbox[0].id);
  assert.equal(state.inbox[0].note, '语音记录整理中。');
});

test('automatically organizes a completed free voice transcript into a candidate', () => {
  const state = demoState.createDemoState();
  demoState.startVoiceFirstProject(state);
  demoState.beginVoiceCapture(state, {
    eventId: 'evt_voice_first_auto_start',
    source: '电脑／USB 麦克风',
  });

  const completed = demoState.completeVoiceCapture(state, {
    eventId: 'evt_voice_first_auto_stop',
    transcript: '我用了白色石器泥，杯沿好像有点厚，下次想先试两层。',
    audio: null,
  });

  assert.equal(completed.status, 'candidate_ready');
  assert.equal(completed.candidate.voiceOrganized, true);
  assert.match(completed.candidate.templateValues['材料与对象'], /白色石器泥/);
  assert.match(completed.candidate.templateValues['下一步'], /下次/);
});
