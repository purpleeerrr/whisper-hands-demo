// desk-layer-analyzer.js — 桌面物料叠层关系识别器
// ============================================================
// 【定位】完全独立的纯前端模块，零依赖、零模型下载，原生 Canvas API 即可
// 【目标】只识别「空间叠层关系」：覆盖 / 新增 / 移除 / 替换 / 移动
//        不做语义动作识别（不识别"上釉/打磨"等语义）
// 【双保险触发】① 画面整体变化量在合理区间 ② 叠层拓扑真实改变
// 【误触发排除】手晃过、光线突变、猫走过、摄像头被碰 → 全部不触发
// 【对接】事件对象.description 可直接填进 saveSnapshot 的 visualChange 字段
// 【调试】analyzer.enableDebug(domElement) 传 DOM 立刻弹出可视化面板，参数实时调
// ============================================================
//
// 两种用法：
//   A) 连续帧（推荐，有背景/稳定块历史）：
//      import { createDeskAnalyzer } from "./desk-layer-analyzer.js";
//      const analyzer = createDeskAnalyzer();
//      // 每拿到一帧就 push
//      const events = analyzer.pushFrame(videoOrCanvasEl);
//      if (events.length) console.log(events.map(e => e.description));
//
//   B) 一次性两帧对比（简单，单没稳定块历史）：
//      import { analyzeDeskChange } from "./desk-layer-analyzer.js";
//      const events = analyzeDeskChange(prevCanvas, currCanvas);

// ===================== 默认参数（调试面板里都能实时调） =====================
const DEFAULT_OPTIONS = {
  // 背景更新率：越大背景学习越快（0=永不更新，1=每帧都变背景）
  //      光线慢变要小（0.02），现场稳定可稍大（0.05）
  backgroundAlpha: 0.03,
  // 前景阈值（单像素灰度差 > 这个才算前景像素）
  pixelDiff: 22,
  // 画面整体前景像素比例：<min 没变化，>max 画面扰动（手/光线/碰摄像头）
  changeMinRatio: 0.025,   // 2.5%
  changeMaxRatio: 0.60,    // 60%
  // 网格分块尺寸：物料检测用的网格
  gridCols: 16,
  gridRows: 12,
  // 分块连续 N 帧都是高前景比例才算「稳定物料块」（防手晃）
  stableFrames: 4,
  blockForegroundRatio: 0.45, // 单块内 45% 像素是前景才算"有物料"
  // 「移动」判定：IoU > 0.5 且位置差不超过自身尺寸
  moveIoU: 0.5,
  moveDistFactor: 1.5,
  // 「覆盖」判定：两块重叠面积占小块面积的比例 > 0.6
  coverOverlap: 0.6,
  // 调试面板画布大小
  debugCanvasW: 260,
  debugCanvasH: 200
};

// ===================== 工具函数 =====================
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function toGrayData(sourceEl, w, h) {
  // sourceEl 接受 <video> / <canvas> / <img>，先画到临时 canvas 再拿灰度
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  try {
    ctx.drawImage(sourceEl, 0, 0, w, h);
  } catch (_) {
    return null;
  }
  const d = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
  }
  return { data: gray, canvas: c };
}

// 前景掩码：curr 与 background 逐像素对比
function buildForegroundMask(currGray, bgGray, pixelDiff) {
  const n = currGray.length;
  const mask = new Uint8Array(n);
  let fgCount = 0;
  for (let i = 0; i < n; i++) {
    const diff = Math.abs(currGray[i] - bgGray[i]);
    if (diff > pixelDiff) { mask[i] = 1; fgCount++; }
  }
  return { mask, fgRatio: fgCount / n };
}

// 3x3 多数决去噪（去掉盐胡椒单点前景），原地修改 mask
function denoiseMask(mask, w, h) {
  const copy = new Uint8Array(mask);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let s = 0;
      s += copy[i - w - 1] + copy[i - w] + copy[i - w + 1];
      s += copy[i - 1]        + copy[i]      + copy[i + 1];
      s += copy[i + w - 1] + copy[i + w] + copy[i + w + 1];
      mask[i] = s >= 5 ? 1 : 0;
    }
  }
}

