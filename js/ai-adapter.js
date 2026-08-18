(function attachWhisperAI(root) {
  "use strict";

  const REQUEST_TIMEOUT_MS = 18000;
  const WORK_REQUEST_TIMEOUT_MS = 32000;
  const ALLOWED_DIMENSIONS = new Set([
    "attention",
    "aesthetic",
    "making_process",
    "meaning_association",
    "values",
    "worldview_tension",
    "language_voice",
    "boundary",
  ]);

  const clean = (value, max = 1000) => String(value ?? "").replaceAll("\u0000", "").trim().slice(0, max);

  function normalizeCandidate(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const statement = clean(candidate.statement, 1000);
    if (!statement) return null;
    return {
      dimension: ALLOWED_DIMENSIONS.has(candidate.dimension) ? candidate.dimension : "meaning_association",
      statement,
      confidence: ["tentative", "developing", "well_supported"].includes(candidate.confidence)
        ? candidate.confidence
        : "tentative",
      permittedUses: Array.isArray(candidate.permittedUses)
        ? candidate.permittedUses.map((use) => clean(use, 80)).filter(Boolean).slice(0, 4)
        : [],
    };
  }

  function normalizeResponse(payload, expectedStage) {
    if (!payload || payload.status !== "ok" || payload.stage !== expectedStage) {
      throw new Error(clean(payload?.error, 240) || "AI 服务暂时不可用。");
    }
    if (expectedStage === "followup") {
      const followUpQuestion = clean(payload.followUpQuestion, 300);
      if (!followUpQuestion) throw new Error("AI 没有返回可用的追问。");
      return {
        mode: "ai",
        acknowledgement: clean(payload.acknowledgement, 300),
        followUpQuestion,
      };
    }
    const candidates = (Array.isArray(payload.candidates) ? payload.candidates : [])
      .map(normalizeCandidate)
      .filter(Boolean)
      .slice(0, 3);
    if (!candidates.length) throw new Error("AI 没有返回可用的理解候选。");
    return { mode: "ai", candidates };
  }

  async function analyze(stage, payload) {
    if (!new Set(["followup", "candidates"]).has(stage)) throw new Error("无法识别这个分析阶段。");
    const controller = new AbortController();
    const timer = root.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await root.fetch("/api/onboarding/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, ...payload }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(clean(data.error, 240) || "AI 服务暂时不可用。");
      return normalizeResponse(data, stage);
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("AI 回应超时，已切换到本地模式。");
      throw error;
    } finally {
      root.clearTimeout(timer);
    }
  }

  async function extractIdentity({ caseId, planet = "一个总会注意的细节", userInput, existingKernel = [] }) {
    const input = clean(userInput, 2400);
    if (!input) throw new Error("请先留下一点文字，再让 AI 试着理解。");
    const controller = new AbortController();
    const timer = root.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await root.fetch("/api/identity/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: clean(caseId, 80),
          planet: clean(planet, 120),
          userInput: input,
          existingKernel: Array.isArray(existingKernel) ? existingKernel.slice(0, 12) : [],
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== "ok" || !data.extraction) {
        throw new Error(clean(data.error, 240) || "Creator Identity 服务暂时不可用。");
      }
      return { extraction: data.extraction, usage: data.usage || null };
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("AI 回应超时，请稍后再试。");
      throw error;
    } finally {
      root.clearTimeout(timer);
    }
  }

  async function analyzeWork({ title, time, reason, imageDataUrl, visualSignals = {}, creatorKernel = [] }) {
    if (!/^data:image\/(?:jpeg|png|webp);base64,/iu.test(String(imageDataUrl || ""))) throw new Error("请先上传一张作品图片。");
    const controller = new AbortController();
    const timer = root.setTimeout(() => controller.abort(), WORK_REQUEST_TIMEOUT_MS);
    try {
      const response = await root.fetch("/api/work/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: clean(title, 180),
          time: clean(time, 120),
          reason: clean(reason, 1600),
          imageDataUrl,
          visualSignals,
          creatorKernel: Array.isArray(creatorKernel) ? creatorKernel.slice(0, 5) : [],
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== "ok" || !data.analysis) throw new Error(clean(data.error, 300) || "作品 AI 暂时不可用。");
      return { analysis: data.analysis, usage: data.usage || null };
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("作品 AI 回应超时；这次会保留你的原始介绍。");
      throw error;
    } finally { root.clearTimeout(timer); }
  }

  root.WhisperAI = { analyze, normalizeResponse, extractIdentity, analyzeWork };
})(typeof window !== "undefined" ? window : globalThis);
