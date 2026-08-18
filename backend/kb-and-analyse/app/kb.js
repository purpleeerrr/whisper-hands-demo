// kb.js — 知识库统一入口
// 前端只需要 import 这个文件，不需要直接调 storage.js / semantic-search.js
//
// 用法：
//   import { initKB, createSession, saveSnapshot, searchProjects,
//            getSessionDetail, getAllProjects, getLayeredContext,
//            exportMarkdown, isSemanticReady } from "./kb.js";
//
//   await initKB();  // 页面加载时调一次

import * as storage from "./storage.js";
import * as search from "./semantic-search.js";

let initialized = false;
let initPromise = null;

// 初始化：打开DB + 加载模型 + 建索引
// 模型加载失败不阻塞，自动降级为关键词搜索
// DB 打开失败时清 initPromise，允许下次重试
export function initKB() {
  if (initialized) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await storage.openDB();
    } catch (e) {
      // DB 打开失败（隐私模式 / QuotaExceeded / blocked），清状态允许重试
      initPromise = null;
      initialized = false;
      console.error("[KB] 数据库打开失败:", e?.message || e);
      throw e;
    }

    // 语义模型失败不阻塞，catch 住
    try {
      await search.initSemanticSearch();
    } catch (e) {
      console.warn("[KB] 语义搜索降级:", e.message);
    }

    // 索引已有会话
    let sessions = [];
    try {
      sessions = await storage.getAllSessions();
      await search.indexAllSessions(sessions);
      // 把计算出的向量存回去
      for (const s of sessions) {
        if (s.embedding) await storage.saveSession(s).catch(() => {});
      }
    } catch (e) {
      console.warn("[KB] 会话索引失败（不影响基本功能）:", e?.message || e);
    }

    initialized = true;
    initPromise = null;
    console.log(
      `[KB] 就绪，${sessions.length} 个会话，语义搜索: ${
        search.isModelReady() ? "可用" : "降级(关键词)"
      }`
    );
  })();

  // 失败时也清 initPromise，避免失败后无法重试
  initPromise.catch(() => { initPromise = null; });

  return initPromise;
}

export function isKBReady() {
  return initialized;
}

export function isSemanticReady() {
  return search.isModelReady();
}

// 创建新会话（开始创作时调）
// 返回 session 对象，记住 id，后续保存截图/录音都要用
export async function createSession(name, mode = "explore", tags = []) {
  const now = Date.now();
  const session = {
    id: "sess_" + now + "_" + Math.random().toString(36).slice(2, 6),
    name: name || "未命名创作",
    tags: tags,
    mode: mode,
    createdAt: now,
    updatedAt: now,
    embedding: null,
    summary: "",
    principles: [],
    files: []
  };
  await storage.saveSession(session);

  // 异步计算向量，不阻塞
  search
    .embedSession(session)
    .then(() => storage.saveSession(session))
    .catch(() => {});

  return session;
}

// 保存快照（留一刻截图/录音/录像时调）
// fileData: { type, blob, note?, transcript?, visualChange? }
export async function saveSnapshot(sessionId, fileData) {
  const file = await storage.addFile(sessionId, fileData);

  // 重新索引该会话（新文件可能带来新文本）
  const s = await storage.getSession(sessionId);
  if (s) {
    search
      .embedSession(s)
      .then(() => storage.saveSession(s))
      .catch(() => {});
  }

  return file;
}