// 把掩码按网格切块，返回每块的前景比例 [rows x cols]
function blockRatios(mask, w, h, cols, rows) {
  const bw = (w / cols) | 0, bh = (h / rows) | 0;
  const result = new Array(rows);
  for (let r = 0; r < rows; r++) {
    result[r] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      let fg = 0, total = 0;
      for (let y = r * bh; y < (r + 1) * bh; y++) {
        for (let x = c * bw; x < (c + 1) * bw; x++) {
          total++;
          if (mask[y * w + x]) fg++;
        }
      }
      result[r][c] = total ? fg / total : 0;
    }
  }
  return result;
}

// 连通域标记（8 邻域），把稳定块按连通性分组为「物料候选」
function connectedComponents(blocks, rows, cols, threshold) {
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const components = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited[r][c] || blocks[r][c] < threshold) continue;
      const q = [[r, c]];
      visited[r][c] = true;
      const cells = [];
      let minR = r, maxR = r, minC = c, maxC = c;
      while (q.length) {
        const [y, x] = q.pop();
        cells.push([y, x]);
        if (y < minR) minR = y;
        if (y > maxR) maxR = y;
        if (x < minC) minC = x;
        if (x > maxC) maxC = x;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
            if (visited[ny][nx] || blocks[ny][nx] < threshold) continue;
            visited[ny][nx] = true;
            q.push([ny, nx]);
          }
        }
      }
      const wB = maxC - minC + 1, hB = maxR - minR + 1;
      // 过滤连通域太小（噪声）和细长形（手/手臂）
      const cellsN = cells.length;
      const ratio = wB / Math.max(1, hB);
      if (cellsN >= 4 && ratio >= 0.2 && ratio <= 5) {
        components.push({
          id: components.length,
          cells,
          bboxGrid: { r: minR, c: minC, w: wB, h: hB },
          areaCells: cellsN
        });
      }
    }
  }
  return components;
}

// 两块重叠比例（相对较小那块的面积）
function overlapRatio(a, b) {
  const ax1 = a.bboxGrid.c, ay1 = a.bboxGrid.r;
  const ax2 = ax1 + a.bboxGrid.w, ay2 = ay1 + a.bboxGrid.h;
  const bx1 = b.bboxGrid.c, by1 = b.bboxGrid.r;
  const bx2 = bx1 + b.bboxGrid.w, by2 = by1 + b.bboxGrid.h;
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  return inter / Math.min(a.areaCells, b.areaCells);
}

// bbox IoU（用于移动判定）
function bboxIoU(a, b) {
  const ax1 = a.bboxGrid.c, ay1 = a.bboxGrid.r;
  const ax2 = ax1 + a.bboxGrid.w, ay2 = ay1 + a.bboxGrid.h;
  const bx1 = b.bboxGrid.c, by1 = b.bboxGrid.r;
  const bx2 = bx1 + b.bboxGrid.w, by2 = by1 + b.bboxGrid.h;
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const union = a.areaCells + b.areaCells - inter;
  return union <= 0 ? 0 : inter / union;
}

// bbox 中心点距离（单位：网格）
function bboxCenterDist(a, b) {
  const acx = a.bboxGrid.c + a.bboxGrid.w / 2;
  const acy = a.bboxGrid.r + a.bboxGrid.h / 2;
  const bcx = b.bboxGrid.c + b.bboxGrid.w / 2;
  const bcy = b.bboxGrid.r + b.bboxGrid.h / 2;
  return Math.hypot(acx - bcx, acy - bcy);
}

// 给稳定物料块做「层级推断」
// 规则：若块 A 的区域内出现比 A 更晚稳定的新变化 B → B 覆盖在 A 上
function assignLayers(components, stability) {
  // stability[i] = 第 i 个组件的「稳定起始帧号」，越小越老
  const layers = new Array(components.length).fill(0);
  for (let i = 0; i < components.length; i++) {
    for (let j = 0; j < components.length; j++) {
      if (i === j) continue;
      if (stability[i] < stability[j] && overlapRatio(components[i], components[j]) > 0.3) {
        // j 覆盖在 i 上 → j 的层级至少比 i 高 1
        layers[j] = Math.max(layers[j], layers[i] + 1);
      }
    }
  }
  return layers;
}

