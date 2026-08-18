// semantic-search.js — 语义搜索引擎
// 【稳定性】Transformers.js 用动态 import + CDN fallback（jsdelivr -> unpkg）
//          即使所有 CDN 都不通，也会降级为增强的关键词匹配，不会导致整个模块加载失败
// 模型：Xenova/all-MiniLM-L6-v2（384维向量，~22MB，英文为主；中文走增强关键词匹配）

const CDN_CANDIDATES = [
  "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2",
  "https://unpkg.com/@xenova/transformers@2.17.2"
];
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let pipeline = null;      // Transformers.js 的 pipeline 函数（动态加载后赋值）
let extractor = null;     // 已加载的特征提取器
let loadingPromise = null;
let failed = false;       // 彻底失败（所有 CDN 都挂 / 模型加载失败）

// ====== 文本归一化：全角→半角、大小写、中文标点空格合并 ======
// 目的：让降级模式下"手 作" / "手作" / "手作！" 都能命中
function normalizeText(s) {
  if (!s) return "";
  let t = String(s).toLowerCase().trim();
  // 全角字母数字转半角
  t = t.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  // 全角空格转半角
  t = t.replace(/\u3000/g, " ");
  // 合并连续空白
  t = t.replace(/\s+/g, " ");
  // 去掉常见标点（中英文）
  t = t.replace(/[，。！？、：；""''（）【】《》,\.!\?:;'"(){}\[\]<>\/\\\-_`~@#\$%\^&\*\+=\|]/g, "");
  return t;
}

// ====== 动态加载 Transformers.js pipeline：依次尝试 CDN 列表 ======
async function loadPipeline() {
  if (pipeline) return pipeline;
  let lastErr = null;
  for (const base of CDN_CANDIDATES) {
    try {
      const mod = await import(/* @vite-ignore */ `${base}/dist/transformers.min.js`);
      const fn = mod?.pipeline || (typeof window !== "undefined" && window.transformers?.pipeline);
      if (typeof fn === "function") {
        pipeline = fn;
        console.log(`[Search] Transformers.js 加载成功: ${base}`);
        return pipeline;
      }
    } catch (e) {
      lastErr = e;
      console.warn(`[Search] CDN 加载失败: ${base} -> ${e?.message || e}`);
    }
  }
  throw lastErr || new Error("所有 Transformers.js CDN 均无法加载");
}

// 初始化模型（首次约5-10秒，之后浏览器缓存秒开）
export function initSemanticSearch() {
  if (extractor) return Promise.resolve(extractor);
  if (loadingPromise) return loadingPromise;
  if (failed) return Promise.reject(new Error("模型加载失败，已降级为关键词搜索"));

  loadingPromise = (async () => {
    try {
      const pipeFn = await loadPipeline();
      const model = await pipeFn("feature-extraction", MODEL_ID, {
        // 特性探测：只有配置存在才传，避免老版本报错
        ...(typeof pipeFn === "function" ? {} : {})
      });
      extractor = model;
      loadingPromise = null;
      console.log("[Search] 语义模型加载完成:", MODEL_ID);
      return model;
    } catch (e) {
      failed = true;
      loadingPromise = null;
      console.warn("[Search] 语义模型加载失败，降级为关键词搜索:", e?.message || e);
      throw e;
    }
  })();
  return loadingPromise;
}

export function isModelReady() {
  return extractor !== null;
}

export function didModelFail() {
  return failed;
}

// 文本转向量
async function embed(text) {
  if (failed) throw new Error("模型已失败，使用降级关键词模式");
  if (!extractor) await initSemanticSearch();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

// 余弦相似度
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// 把会话的所有文本拼成字符串（用于语义向量 & 关键词匹配）
function sessionText(session) {
  const fileTexts = (session.files || [])
    .map((f) => [f.note, f.transcript, f.visualChange].filter(Boolean).join(" "));
  return [session.name, ...(session.tags || []), ...fileTexts]
    .filter(Boolean)
    .join(" ");
}

// 【增强关键词匹配】
// 按字段权重打分，不再是所有命中 score=1
//   项目名完全命中 -> 1.0
//   标签完全命中 -> 0.9
//   项目名包含 -> 0.8
//   标签包含 -> 0.7
//   文件文本包含 -> 0.5
// 再叠加"命中字段越多分数越高"，返回 0~1
function keywordScore(session, qNorm) {
  if (!qNorm) return 0;
  const nameNorm = normalizeText(session.name);
  const tagsNorm = (session.tags || []).map(normalizeText);
  const filesNorm = normalizeText(
    (session.files || []).map((f) => [f.note, f.transcript, f.visualChange].filter(Boolean).join(" ")).join(" ")
  );
  const fullNorm = normalizeText(sessionText(session));
  if (!fullNorm) return 0;

  let score = 0;

  // 1) 完全匹配（优先级最高）
  if (nameNorm === qNorm) score = Math.max(score, 1.0);
  if (tagsNorm.includes(qNorm)) score = Math.max(score, 0.9);

  // 2) 包含匹配
  if (nameNorm && nameNorm.includes(qNorm)) score = Math.max(score, 0.8);
  for (const t of tagsNorm) {
    if (t && t.includes(qNorm)) score = Math.max(score, 0.7);
  }
  if (filesNorm && filesNorm.includes(qNorm)) score = Math.max(score, 0.5);

  // 3) 整体文本包含（兜底）
  if (score === 0 && fullNorm.includes(qNorm)) score = 0.4;

  // 4) 中文字符级：至少 60% 的查询字符出现在会话里（避免单字乱命中但允许短词模糊）
  if (score === 0 && qNorm.length >= 2) {
    const hits = [...qNorm].filter((ch) => fullNorm.includes(ch)).length;
    if (hits / qNorm.length >= 0.6) score = 0.25;
  }

  return score;
}

// 计算并存储单个会话的向量
export async function embedSession(session) {
  if (failed || !extractor) {
    // 语义不可用时不抛错，保持 embedding=null，降级模式下照样能搜
    session.embedding = null;
    return null;
  }
  session.embedding = await embed(sessionText(session));
  return session.embedding;
}

// 批量索引（跳过已有向量的会话）
export async function indexAllSessions(sessions) {
  for (const s of sessions) {
    if (!s.embedding && !failed) {
      try {
        await embedSession(s);
      } catch (e) {
        // 降级模式下跳过，不阻塞
        s.embedding = null;
      }
    }
  }
  return sessions;
}

// 分层：L0=今天，L1=近7天，L2=7天前
function getLayer(session) {
  const days = (Date.now() - session.createdAt) / 86400000;
  if (days < 1) return "L0";
  if (days < 7) return "L1";
  return "L2";
}

// 搜索（语义优先，失败时走增强关键词匹配）
// 返回 [{ ...session, _score, _layer }]，按相关度降序
export async function semanticSearch(query, sessions) {
  const q = (query || "").trim();
  if (!q) return [];
  const qNorm = normalizeText(q);

  // 降级：增强关键词匹配
  if (failed || !extractor) {
    const layerWeight = { L0: 0, L1: 1, L2: 2 };
    return sessions
      .map((s) => {
        const sc = keywordScore(s, qNorm);
        if (sc <= 0) return null;
        return { ...s, _score: sc, _layer: getLayer(s) };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (Math.abs(a._score - b._score) < 0.05) {
          return layerWeight[a._layer] - layerWeight[b._layer];
        }
        return b._score - a._score;
      });
  }

  // 语义搜索
  try {
    const qVec = await embed(q);
    const layerWeight = { L0: 0, L1: 1, L2: 2 };

    const semanticResults = sessions
      .map((s) => {
        if (!s.embedding) return null;
        const score = cosineSimilarity(qVec, s.embedding);
        const layer = getLayer(s);
        const threshold = layer === "L2" ? 0.45 : 0.25;
        if (score < threshold) return null;
        return { ...s, _score: score, _layer: layer };
      })
      .filter(Boolean);

    // 如果语义搜出的结果太少（<2），再用关键词匹配补一些，让演示不太空
    if (semanticResults.length < 2) {
      const seenIds = new Set(semanticResults.map((r) => r.id));
      const keywordResults = sessions
        .filter((s) => !seenIds.has(s.id))
        .map((s) => {
          const sc = keywordScore(s, qNorm);
          if (sc <= 0.4) return null; // 关键词模式拿高置信的补
          return { ...s, _score: sc, _layer: getLayer(s) };
        })
        .filter(Boolean);
      semanticResults.push(...keywordResults);
    }

    return semanticResults.sort((a, b) => {
      if (Math.abs(a._score - b._score) < 0.05) {
        return layerWeight[a._layer] - layerWeight[b._layer];
      }
      return b._score - a._score;
    });
  } catch (e) {
    console.warn("[Search] 语义搜索出错，fallback 关键词匹配:", e?.message || e);
    // 运行时再兜底一次：关键词匹配
    return sessions
      .map((s) => {
        const sc = keywordScore(s, qNorm);
        if (sc <= 0) return null;
        return { ...s, _score: sc, _layer: getLayer(s) };
      })
      .filter(Boolean)
      .sort((a, b) => b._score - a._score);
  }
}

// 找与指定会话相似的其他会话（用于素材关联/L1 L2 上下文）
export function findSimilar(session, sessions, options = {}) {
  const { limit = 5, minScore = 0.25, excludeId = null } = options;
  const qNorm = normalizeText(sessionText(session));

  return sessions
    .filter((s) => s.id !== (excludeId || session.id))
    .map((s) => {
      let score = 0;
      if (session.embedding && s.embedding) {
        score = cosineSimilarity(session.embedding, s.embedding);
      } else {
        score = keywordScore(s, qNorm);
      }
      return { ...s, _score: score };
    })
    .filter((s) => s._score >= minScore)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}
