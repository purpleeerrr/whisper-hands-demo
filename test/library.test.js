import test from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmCandidate,
  confirmMeaningCandidate,
  createDemoState,
  leaveMoment,
  requestMeaningCandidate,
  shapeInboxItem,
} from '../app/state.js';
import { renderApp } from '../app/view.js';

test('renders the personal library as facts, principles and recall cues', () => {
  const html = renderApp(createDemoState());

  assert.match(html, /个人实验库/);
  assert.match(html, /data-library-layer="facts"/);
  assert.match(html, /data-library-layer="principles"/);
  assert.match(html, /data-library-layer="recall"/);
  assert.match(html, /事实记录/);
  assert.match(html, /创作原则/);
  assert.match(html, /找回线索/);
});

test('places confirmed facts and confirmed principles in separate layers', () => {
  const state = createDemoState();
  const item = leaveMoment(state, {
    eventId: 'evt_library_layers',
    note: '第三层釉料在杯沿堆积，下次先试两层。',
  });
  shapeInboxItem(state, item.id);
  const record = confirmCandidate(state, item.id);
  const meaning = requestMeaningCandidate(state, record.id);
  confirmMeaningCandidate(state, meaning.id);

  const html = renderApp(state);

  assert.match(html, /蓝色杯子试片/);
  assert.match(html, /我会先用更小的变量变化验证材料边界/);
  assert.match(html, /陶艺釉料测试 → 蓝色杯子试片/);
});
