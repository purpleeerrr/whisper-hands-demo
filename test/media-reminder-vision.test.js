import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachMedia,
  confirmCandidate,
  createDemoState,
  dueReminders,
  leaveMoment,
  scheduleReminder,
} from '../app/state.js';
import { hammingDistance, rankByVisualHash } from '../app/vision.js';

test('carries attached image and video evidence into a confirmed record', () => {
  const state = createDemoState();
  attachMedia(state, { id: 'media_1', type: 'image', url: 'data:image/jpeg;base64,abc', hash: '1010' });
  attachMedia(state, { id: 'media_2', type: 'video', url: 'data:video/webm;base64,xyz' });

  const item = leaveMoment(state, { eventId: 'evt_media_1', note: '记录杯沿变化。' });
  const record = confirmCandidate(state, item.id);

  assert.equal(item.media.length, 2);
  assert.equal(record.media[0].hash, '1010');
  assert.equal(state.currentMedia.length, 0);
});

test('returns a scheduled reminder only after its due time', () => {
  const state = createDemoState();
  state.confirmedRecords.push({ id: 'record_1', projectName: '蓝色杯子试片', fields: {} });
  scheduleReminder(state, 'record_1', '2026-08-12T10:00:05.000Z');

  assert.equal(dueReminders(state, '2026-08-12T10:00:04.000Z').length, 0);
  assert.equal(dueReminders(state, '2026-08-12T10:00:06.000Z').length, 1);
});

test('ranks confirmed images by perceptual hash distance', () => {
  const records = [
    { id: 'near', media: [{ type: 'image', hash: '11110000' }] },
    { id: 'far', media: [{ type: 'image', hash: '00001111' }] },
  ];

  assert.equal(hammingDistance('11110000', '11110001'), 1);
  assert.equal(rankByVisualHash(records, '11110001')[0].record.id, 'near');
});
