import test from 'node:test';
import assert from 'node:assert/strict';

import { createDemoState, leaveMoment, confirmCandidate, selectGlaze, selectTemplate } from '../app/state.js';
import { renderApp } from '../app/view.js';

test('renders the workbench with the ceramic project and a leave-moment action', () => {
  const html = renderApp(createDemoState());

  assert.match(html, /蓝色杯子试片/);
  assert.match(html, /留一刻/);
  assert.match(html, /深海蓝透明釉/);
  assert.match(html, /导出确认记录/);
  assert.match(html, /连接 AI Keyboard/);
  assert.match(html, /开启镜头/);
  assert.match(html, /上传图片或视频/);
  assert.match(html, /视觉找回/);
});

test('renders the confirmed entry and contextual recall once one is available', () => {
  const state = createDemoState();
  leaveMoment(state, { eventId: 'evt_ui_001', note: '第三层釉料在杯沿堆积，下次先试两层。' });
  confirmCandidate(state, state.inbox[0].id);
  selectGlaze(state, '深海蓝透明釉');

  const html = renderApp(state);

  assert.match(html, /个人实验库 · 1/);
  assert.match(html, /因为你选择了深海蓝透明釉/);
  assert.match(html, /5 秒后提醒我/);
});

test('shows the distinct watercolor fields when the watercolor template is selected', () => {
  const state = createDemoState();
  selectTemplate(state, 'tpl_watercolor_v1');

  const html = renderApp(state);

  assert.match(html, /水彩配色实验/);
  assert.match(html, /纸张/);
  assert.match(html, /水量/);
});
