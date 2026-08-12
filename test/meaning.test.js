import test from 'node:test';
import assert from 'node:assert/strict';

import * as demoState from '../app/state.js';
import { renderApp } from '../app/view.js';

function confirmedRecordState() {
  const state = demoState.createDemoState();
  const item = demoState.leaveMoment(state, {
    eventId: 'evt_meaning_fact',
    note: '第三层釉料在杯沿堆积，下次先试两层。',
  });
  demoState.shapeInboxItem(state, item.id);
  const record = demoState.confirmCandidate(state, item.id);
  return { state, item, record };
}

test('refuses to create meaning from an unconfirmed inbox item', () => {
  assert.equal(typeof demoState.requestMeaningCandidate, 'function');
  const state = demoState.createDemoState();
  const item = demoState.leaveMoment(state, { eventId: 'evt_unconfirmed', note: '一条观察。' });

  const candidate = demoState.requestMeaningCandidate(state, item.id);

  assert.equal(candidate, null);
  assert.equal(state.meaningCandidates.length, 0);
});

test('creates one evidence-grounded meaning candidate after fact confirmation', () => {
  const { state, record } = confirmedRecordState();

  const candidate = demoState.requestMeaningCandidate(state, record.id);

  assert.equal(candidate.recordId, record.id);
  assert.equal(candidate.status, 'awaiting_confirmation');
  assert.match(candidate.reflectionQuestion, /为什么/);
  assert.match(candidate.candidateMeaning, /变量/);
  assert.deepEqual(candidate.evidenceRefs, [record.id]);
});

test('stores a meaning only after the user confirms it', () => {
  assert.equal(typeof demoState.confirmMeaningCandidate, 'function');
  const { state, record } = confirmedRecordState();
  const candidate = demoState.requestMeaningCandidate(state, record.id);
  demoState.updateMeaningCandidate(state, candidate.id, 'candidateMeaning', '我会先改变一个变量，再比较结果。');

  const principle = demoState.confirmMeaningCandidate(state, candidate.id);

  assert.equal(principle.text, '我会先改变一个变量，再比较结果。');
  assert.equal(candidate.status, 'confirmed');
  assert.equal(state.confirmedPrinciples.length, 1);
});

test('shows the meaning action only on confirmed records', () => {
  const emptyState = demoState.createDemoState();
  assert.doesNotMatch(renderApp(emptyState), /提炼这次意义/);

  const { state } = confirmedRecordState();
  const html = renderApp(state);
  assert.match(html, /提炼这次意义/);
  assert.match(html, /只使用这条已确认事实/);
});
