import test from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmCandidate,
  createDemoState,
  deferCandidate,
  discardInboxItem,
  leaveMoment,
  shapeInboxItem,
  updateCandidateField,
  updateProjectField,
} from '../app/state.js';
import { renderApp } from '../app/view.js';

test('shapes an inbox item from the project snapshot captured at that moment', () => {
  const state = createDemoState();
  const item = leaveMoment(state, {
    eventId: 'evt_candidate_1',
    note: '第三层釉料在杯沿堆积，下次先试两层。',
  });
  updateProjectField(state, 'glaze', '月白透明釉');

  const candidate = shapeInboxItem(state, item.id);

  assert.equal(item.status, 'candidate_ready');
  assert.equal(candidate.fields.glaze, '深海蓝透明釉');
  assert.equal(candidate.fields.observation, '第三层釉料在杯沿堆积，下次先试两层。');
  assert.equal(candidate.fields.nextExperiment, '尝试 2 层');
});

test('stores the user-edited candidate in the personal practice library', () => {
  const state = createDemoState();
  const item = leaveMoment(state, { eventId: 'evt_candidate_2', note: '杯沿堆积。' });
  shapeInboxItem(state, item.id);

  updateCandidateField(state, item.id, 'observation', '杯沿堆积明显，窑后回看。');
  updateCandidateField(state, item.id, 'result', '等待烧制');
  const record = confirmCandidate(state, item.id);

  assert.equal(record.fields.observation, '杯沿堆积明显，窑后回看。');
  assert.equal(record.fields.result, '等待烧制');
  assert.equal(item.status, 'confirmed');
});

test('lets the user defer or delete a candidate before it enters the library', () => {
  const state = createDemoState();
  const first = leaveMoment(state, { eventId: 'evt_candidate_3', note: '稍后再整理。' });
  shapeInboxItem(state, first.id);

  deferCandidate(state, first.id);

  assert.equal(first.status, 'deferred');
  assert.equal(state.confirmedRecords.length, 0);

  discardInboxItem(state, first.id);

  assert.equal(state.inbox.length, 0);
  assert.equal(state.confirmedRecords.length, 0);
});

test('renders an editable candidate with confirm, later and delete actions', () => {
  const state = createDemoState();
  const item = leaveMoment(state, { eventId: 'evt_candidate_4', note: '杯沿堆积。' });
  shapeInboxItem(state, item.id);

  const html = renderApp(state);

  assert.match(html, /候选记录/);
  assert.match(html, /data-candidate-field="observation"/);
  assert.match(html, /确认入库/);
  assert.match(html, /稍后处理/);
  assert.match(html, /删除记录/);
});
