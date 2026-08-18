// visual-parser.js — 物料空间变化检测（P1）
// Canvas 帧差法：对比前后两张俯拍截图，检测物料变化区域
// 用法：const desc = detectChange(prevCanvas, currCanvas);
// 返回 "画面左侧发生了变化（变化率23%）" 或 null（无明显变化 / 计算失败）
// 【稳定性】所有错误内部 catch，调用方不需要再 try/catch

export function detectChange(prevCanvas, currCanvas, options = {}) {
  try {
    // 边界检查：参数不对直接返回 null，不抛错
    if (!prevCanvas || !currCanvas) return null;
    if (typeof prevCanvas.getContext !== "function" || typeof currCanvas.getContext !== "function") return null;
    const prevW = prevCanvas.width || prevCanvas.videoWidth;
    const prevH = prevCanvas.height || prevCanvas.videoHeight;
    const currW = currCanvas.width || currCanvas.videoWidth;
    const currH = currCanvas.height || currCanvas.videoHeight;
    if (!prevW || !prevH || !currW || !currH) return null;

    const W = options.width || 64;
    const H = options.height || 48;
    const pixelThreshold = options.pixelThreshold || 30;   // 单像素灰度差阈值
    const changeRatio = options.changeRatio || 0.02;       // 变化像素占比阈值（<2%忽略）

    const prev = toGray(prevCanvas, W, H);
    const curr = toGray(currCanvas, W, H);
    if (!prev || !curr || prev.length !== curr.length) return null;

    let changed = 0;
    let minX = W, minY = H, maxX = 0, maxY = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (Math.abs(prev[i] - curr[i]) > pixelThreshold) {
          changed++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    const ratio = changed / (W * H);
    if (ratio < changeRatio) return null;

    const cx = (minX + maxX) / 2 / W;
    const cy = (minY + maxY) / 2 / H;
    const vPos = cy < 0.33 ? "上方" : cy > 0.66 ? "下方" : "中间";
    const hPos = cx < 0.33 ? "左侧" : cx > 0.66 ? "右侧" : "";

    return `画面${hPos}${vPos}发生了变化（变化率${Math.round(ratio * 100)}%）`;
  } catch (e) {
    // P1 功能，算失败不影响主流程，只 warn
    console.warn("[VisualParser] 帧差检测失败:", e?.message || e);
    return null;
  }
}

// canvas 转灰度数组（缩小到 W×H 降噪）
function toGray(canvas, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(canvas, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    if (!img || !img.data) return null;
    const data = img.data;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      gray[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    }
    return gray;
  } catch (_) {
    // 跨域 / canvas 污染会抛错，直接返回 null
    return null;
  }
}