// 把网格 bbox 转成画面百分比，方便描述
function bboxPct(bboxGrid, cols, rows) {
  return {
    xPct: bboxGrid.c / cols,
    yPct: bboxGrid.r / rows,
    wPct: bboxGrid.w / cols,
    hPct: bboxGrid.h / rows,
    areaPct: (bboxGrid.w * bboxGrid.h) / (cols * rows)
  };
}

function positionLabel(pct) {
  const v = pct.yPct < 0.33 ? "上方" : pct.yPct + pct.hPct > 0.66 ? "下方" : "中间";
  const h = pct.xPct < 0.33 ? "左侧" : pct.xPct + pct.wPct > 0.66 ? "右侧" : "";
  return `${h}${v}` || "中间";
}

// ===================== 单次两帧对比（简易版） =====================
export function analyzeDeskChange(prevSource, currSource, options = {}) {
  // 简易版：内部构造一个临时 analyzer，推 2 帧
  const analyzer = createDeskAnalyzer({ ...options, stableFrames: 1 });
  analyzer.pushFrame(prevSource);
  // 让 prev 成为「已稳定」的一帧
  for (let i = 0; i < 3; i++) analyzer.pushFrame(prevSource);
  return analyzer.pushFrame(currSource);
}

// ===================== 有状态的分析器（推荐用这个） =====================
export function createDeskAnalyzer(userOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...userOptions };
  const PROCW = 320, PROCH = 240;  // 内部处理用 320x240（够了，又快）

  // ========== 状态 ==========
  let frameCount = 0;
  let bgGray = null;                  // 背景灰度（Float32 方便平滑更新）
  let lastComponents = [];            // 上一帧稳定物料块
  let lastLayers = [];                // 上一帧层级
  let lastStableFrame = [];           // 上一帧稳定起始帧号
  let blockStableCounter = null;      // [rows][cols] 每块连续高前景的帧数
  let eventLog = [];                  // 事件日志（调试面板用）
  const listeners = new Set();        // onEvent 回调
  let lastDebugSnapshot = null;       // 最近一帧的调试快照（面板渲染用）

  function updateOptions(patch) { Object.assign(opts, patch); }

  function onEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); }

  function emit(events) {
    for (const e of events) {
      eventLog.unshift({ time: Date.now(), ...e });
      if (eventLog.length > 50) eventLog.pop();
      for (const cb of listeners) try { cb(e); } catch (_) {}
    }
  }

  // 推一帧，返回「叠层事件」数组（没有变化就是空数组）
  function pushFrame(sourceEl) {
    if (!sourceEl) return [];
    frameCount++;

    // ---------- Step 1：转灰度 ----------
    const grayResult = toGrayData(sourceEl, PROCW, PROCH);
    if (!grayResult) return [];
    const { data: currGray, canvas: currCanvas } = grayResult;

    // ---------- Step 2：背景建模 / 更新 ----------
    if (!bgGray) {
      // 第一帧：背景初始化
      bgGray = new Float32Array(currGray);
      initBlockCounters();
      lastDebugSnapshot = makeDebugSnapshot(currGray, null, null, [], []);
      return [];
    }

    // ---------- Step 3：前景掩码 + 去噪 ----------
    const { mask, fgRatio } = buildForegroundMask(currGray, bgGray, opts.pixelDiff);
    denoiseMask(mask, PROCW, PROCH);

    // ---------- Step 4：双保险 ① 整体变化量检查 ----------
    let events = [];
    const bgChangedTooMuch = detectBackgroundChange(currGray, bgGray);
    if (fgRatio < opts.changeMinRatio) {
      // 没变化 → 这是一个「稳定帧」，让背景缓慢学习，物料块稳定计数器 +1
      updateBackground(currGray, opts.backgroundAlpha);
      updateStableBlocks(mask, currGray);
      events = [];
    } else if (fgRatio > opts.changeMaxRatio || bgChangedTooMuch) {
      // 变化太大（手晃/光线/碰摄像头）→ 不触发，暂时不更新背景
      // 如果连续 10 帧都这样，认为环境真变了，重置背景
      bigChangeCounter++;
      if (bigChangeCounter > 10) {
        bgGray = new Float32Array(currGray);
        bigChangeCounter = 0;
      }
      events = [];
    } else {
      // 变化在合理区间
      bigChangeCounter = 0;
      // 先更新稳定块计数器（这一帧有变化的块不算入稳定）
      updateStableBlocks(mask, currGray, /*isChangingFrame=*/ true);
      // ---------- Step 5：稳定块 → 物料连通域 ----------
      const stableBlocks = computeStableBlocks();
      const components = connectedComponents(stableBlocks, opts.gridRows, opts.gridCols, 1.0);
      const stability = components.map(() => frameCount); // 这一帧先按当前算，后面和历史匹配后再修正
      const layers = assignLayers(components, stability);
      // ---------- Step 6：双保险 ② 叠层拓扑对比 → 产出事件 ----------
      events = compareLayersAndEmit(lastComponents, lastLayers, components, layers);
      // 保存当前帧快照
      lastComponents = components;
      lastLayers = layers;
      // 背景只做极小更新（有变化时不学习，避免把新物料当背景学进去）
      updateBackground(currGray, opts.backgroundAlpha * 0.15);
    }

    // 保存调试快照
    lastDebugSnapshot = makeDebugSnapshot(currGray, bgGray, mask, lastComponents, lastLayers);

    emit(events);
    return events;
  }

  let bigChangeCounter = 0;

  // 检测背景突变（>30% 像素差大）→ 光线剧变/摄像头移位
  function detectBackgroundChange(currGray, bgGrayFloat) {
    let bigDiff = 0;
    const n = currGray.length;
    const THR = 60; // 灰度差 60 才算"大变化"
    for (let i = 0; i < n; i++) {
      if (Math.abs(currGray[i] - (bgGrayFloat[i] | 0)) > THR) bigDiff++;
    }
    return bigDiff / n > 0.30;
  }

  function updateBackground(currGray, alpha) {
    const a = clamp(alpha, 0, 1);
    if (a <= 0) return;
    for (let i = 0; i < currGray.length; i++) {
      bgGray[i] = bgGray[i] * (1 - a) + currGray[i] * a;
    }
  }

  function initBlockCounters() {
    blockStableCounter = new Array(opts.gridRows);
    for (let r = 0; r < opts.gridRows; r++) {
      blockStableCounter[r] = new Array(opts.gridCols).fill(0);
    }
  }

  // 更新每块的稳定计数器：稳定帧（变化小）高前景块++，变化帧清零
  function updateStableBlocks(mask, currGray, isChangingFrame = false) {
    if (!blockStableCounter) initBlockCounters();
    const ratios = blockRatios(mask, PROCW, PROCH, opts.gridCols, opts.gridRows);
    for (let r = 0; r < opts.gridRows; r++) {
      for (let c = 0; c < opts.gridCols; c++) {
        const fg = ratios[r][c];
        if (fg > opts.blockForegroundRatio) {
          if (!isChangingFrame) {
            blockStableCounter[r][c] = Math.min(blockStableCounter[r][c] + 1, opts.stableFrames + 2);
          } else {
            // 变化帧不直接清零，-- 避免闪烁
            blockStableCounter[r][c] = Math.max(0, blockStableCounter[r][c] - 1);
          }
        } else if (fg < 0.05) {
          // 几乎没前景 → 这块没有物料，慢慢衰减
          blockStableCounter[r][c] = Math.max(0, blockStableCounter[r][c] - 1);
        }
      }
    }
  }

  function computeStableBlocks() {
    const res = new Array(opts.gridRows);
    for (let r = 0; r < opts.gridRows; r++) {
      res[r] = new Array(opts.gridCols);
      for (let c = 0; c < opts.gridCols; c++) {
        res[r][c] = blockStableCounter[r][c] >= opts.stableFrames ? 1 : 0;
      }
    }
    return res;
  }

  // 叠层对比：旧组件 vs 新组件 → 产出事件数组
  function compareLayersAndEmit(oldComps, oldLayers, newComps, newLayers) {
    const events = [];
    if (!oldComps.length && !newComps.length) return events;
    const cols = opts.gridCols, rows = opts.gridRows;

    // ---- 1) 给每个旧组件找最佳新组件匹配（IoU 高且面积接近） ----
    const oldUsed = new Set();
    const newUsed = new Set();
    const matches = []; // [[oldIdx, newIdx, score]]
    for (let i = 0; i < oldComps.length; i++) {
      for (let j = 0; j < newComps.length; j++) {
        const iou = bboxIoU(oldComps[i], newComps[j]);
        if (iou >= opts.moveIoU) matches.push([i, j, iou]);
      }
    }
    matches.sort((a, b) => b[2] - a[2]);
    for (const [i, j] of matches) {
      if (oldUsed.has(i) || newUsed.has(j)) continue;
      oldUsed.add(i); newUsed.add(j);
      // 判断移动 vs 替换（中心距离）
      const dist = bboxCenterDist(oldComps[i], newComps[j]);
      const sizeMax = Math.max(oldComps[i].bboxGrid.w, oldComps[i].bboxGrid.h);
      if (dist > sizeMax * opts.moveDistFactor) {
        // 同位置但内容变了 → 暂时当替换处理（IoU够但位置变太远不好解释，算成 REMOVE+ADD）
        events.push(makeEvent("REMOVE", oldComps[i], oldLayers[i]));
        events.push(makeEvent("ADD", newComps[j], newLayers[j]));
      } else {
        // 位置没变或微变：面积差大 → REPLACE，面积一致 → 看层级变化
        const areaRatio = newComps[j].areaCells / Math.max(1, oldComps[i].areaCells);
        if (areaRatio < 0.6 || areaRatio > 1.6) {
          events.push(makeEvent("REPLACE", newComps[j], newLayers[j]));
        } else if (Math.abs(dist) > sizeMax * 0.25) {
          events.push(makeEvent("MOVE", newComps[j], newLayers[j]));
        }
        // 否则视为「同一物料」，不触发事件（但下面会单独检测覆盖变化）
      }
    }

    // ---- 2) 没匹配到的旧组件 → REMOVE ----
    for (let i = 0; i < oldComps.length; i++) {
      if (!oldUsed.has(i)) events.push(makeEvent("REMOVE", oldComps[i], oldLayers[i]));
    }
    // ---- 3) 没匹配到的新组件 → ADD ----
    for (let j = 0; j < newComps.length; j++) {
      if (!newUsed.has(j)) {
        // 检查是否「覆盖在其他块上」
        let coveredTarget = null;
        for (const c of oldComps) {
          if (overlapRatio(newComps[j], c) > opts.coverOverlap) { coveredTarget = c; break; }
        }
        if (coveredTarget) {
          events.push(makeEvent("COVER", newComps[j], newLayers[j], coveredTarget));
        } else {
          events.push(makeEvent("ADD", newComps[j], newLayers[j]));
        }
      }
    }
    // ---- 4) 全局层级变化扫描：即使组件没增删，只要层级变化也发 COVER ----
    if (oldComps.length && newComps.length) {
      for (let i = 0; i < oldComps.length; i++) {
        for (let j = 0; j < oldComps.length; j++) {
          if (i === j) continue;
          const was = (oldLayers[i] || 0) > (oldLayers[j] || 0);
          let nowI = -1, nowJ = -1;
          for (let k = 0; k < newComps.length; k++) {
            if (bboxIoU(oldComps[i], newComps[k]) > opts.moveIoU) nowI = k;
            if (bboxIoU(oldComps[j], newComps[k]) > opts.moveIoU) nowJ = k;
          }
          if (nowI < 0 || nowJ < 0) continue;
          const now = (newLayers[nowI] || 0) > (newLayers[nowJ] || 0);
          if (!was && now) {
            events.push(makeEvent("COVER", newComps[nowI], newLayers[nowI], newComps[nowJ]));
          }
        }
      }
    }

    return dedupeEvents(events);
  }

  function makeEvent(type, comp, layer, coveredUnder = null) {
    const cols = opts.gridCols, rows = opts.gridRows;
    const pct = bboxPct(comp.bboxGrid, cols, rows);
    const loc = positionLabel(pct);
    const sizeDesc = pct.areaPct < 0.06 ? "小型物料" : pct.areaPct < 0.18 ? "中型物料" : "大型物料";
    const areaPct = Math.round(pct.areaPct * 100);
    let description = "";
    switch (type) {
      case "ADD":
        description = `桌面${loc}新增${sizeDesc}（约占桌面${areaPct}%）`; break;
      case "REMOVE":
        description = `桌面${loc}移除了${sizeDesc}（约占桌面${areaPct}%）`; break;
      case "MOVE":
        description = `桌面${loc}的${sizeDesc}发生了移动`; break;
      case "REPLACE":
        description = `桌面${loc}的物料被替换（约${areaPct}%区域）`; break;
      case "COVER":
        if (coveredUnder) {
          const underPct = bboxPct(coveredUnder.bboxGrid, cols, rows);
          description = `桌面${loc}的${sizeDesc}覆盖在另一物料上（下层物料位于${positionLabel(underPct)}）`;
        } else {
          description = `桌面${loc}发生物料叠放变化（上层覆盖约${areaPct}%）`;
        }
        break;
    }
    return {
      type, confidence: 1,
      description,
      bbox: pct,
      layer,
      _comp: comp,
      _coveredUnder: coveredUnder
    };
  }

  // 去重：同一区域同类型事件合并
  function dedupeEvents(events) {
    if (events.length < 2) return events;
    const out = [];
    const used = new Array(events.length).fill(false);
    for (let i = 0; i < events.length; i++) {
      if (used[i]) continue;
      const e = events[i];
      let merged = { ...e };
      for (let j = i + 1; j < events.length; j++) {
        if (used[j]) continue;
        const f = events[j];
        if (e.type !== f.type) continue;
        const ol = overlapRatio(e._comp || { bboxGrid: { r: 0, c: 0, w: 0, h: 0 }, areaCells: 1 },
                                f._comp || { bboxGrid: { r: 0, c: 0, w: 0, h: 0 }, areaCells: 1 });
        if (ol > 0.4) {
          used[j] = true;
          // 合并取较长的 description 和更高置信度
          merged.description = merged.description.length >= f.description.length ? merged.description : f.description;
        }
      }
      out.push(merged);
    }
    return out;
  }

  // ========== 调试快照（面板渲染用） ==========
  function makeDebugSnapshot(currGray, bgGrayFloat, mask, comps, layers) {
    return {
      currGray, bgGrayFloat: bgGrayFloat ? new Float32Array(bgGrayFloat) : null,
      mask: mask ? new Uint8Array(mask) : null,
      components: comps.map(c => ({ ...c, cells: c.cells.map(x => x.slice()) })),
      layers: layers.slice(),
      opts: { ...opts },
      eventLog: eventLog.slice(0, 20),
      frameCount,
      foregroundRatio: mask ? (mask.reduce((s, v) => s + v, 0) / mask.length) : 0
    };
  }

  // ========== 调试面板：enableDebug(domElement) 传 DOM 就显示 ==========
  let debugEl = null;
  function enableDebug(container) {
    if (!container || typeof container.appendChild !== "function") {
      console.warn("[DeskAnalyzer] enableDebug 需要传入 DOM 元素");
      return;
    }
    if (debugEl && debugEl.parentNode === container) return;
    debugEl = buildDebugPanel();
    container.appendChild(debugEl);
    startDebugRender();
  }

  function buildDebugPanel() {
    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:10px;background:#1e293b;color:#e2e8f0;font:12px/1.4 ui-monospace,Consolas,monospace;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:max-content;";
    // 6 个视图：original / bg / mask / blocks / layers / log
    const titles = ["原始帧", "背景模型", "前景掩码", "稳定物料块", "叠层示意", "事件日志 & 参数"];
    const views = [];
    for (let i = 0; i < 5; i++) {
      const cell = document.createElement("div");
      cell.style.cssText = "display:flex;flex-direction:column;gap:4px;";
      const label = document.createElement("div"); label.textContent = titles[i]; cell.appendChild(label);
      const cv = document.createElement("canvas");
      cv.width = opts.debugCanvasW; cv.height = opts.debugCanvasH;
      cv.style.cssText = "border-radius:4px;border:1px solid #334155;image-rendering:pixelated;background:#0f172a;";
      cell.appendChild(cv);
      views.push({ canvas: cv });
      wrap.appendChild(cell);
    }
    // 第 6 个面板：日志 + 参数滑杆
    const right = document.createElement("div");
    right.style.cssText = "display:flex;flex-direction:column;gap:6px;grid-column:3;width:280px;max-height:360px;overflow-y:auto;";
    right.innerHTML = `<div style="font-weight:bold;color:#f8fafc;">${titles[5]}</div>`;
    const logEl = document.createElement("div");
    logEl.style.cssText = "background:#0f172a;border-radius:4px;padding:6px;border:1px solid #334155;height:120px;overflow-y:auto;white-space:pre-wrap;";
    right.appendChild(logEl);
    // 参数滑杆
    const sliders = [
      ["背景学习率", "backgroundAlpha", 0, 0.2, 0.005],
      ["像素差阈值", "pixelDiff", 5, 60, 1],
      ["变化下限%", "changeMinRatio", 0.005, 0.1, 0.005],
      ["变化上限%", "changeMaxRatio", 0.2, 0.9, 0.01],
      ["稳定帧数", "stableFrames", 1, 15, 1],
      ["块前景阈值", "blockForegroundRatio", 0.1, 0.8, 0.05]
    ];
    const slidersWrap = document.createElement("div");
    slidersWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    const valueLabels = {};
    for (const [label, key, min, max, step] of sliders) {
      const row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:88px 1fr 56px;gap:6px;align-items:center;";
      const lab = document.createElement("div"); lab.textContent = label; row.appendChild(lab);
      const input = document.createElement("input");
      input.type = "range"; input.min = min; input.max = max; input.step = step; input.value = opts[key];
      input.addEventListener("input", () => {
        let v = parseFloat(input.value);
        if (key === "pixelDiff" || key === "stableFrames") v = parseInt(input.value);
        updateOptions({ [key]: v });
        valueLabels[key].textContent = (key.endsWith("Ratio") ? (v * 100).toFixed(1) + "%" : v);
      });
      row.appendChild(input);
      const val = document.createElement("div");
      val.style.cssText = "text-align:right;color:#38bdf8;";
      val.textContent = (key.endsWith("Ratio") ? (opts[key] * 100).toFixed(1) + "%" : opts[key]);
      valueLabels[key] = val;
      row.appendChild(val);
      slidersWrap.appendChild(row);
    }
    right.appendChild(slidersWrap);
    wrap.appendChild(right);

    views.push({ logEl, valueLabels, slidersWrap });
    wrap._views = views;
    return wrap;
  }

  let renderRAF = 0;
  function startDebugRender() {
    if (renderRAF) return;
    const tick = () => {
      if (!debugEl || !debugEl.parentNode) { renderRAF = 0; return; }
      const snap = lastDebugSnapshot;
      const views = debugEl._views;
      if (snap) {
        drawGray(views[0].canvas, snap.currGray, PROCW, PROCH);
        if (snap.bgGrayFloat) drawGrayF(views[1].canvas, snap.bgGrayFloat, PROCW, PROCH);
        if (snap.mask) drawMask(views[2].canvas, snap.mask, PROCW, PROCH, snap.foregroundRatio);
        drawBlocks(views[3].canvas, lastComponents || [], opts.gridCols, opts.gridRows, PROCW, PROCH);
        drawLayers(views[4].canvas, lastComponents || [], lastLayers || [], opts.gridCols, opts.gridRows, PROCW, PROCH);
        // 日志
        const logEl = views[5].logEl;
        logEl.innerHTML = `帧: ${snap.frameCount} | 前景: ${(snap.foregroundRatio * 100).toFixed(1)}% | 物料: ${lastComponents.length}\n` +
          (snap.eventLog.slice(0, 8).map(e => `[${new Date(e.time).toLocaleTimeString("zh-CN")}] ${e.type} - ${e.description}`).join("\n") || "（暂无事件）");
      }
      renderRAF = requestAnimationFrame(tick);
    };
    renderRAF = requestAnimationFrame(tick);
  }

  return {
    pushFrame, onEvent, updateOptions,
    enableDebug,
    getState: () => ({
      componentsCount: lastComponents.length,
      layers: lastLayers.slice(),
      eventLog: eventLog.slice(),
      frameCount
    })
  };

  // ========== 调试面板 canvas 绘制函数 ==========
  function drawGray(canvas, gray, w, h) {
    const c = canvas.getContext("2d");
    const img = c.createImageData(w, h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      const v = gray[i];
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
      img.data[p + 3] = 255;
    }
    putImageDataScaled(canvas, img, w, h);
  }
  function drawGrayF(canvas, grayF, w, h) {
    const c = canvas.getContext("2d");
    const img = c.createImageData(w, h);
    for (let i = 0, p = 0; i < grayF.length; i++, p += 4) {
      const v = clamp(grayF[i] | 0, 0, 255);
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
      img.data[p + 3] = 255;
    }
    putImageDataScaled(canvas, img, w, h);
  }
  function drawMask(canvas, mask, w, h, ratio) {
    const c = canvas.getContext("2d");
    const img = c.createImageData(w, h);
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      if (mask[i]) {
        img.data[p] = 248; img.data[p + 1] = 113; img.data[p + 2] = 113; img.data[p + 3] = 255;
      } else {
        img.data[p] = 15; img.data[p + 1] = 23; img.data[p + 2] = 42; img.data[p + 3] = 255;
      }
    }
    putImageDataScaled(canvas, img, w, h);
    // 前景比例文字
    c.fillStyle = "#fecaca"; c.font = "12px ui-monospace,Consolas,monospace";
    c.fillText(`前景: ${(ratio * 100).toFixed(1)}%`, 6, canvas.height - 6);
  }
  function drawBlocks(canvas, comps, cols, rows, w, h) {
    const c = canvas.getContext("2d");
    c.fillStyle = "#0f172a"; c.fillRect(0, 0, canvas.width, canvas.height);
    // 画网格
    c.strokeStyle = "#334155"; c.lineWidth = 1;
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * canvas.width;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, canvas.height); c.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = (j / rows) * canvas.height;
      c.beginPath(); c.moveTo(0, y); c.lineTo(canvas.width, y); c.stroke();
    }
    // 画物料框
    for (let i = 0; i < comps.length; i++) {
      const b = comps[i].bboxGrid;
      const x = (b.c / cols) * canvas.width;
      const y = (b.r / rows) * canvas.height;
      const ww = (b.w / cols) * canvas.width;
      const hh = (b.h / rows) * canvas.height;
      c.strokeStyle = "#38bdf8"; c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, ww - 2, hh - 2);
      c.fillStyle = "rgba(56,189,248,.18)";
      c.fillRect(x, y, ww, hh);
      c.fillStyle = "#38bdf8"; c.font = "bold 12px ui-monospace,Consolas,monospace";
      c.fillText(`#${i}`, x + 4, y + 14);
    }
  }
  function drawLayers(canvas, comps, layers, cols, rows, w, h) {
    const c = canvas.getContext("2d");
    c.fillStyle = "#0f172a"; c.fillRect(0, 0, canvas.width, canvas.height);
    // 按层级从小到大画（最底层先画）
    const order = comps.map((_, i) => i).sort((a, b) => (layers[a] || 0) - (layers[b] || 0));
    const colors = ["#facc15", "#fb923c", "#ef4444", "#a855f7", "#22d3ee"];
    for (const i of order) {
      const b = comps[i].bboxGrid;
      const layer = layers[i] || 0;
      const color = colors[Math.min(layer, colors.length - 1)];
      const x = (b.c / cols) * canvas.width;
      const y = (b.r / rows) * canvas.height;
      const ww = (b.w / cols) * canvas.width;
      const hh = (b.h / rows) * canvas.height;
      c.fillStyle = color + "55";
      c.fillRect(x, y, ww, hh);
      c.strokeStyle = color; c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, ww - 2, hh - 2);
      c.fillStyle = "#f8fafc"; c.font = "bold 11px ui-monospace,Consolas,monospace";
      c.fillText(`L${layer} #${i}`, x + 4, y + 14);
    }
  }
  function putImageDataScaled(canvas, img, w, h) {
    const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
    tmp.getContext("2d").putImageData(img, 0, 0);
    const c = canvas.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  }
}
