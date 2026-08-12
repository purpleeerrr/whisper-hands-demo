import test from 'node:test';
import assert from 'node:assert/strict';

import * as demoState from '../app/state.js';
import { renderApp } from '../app/view.js';

test('starts a usable project from an edited template copy', () => {
  assert.equal(typeof demoState.startProjectFromTemplate, 'function');
  const state = demoState.createDemoState();
  const copy = demoState.forkTemplate(state, 'tpl_watercolor_v1', '我的水彩配色实验');
  demoState.renameTemplateField(state, copy.id, 0, '棉浆纸');

  const project = demoState.startProjectFromTemplate(state, copy.id);

  assert.equal(state.activeTemplateId, copy.id);
  assert.equal(project.templateId, copy.id);
  assert.deepEqual(Object.keys(project.templateValues), copy.fields);
  assert.equal(project.name, '我的水彩配色实验 · 新记录');
});

test('captures edited template values in the process inbox', () => {
  const state = demoState.createDemoState();
  const copy = demoState.forkTemplate(state, 'tpl_watercolor_v1', '我的水彩配色实验');
  demoState.startProjectFromTemplate(state, copy.id);
  demoState.updateTemplateProjectValue(state, '纸张', '300g 棉浆纸');
  demoState.updateTemplateProjectValue(state, '配色', '群青 + 赭石');

  const item = demoState.leaveMoment(state, { eventId: 'evt_watercolor_1', note: '边缘扩散得很快。' });

  assert.equal(item.projectSnapshot.templateId, copy.id);
  assert.equal(item.projectSnapshot.templateValues['纸张'], '300g 棉浆纸');
  assert.equal(item.projectSnapshot.templateValues['配色'], '群青 + 赭石');
});

test('renders a start action for a copied template and a usable generic workbench after starting', () => {
  const state = demoState.createDemoState();
  const copy = demoState.forkTemplate(state, 'tpl_watercolor_v1', '我的水彩配色实验');
  demoState.selectTemplate(state, copy.id);

  assert.match(renderApp(state), /用这个模板开始记录/);

  demoState.startProjectFromTemplate(state, copy.id);
  const html = renderApp(state);
  assert.match(html, /当前工作台/);
  assert.match(html, /data-template-value="纸张"/);
  assert.match(html, /短按留画面/);
  assert.match(html, /长按说观察/);
});

test('offers a voice-first path without requiring fields up front', () => {
  assert.equal(typeof demoState.startVoiceFirstProject, 'function');
  const state = demoState.createDemoState();

  assert.match(renderApp(state), /直接开始说/);
  const project = demoState.startVoiceFirstProject(state);
  const html = renderApp(state);

  assert.equal(project.captureMode, 'voice_first');
  assert.deepEqual(project.templateValues, {});
  assert.match(html, /先把想到的全部说出来/);
  assert.match(html, /长按说完整记录/);
  assert.match(html, /用演示口述体验/);
});

test('organizes a free voice dump into editable candidate fields after capture', () => {
  const state = demoState.createDemoState();
  demoState.startVoiceFirstProject(state);
  const note = '我用了白色石器泥，刚刚刷了三层蓝釉。杯沿好像有点太厚，我也说不上来，下次想先试两层。';
  const item = demoState.leaveMoment(state, { eventId: 'evt_voice_first_1', note });

  const candidate = demoState.shapeInboxItem(state, item.id);

  assert.equal(candidate.voiceOrganized, true);
  assert.equal(candidate.fields.observation, note);
  assert.match(candidate.templateValues['材料与对象'], /白色石器泥/);
  assert.match(candidate.templateValues['模糊与不确定'], /好像|说不上来/);
  assert.match(candidate.templateValues['下一步'], /下次/);
});

test('lets the creator reuse the organized voice structure as an editable template', () => {
  assert.equal(typeof demoState.saveCandidateStructureAsTemplate, 'function');
  const state = demoState.createDemoState();
  demoState.startVoiceFirstProject(state);
  const item = demoState.leaveMoment(state, { eventId: 'evt_voice_template_1', note: '我换了纸张，颜色好像更灰，下次想少加一点水。' });
  demoState.shapeInboxItem(state, item.id);

  const template = demoState.saveCandidateStructureAsTemplate(state, item.id, '我的自由实验模板');
  const repeated = demoState.saveCandidateStructureAsTemplate(state, item.id, '重复名称不会生效');

  assert.equal(template.editable, true);
  assert.deepEqual(template.fields, Object.keys(item.candidate.templateValues));
  assert.equal(repeated.id, template.id);
  assert.equal(state.templates.filter((entry) => entry.id === template.id).length, 1);
  assert.equal(item.candidate.savedTemplateId, template.id);
  assert.match(renderApp(state), /我的自由实验模板/);
});

test('can return from free voice recording to a usable ceramic workbench', () => {
  const state = demoState.createDemoState();
  demoState.startVoiceFirstProject(state);

  demoState.selectTemplate(state, 'tpl_ceramic_glaze_v1');
  const html = renderApp(state);

  assert.equal(state.project.templateId, 'tpl_ceramic_glaze_v1');
  assert.equal(state.project.name, '蓝色杯子试片');
  assert.equal(state.project.fields.clay, '白色石器泥');
  assert.match(html, /蓝色杯子试片/);
  assert.doesNotMatch(html, /value="undefined"/);
});

test('restores each template project draft when switching between templates', () => {
  const state = demoState.createDemoState();
  demoState.startVoiceFirstProject(state);
  const voiceProjectId = state.project.id;
  demoState.selectTemplate(state, 'tpl_ceramic_glaze_v1');
  demoState.selectTemplate(state, state.templates.find((template) => template.voiceFirst).id);

  assert.equal(state.project.id, voiceProjectId);
  assert.equal(state.project.captureMode, 'voice_first');
});
