// memory-page-integration.js — MEMORY/SETTING/NOW 三页接入队友知识库 kb.js
// 方案 A 最小侵入:
// - 不删 roadshow-integration.js 现有的 SessionStore 渲染逻辑(原 record-card 还会显示)
// - MEMORY 页追加 kbSection 显示 kb.js 搜索结果
// - MEMORY 原生 #recordBoard 卡片点击 → kb.js 详情弹窗
// - SETTING 页 #exportReview 按钮 → 导出最近一场为 Markdown
// - REVIEW 页由 review-page-integration.js 负责
// - 搜索条 300ms 防抖,空查询回退到 getAllProjects
// - 失败 console.error,不影响 NOW 主流程

import {
  initKB,
  isKBReady,
  isSemanticReady,
  searchProjects,
  getAllProjects,
  getSessionDetail,
  exportMarkdown,
  deleteProject,
} from './kb.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const debounce = (fn, ms) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 当前选中的 kb.js sessionId,SETTING/REVIEW 都以它为准
let currentKbSessionId = null;

async function boot() {
  // 页面都不存在就退
  const memoryPage = $('#page-memory');
  const settingPage = $('#page-setting');
  if (!memoryPage && !settingPage) return;

  // 试着启动 kb.js,失败就只显示一行提示,不阻塞页面
  let kbOk = false;
  try {
    await initKB();
    kbOk = isKBReady();
  } catch (error) {
    console.warn('[KB] kb.js 初始化失败', error);
  }

  // ============ MEMORY 页 ============
  if (memoryPage) bootMemoryPage(kbOk);

  // ============ SETTING 页 ============
  if (settingPage) bootSettingPage(kbOk);
}