// 时光库搜索：输入任意词，返回相关项目
// 搜"花瓶"能找到"粘土手作"（语义关联）
export async function searchProjects(query) {
  if (!initialized) await initKB();
  if (!query || !query.trim()) {
    // 空查询返回全部，按更新时间倒序
    const all = await storage.getAllSessions();
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const all = await storage.getAllSessions();
  return search.semanticSearch(query, all);
}

// 获取所有项目（时光库列表页用）
export async function getAllProjects() {
  if (!initialized) await initKB();
  const all = await storage.getAllSessions();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

// 获取单个项目详情（点击项目时调）
// 返回的 session.files 按时间排序
export async function getSessionDetail(id) {
  const s = await storage.getSession(id);
  if (!s) return null;
  if (s.files) s.files.sort((a, b) => a.timestamp - b.timestamp);
  return s;
}

// 获取分层上下文（meaning.js 复盘时调）
// { l0: 当前会话, l1: 近7天相关, l2: 长期高相关 }
export async function getLayeredContext(sessionId) {
  const all = await storage.getAllSessions();
  const target = all.find((s) => s.id === sessionId);
  if (!target) return { l0: null, l1: [], l2: [] };

  // 确保目标有向量
  if (!target.embedding) {
    try {
      await search.embedSession(target);
      await storage.saveSession(target);
    } catch (e) {}
  }

  const now = Date.now();
  const l1 = [];
  const l2 = [];

  for (const s of all) {
    if (s.id === sessionId) continue;
    const days = (now - s.createdAt) / 86400000;

    if (search.isModelReady() && target.embedding && s.embedding) {
      const score = search.cosineSimilarity(target.embedding, s.embedding);
      if (days < 7 && score > 0.25) {
        l1.push({ ...s, _score: score });
      } else if (days >= 7 && score > 0.45) {
        l2.push({ ...s, _score: score });
      }
    } else {
      // 降级：按标签匹配
      const hasCommonTag = s.tags?.some((t) => target.tags?.includes(t));
      if (hasCommonTag && days < 7) l1.push({ ...s, _score: 0.5 });
    }
  }

  l1.sort((a, b) => b._score - a._score);
  l2.sort((a, b) => b._score - a._score);

  return {
    l0: target,
    l1: l1.slice(0, 5),
    l2: l2.slice(0, 3)
  };
}

// 更新会话的复盘总结和原则（meaning.js 生成后调）
export async function updateSessionInsights(sessionId, summary, principles) {
  const s = await storage.getSession(sessionId);
  if (!s) return;
  if (summary !== undefined) s.summary = summary;
  if (principles !== undefined) s.principles = principles;
  await storage.saveSession(s);
  return s;
}

// 删除项目
export async function deleteProject(sessionId) {
  return storage.deleteSession(sessionId);
}

// 导出创作时序 Markdown 报告（自动触发浏览器下载）
// 失败时 catch 住不 throw，避免点导出按钮导致页面报错崩溃
export async function exportMarkdown(sessionId) {
  try {
    const s = await getSessionDetail(sessionId);
    if (!s) throw new Error("项目不存在");

    const lines = [
      `# ${s.name}`,
      "",
      `- 创作时间：${new Date(s.createdAt).toLocaleString("zh-CN")}`,
      `- 创作模式：${s.mode}`,
      `- 标签：${(s.tags || []).join("、") || "无"}`,
      `- 素材数量：${(s.files || []).length} 条`,
      "",
      "## 创作时序",
      ""
    ];

    const typeLabels = {
      image: "📷 截图",
      video: "🎬 录像",
      audio: "🎙️ 语音",
      marker: "📍 标记"
    };

    (s.files || []).forEach((f, i) => {
      const time = new Date(f.timestamp).toLocaleTimeString("zh-CN");
      lines.push(`### ${i + 1}. ${typeLabels[f.type] || f.type} @ ${time}`);
      if (f.elapsedSeconds) {
        const min = Math.floor(f.elapsedSeconds / 60);
        const sec = f.elapsedSeconds % 60;
        lines.push(`- 创作时点：${min}分${sec}秒`);
      }
      if (f.visualChange) lines.push(`- 画面变化：${f.visualChange}`);
      if (f.transcript) lines.push(`- 语音内容：${f.transcript}`);
      if (f.note) lines.push(`- 备注：${f.note}`);
      lines.push("");
    });

    if (s.summary) {
      lines.push("## 复盘总结", "", s.summary, "");
    }
    if (s.principles?.length) {
      lines.push("## 确认的创作原则", "");
      s.principles.forEach((p) => lines.push(`- ${p}`));
      lines.push("");
    }

    const md = lines.join("\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); // 先存 url 变量，后面 revoke 用它
    const safeName = (s.name || "未命名项目").replace(/[\\/:*?"<>|]/g, "_");
    const dateStr = new Date(s.createdAt).toISOString().slice(0, 10);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}_创作报告_${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 1 秒后释放 blob URL，避免内存泄漏
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 1500);
  } catch (e) {
    console.error("[KB] 导出 Markdown 失败:", e?.message || e);
    alert("导出失败：" + (e?.message || "未知错误"));
  }
}
