import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDemoState,
  leaveMoment,
  confirmCandidate,
  selectGlaze,
  selectTemplate,
  forkTemplate,
  updateProjectField,
  renameTemplateField,
  startNextProject,
} from '../app/state.js';

test('ships the three official templates and opens the ceramic template', () => {
  const state = createDemoState();

  assert.equal(state.templates.length, 3);
  assert.equal(state.activeTemplateId, 'tpl_ceramic_glaze_v1');
  assert.equal(state.project.fields.glaze, '深海蓝透明釉');
});

test('keeps a repeated device event as one inbox item', () => {
  const state = createDemoState();

  leaveMoment(state, { eventId: 'evt_001', note: '第三层釉料在杯沿堆积，下次先试两层。' });
  leaveMoment(state, { eventId: 'evt_001', note: '第三层釉料在杯沿堆积，下次先试两层。' });

  assert.equal(state.inbox.length, 1);
  assert.equal(state.inbox[0].status, 'ready_to_shape');
});

test('shows a recall only after a candidate is confirmed and the glaze is selected', () => {
  const state = createDemoState();
  leaveMoment(state, { eventId: 'evt_002', note: '第三层釉料在杯沿堆积，下次先试两层。' });

  assert.equal(selectGlaze(state, '深海蓝透明釉'), null);

  confirmCandidate(state, state.inbox[0].id);
  const recall = selectGlaze(state, '深海蓝透明釉');

  assert.equal(recall.reason, '因为你选择了深海蓝透明釉，找到了 1 条已确认记录。');
  assert.equal(recall.record.fields.coats, 3);
});

test('opens a different official template and lets the user fork it into an editable copy', () => {
  const state = createDemoState();

  selectTemplate(state, 'tpl_watercolor_v1');
  const copy = forkTemplate(state, 'tpl_watercolor_v1', '我的雨天蓝调');

  assert.equal(state.activeTemplateId, 'tpl_watercolor_v1');
  assert.equal(copy.parentTemplateId, 'tpl_watercolor_v1');
  assert.equal(copy.name, '我的雨天蓝调');
  assert.equal(copy.editable, true);
});

test('updates a project field without creating a record', () => {
  const state = createDemoState();

  updateProjectField(state, 'coats', '2');

  assert.equal(state.project.fields.coats, '2');
  assert.equal(state.inbox.length, 0);
  assert.equal(state.confirmedRecords.length, 0);
});

test('allows a copied template to rename its own field without changing the official template', () => {
  const state = createDemoState();
  const copy = forkTemplate(state, 'tpl_watercolor_v1', '我的雨天蓝调');

  renameTemplateField(state, copy.id, 0, '棉浆纸');

  assert.equal(copy.fields[0], '棉浆纸');
  assert.equal(state.templates.find((template) => template.id === 'tpl_watercolor_v1').fields[0], '纸张');
});

test('starts a new ceramic project with an empty glaze so past records can be recalled on a new selection', () => {
  const state = createDemoState();
  leaveMoment(state, { eventId: 'evt_003', note: '第三层釉料在杯沿堆积，下次先试两层。' });
  confirmCandidate(state, state.inbox[0].id);

  startNextProject(state);
  const recall = selectGlaze(state, '深海蓝透明釉');

  assert.equal(state.project.name, '下一次蓝釉试片');
  assert.equal(recall.record.projectName, '蓝色杯子试片');
});
