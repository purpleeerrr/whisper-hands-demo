import test from 'node:test';
import assert from 'node:assert/strict';

import { createDemoState, leaveMoment, confirmCandidate } from '../app/state.js';
import { exportRecords, loadState, saveState } from '../app/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test('restores a saved local demo state after a page reload', () => {
  const storage = memoryStorage();
  const state = createDemoState();
  leaveMoment(state, { eventId: 'evt_persist_001', note: '第三层釉料在杯沿堆积。' });
  saveState(storage, state);

  const restored = loadState(storage, createDemoState());

  assert.equal(restored.inbox.length, 1);
  assert.equal(restored.inbox[0].note, '第三层釉料在杯沿堆积。');
});

test('exports confirmed practice records without unconfirmed inbox content', () => {
  const state = createDemoState();
  leaveMoment(state, { eventId: 'evt_export_001', note: '第三层釉料在杯沿堆积。' });
  confirmCandidate(state, state.inbox[0].id);
  leaveMoment(state, { eventId: 'evt_export_002', note: '这条仍留在收件箱。' });

  const archive = JSON.parse(exportRecords(state));

  assert.equal(archive.records.length, 1);
  assert.equal(archive.records[0].sourceNote, '第三层釉料在杯沿堆积。');
  assert.equal('inbox' in archive, false);
});

test('fills new media, reminder, vision and device fields when an older demo state is restored', () => {
  const storage = memoryStorage();
  const olderState = createDemoState();
  delete olderState.currentMedia;
  delete olderState.reminders;
  delete olderState.activeReminder;
  delete olderState.visualMatches;
  delete olderState.device;
  delete olderState.projectDrafts;
  storage.setItem('whisper-hands-demo-v1', JSON.stringify(olderState));

  const restored = loadState(storage, createDemoState());

  assert.deepEqual(restored.currentMedia, []);
  assert.deepEqual(restored.reminders, []);
  assert.deepEqual(restored.visualMatches, []);
  assert.deepEqual(restored.device, { status: 'disconnected', label: '等待连接' });
  assert.equal(restored.projectDrafts[restored.project.templateId].name, restored.project.name);
});

test('reports a local storage quota failure without throwing', () => {
  const storage = {
    setItem() { throw new Error('QuotaExceededError'); },
  };

  assert.equal(saveState(storage, createDemoState()), false);
});