// =================== MEMORY 页 ===================
function bootMemoryPage(kbOk) {
  const canvas = $('#canvas-memory');
  if (!canvas) return;

  const kbSection = createElement('div', 'kb-section');
  kbSection.id = 'kbSection';
  kbSection.innerHTML = `
    <article class="paper-card kb-panel">
      <span class="kicker">KB / 语义时光库</span>
      <h3>队友知识库(IndexedDB)</h3>
      <p class="kb-status" id="kbStatus">${kbOk
        ? `就绪${isSemanticReady() ? ' · 语义搜索可用' : ' · 关键词兜底'}`
        : '不可用:请确认非无痕模式'}</p>
      <div class="kb-toolbar">
        <input type="search" id="kbSearch" placeholder='搜"蓝釉" / "杯沿",空查询列出全部' ${kbOk ? '' : 'disabled'} />
        <button type="button" id="kbRefresh" ${kbOk ? '' : 'disabled'}>刷新</button>
      </div>
      <div id="kbResults" class="kb-results"></div>
    </article>
  `;
  canvas.prepend(kbSection);

  if (!kbOk) return;

  const resultsBox = $('#kbResults');
  const searchInput = $('#kbSearch');
  const refreshBtn = $('#kbRefresh');
  const statusEl = $('#kbStatus');

  function renderProjects(projects) {
    resultsBox.replaceChildren();
    if (!projects || projects.length === 0) {
      const empty = createElement('p', 'kb-empty', '没有匹配的创作记录。先在 NOW 页完成一次创作,会自动镜像到这里。');
      resultsBox.append(empty);
      return;
    }
    for (const p of projects) {
      const card = createElement('article', 'kb-card');
      card.dataset.sessionId = p.id;
      const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString('zh-CN') : '';
      const head = createElement('div', 'kb-card-head');
      head.innerHTML = `<b>${escapeHtml(p.name || '未命名')}</b><span class="kb-meta">${dateStr} · ${(p.files?.length || 0)} 条素材${p._score != null ? ` · ${(p._score * 100).toFixed(0)}%` : ''}</span>`;
      const tagRow = createElement('div', 'kb-tags');
      tagRow.textContent = (p.tags || []).filter((t) => !t.startsWith('src:') && !t.startsWith('template:')).join(' · ') || '(无标签)';
      const actions = createElement('div', 'kb-actions');
      const detailBtn = createElement('button', '', '详情');
      detailBtn.type = 'button';
      detailBtn.addEventListener('click', (e) => { e.stopPropagation(); showDetail(p.id); });
      const exportBtn = createElement('button', '', '导出 md');
      exportBtn.type = 'button';
      exportBtn.addEventListener('click', (e) => { e.stopPropagation(); exportMarkdown(p.id); });
      const deleteBtn = createElement('button', 'kb-danger', '删除');
      deleteBtn.type = 'button';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`删除「${p.name}」?`)) return;
        await deleteProject(p.id);
        if (currentKbSessionId === p.id) currentKbSessionId = null;
        card.remove();
      });
      actions.append(detailBtn, exportBtn, deleteBtn);
      card.append(head, tagRow, actions);
      // 整卡点击 → 详情弹窗
      card.addEventListener('click', () => showDetail(p.id));
      resultsBox.append(card);
    }
  }

  async function showDetail(sessionId) {
    try {
      const detail = await getSessionDetail(sessionId);
      if (!detail) return;
      currentKbSessionId = sessionId;
      const lines = (detail.files || []).map((f) => {
        const time = new Date(f.timestamp).toLocaleTimeString('zh-CN');
        return `${time} · ${f.type}${f.visualChange ? ` · ${f.visualChange}` : ''}${f.note ? ` · ${f.note}` : ''}${f.transcript ? `\n  ${f.transcript}` : ''}`;
      });
      alert(`${detail.name}\n\n${lines.join('\n') || '(还没有素材)'}`);
    } catch (error) {
      console.error('[KB] 详情加载失败', error);
    }
  }

  const runSearch = debounce(async () => {
    try {
      const query = searchInput.value.trim();
      statusEl.textContent = query ? `搜索"${query}"中…` : '正在列出全部…';
      const projects = query ? await searchProjects(query) : await getAllProjects();
      statusEl.textContent = `${projects.length} 条结果${isSemanticReady() ? '' : ' · 关键词模式'}`;
      renderProjects(projects);
      // 默认把最新一场设为当前(REVIEW/SETTING 用)
      if (!currentKbSessionId && projects.length) {
        currentKbSessionId = projects[0].id;
      }
    } catch (error) {
      console.error('[KB] 搜索失败', error);
      statusEl.textContent = '搜索失败,请看控制台';
    }
  }, 300);

  searchInput.addEventListener('input', runSearch);
  refreshBtn.addEventListener('click', runSearch);
  runSearch();

  // 原生 #recordBoard 卡片(由 roadshow-integration.js 渲染的 SessionStore 卡)
  // 点击 → 通过 record.sessionId 反查 kb.js,如果有镜像就弹 kb 详情,没有就跳过
  const board = $('#recordBoard');
  if (board) {
    board.addEventListener('click', async (e) => {
      const card = e.target.closest('.wh-session-card');
      if (!card) return;
      const srcId = card.dataset.sessionId;
      if (!srcId) return;
      try {
        const all = await getAllProjects();
        // 镜像卡会在 tags 里有 src:<sessionId>
        const mirror = all.find((p) => (p.tags || []).includes(`src:${srcId}`));
        if (mirror) {
          showDetail(mirror.id);
        }
      } catch (error) {
        console.warn('[KB] SessionStore → kb 反查失败', error);
      }
    });
  }

  // NOW 完成镜像后调一次,自动刷新列表
  window.__kbMemoryRefresh = runSearch;
}

// =================== SETTING 页 ===================
function bootSettingPage(kbOk) {
  const exportBtn = $('#exportReview');
  if (!exportBtn) return;

  exportBtn.textContent = kbOk ? '导出复盘 Markdown' : '导出复盘(知识库不可用)';
  exportBtn.disabled = !kbOk;
  if (!kbOk) return;

  exportBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const btn = e.currentTarget;
    btn.disabled = true;
    const originalText = btn.textContent;
    try {
      // 优先用当前选中的,否则选最新一场
      let targetId = currentKbSessionId;
      if (!targetId) {
        const all = await getAllProjects();
        if (!all.length) {
          alert('还没有任何创作记录,先去 NOW 页完成一场创作');
          btn.disabled = false;
          return;
        }
        targetId = all[0].id;
        currentKbSessionId = targetId;
      }
      btn.textContent = '导出中…';
      await exportMarkdown(targetId);
      btn.textContent = '已触发下载 ✓';
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 1500);
    } catch (error) {
      console.error('[KB] 导出失败', error);
      btn.textContent = '导出失败,重试';
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 1500);
    }
  }, true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => boot().catch(console.error));
} else {
  boot().catch(console.error);
}
