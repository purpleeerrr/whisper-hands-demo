// review-page-integration.js — REVIEW 页接入队友知识库 kb.js
// 把写死的「蓝色杯子实验」换成 getSessionDetail(currentKbSessionId) 的真实数据
// 不影响 REVIEW 页原有的 wake-photo 播放器(由 roadshow-integration.js 注入)

import {
  initKB,
  isKBReady,
  getSessionDetail,
  getAllProjects,
  exportMarkdown,
} from './kb.js';

const $ = (selector, root = document) => root.querySelector(selector);

async function boot() {
  const reviewPage = $('#page-review');
  if (!reviewPage) return;

  let kbOk = false;
  try {
    await initKB();
    kbOk = isKBReady();
  } catch (error) {
    console.warn('[Review] kb.js 初始化失败', error);
  }
  if (!kbOk) return;

  // 监听页面切换,切入 REVIEW 时刷新一次
  // 项目用 .index-tab[data-page="review"] 切换,这里粗暴一点:每次进入都重渲染
  const tabBtn = document.querySelector('.index-tab[data-page="review"]');
  if (tabBtn) {
    tabBtn.addEventListener('click', () => setTimeout(render, 50));
  }
  // 首次也渲一次
  await render();

  async function render() {
    try {
      // 优先用 currentKbSessionId,否则用最新
      let targetId = window.__kbCurrentSessionId || null;
      if (!targetId) {
        const all = await getAllProjects();
        if (!all.length) return;
        targetId = all[0].id;
      }
      const detail = await getSessionDetail(targetId);
      if (!detail) return;
      renderHeader(detail);
      renderTimeline(detail);
    } catch (error) {
      console.error('[Review] 渲染失败', error);
    }
  }

  function renderHeader(session) {
    const block = $('#reviewHeader');
    if (!block) return;
    const card = block.querySelector('.paper-card');
    if (!card) return;
    const h3 = card.querySelector('h3');
    if (h3) h3.textContent = session.name || '未命名创作';
    const meta = card.querySelector('.mono.small');
    if (meta) {
      const date = new Date(session.createdAt).toLocaleDateString('zh-CN');
      const fileCount = (session.files || []).length;
      meta.textContent = `${date} · ${fileCount} 条素材 · ${(session.mode || 'create').toUpperCase()} MODE`;
    }
    const note = card.querySelector('.octo-note span:last-child');
    if (note) {
      const transcriptCount = (session.files || []).filter((f) => f.transcript).length;
      const imageCount = (session.files || []).filter((f) => f.type === 'image').length;
      note.textContent = `这一场留下了 ${imageCount} 张留一刻、${transcriptCount} 条语音。`;
    }
  }

  function renderTimeline(session) {
    const block = $('#reviewTimeline');
    if (!block) return;
    const line = block.querySelector('.review-line');
    if (!line) return;
    line.replaceChildren();
    const files = session.files || [];
    if (!files.length) {
      const empty = document.createElement('div');
      empty.className = 'review-node';
      empty.style.setProperty('--offset', '0px');
      empty.style.setProperty('--r', '0deg');
      empty.innerHTML = '<b>-- · EMPTY</b><p>这一场还没有素材。</p>';
      line.append(empty);
      return;
    }
    // 只展示前 8 条,避免塞爆
    files.slice(0, 8).forEach((file, idx) => {
      const node = document.createElement('div');
      node.className = 'review-node';
      node.style.setProperty('--offset', `${(idx % 3 - 1) * 16}px`);
      node.style.setProperty('--r', `${((idx % 5) - 2) * 0.5}deg`);
      const time = new Date(file.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const kindLabel = { image: '留一刻', video: '录像', audio: '语音', marker: '标记' }[file.type] || file.type.toUpperCase();
      const text = file.visualChange || file.transcript || file.note || '(无备注)';
      node.innerHTML = `<b>${time} · ${kindLabel}</b><p>${escapeHtml(text).slice(0, 80)}</p>`;
      line.append(node);
    });
  }

  // 把 REVIEW 页底部的「导出复盘文档」按钮也接上(它和 SETTING 的 #exportReview 同时存在)
  const exportBtn = $('#exportReview');
  if (exportBtn && !exportBtn.dataset.kbBound) {
    exportBtn.dataset.kbBound = '1';
    // SETTING 那边的绑定在 memory-page-integration.js 里,这里如果也在 REVIEW 页看到这个按钮,附加同样行为
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => boot().catch(console.error));
} else {
  boot().catch(console.error);
}
