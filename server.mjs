import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";

import { normalizeHardwareEvent } from "./app/event-protocol.js";

/* ─── 服务端常量 ─── */
const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_AI_URL = "https://api.magikcloud.cn/v1/chat/completions";
const DEFAULT_AI_MODEL = "glm-5.2";
const MAX_REQUEST_BYTES = 120_000;
const MAX_WORK_REQUEST_BYTES = 1_800_000;
const MAX_JSON_BYTES = 64 * 1024;
const ONLINE_WINDOW_MS = 15_000;
const DUPLICATE_WINDOW_MS = 30_000;

const ALLOWED_STAGES = new Set(["followup", "candidates"]);
const ALLOWED_DIMENSIONS = new Set([
  "attention", "aesthetic", "making_process", "meaning_association",
  "values", "worldview_tension", "language_voice", "boundary",
]);
const ALLOWED_USES = new Set(["artwork_interpretation", "creative_reflection", "creative_tips"]);
const IDENTITY_SCOPES = new Set(["moment", "project", "recurring", "long_term"]);
const IDENTITY_CONFIDENCE = new Set(["tentative", "developing", "well_supported"]);
const DEFAULT_IDENTITY_PLANET = "一个总会注意的细节";
const IDENTITY_PLANETS = new Set([
  "一件喜欢的作品", "一个反复想到的人", "一处忘不掉的场景",
  "一种想尝试的材料", DEFAULT_IDENTITY_PLANET, "一句现在想说的话",
]);
const IDENTITY_PLANET_ALIASES = new Map([
  ["喜欢的作品", "一件喜欢的作品"], ["反复想到的人", "一个反复想到的人"],
  ["忘不掉的场景", "一处忘不掉的场景"], ["想尝试的材料", "一种想尝试的材料"],
  ["一个总会注意到的细节", DEFAULT_IDENTITY_PLANET],
]);
const PLANET_IDENTITY_RULES = {
  "一件喜欢的作品": "只提取用户明确喜欢的作品或创作者为 Fact。可以提出审美注意与意义关联假设，但不得从一个作品推断固定品味、身份或价值观。追问具体吸引用户的是形式、内容、观看经验还是私人关联。",
  "一个反复想到的人": "只讨论用户明确描述的关系意义、记忆与影响。严禁推断依恋类型、创伤、关系健康度、对方动机或用户未说出的情绪。人物身份和事件为 Fact；关系意义只能是待确认假设。",
  "一处忘不掉的场景": "区分场景中明确发生的事实、用户注意到的感官细节与后来赋予的意义。不得把难忘自动解释为创伤、怀旧或强烈情绪。追问最鲜明的细节或这个场景为何仍会回来。",
  "一种想尝试的材料": "'想尝试'只是一项当前或项目层面的意图，不等于用户已经使用、擅长或长期喜欢该材料。默认 scope 为 project，不得由单次愿望生成长期审美 Thread。追问材料的触感、变化方式或它能带来的创作可能。",
  "一个总会注意的细节": "区分用户明确说出的注意对象、一次观察和长期注意模式。注意到不等于喜欢。单个名词不得形成 Thread；优先追问对象、场景与吸引用户的具体属性。",
  "一句现在想说的话": "这是此刻表达，所有 Fact 与 Thread 默认 scope 为 moment。不得把当前语气或一句话升级为长期语言风格、信念、情绪状态或人格判断。可以观察表达结构，并提出一个温和的澄清问题。",
};

const PUBLIC_FILES = new Set(["index.html", "studio.html", "prompt-lab.html"]);
const PUBLIC_DIRECTORIES = ["css/", "js/", "app/", "assets/"];
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

/* ─── 工具函数 ─── */
const clean = (value, max = 1200) => String(value ?? "").replaceAll("\u0000", "").trim().slice(0, max);
const cleanList = (values, maxItems = 8, maxLength = 180) => Array.from(new Set(
  (Array.isArray(values) ? values : []).map((value) => clean(value, maxLength)).filter(Boolean),
)).slice(0, maxItems);

/* ─── .env 加载 ─── */
export async function loadLocalEnv(filePath = join(ROOT, ".env")) {
  try {
    const raw = await readFile(filePath, { encoding: "utf8" });
    for (const line of raw.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (/^[A-Z][A-Z0-9_]*$/u.test(key) && process.env[key] == null) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

/* ─── AI 配置 ─── */
export function getAiConfig(env = process.env) {
  const timeout = Number(env.AI_TIMEOUT_MS || 15000);
  return {
    url: clean(env.AI_CHAT_COMPLETIONS_URL || DEFAULT_AI_URL, 1000),
    model: clean(env.AI_MODEL || DEFAULT_AI_MODEL, 120),
    visionModel: clean(env.AI_VISION_MODEL, 160),
    apiKey: clean(env.AI_API_KEY, 1000),
    timeoutMs: Number.isFinite(timeout) ? Math.min(45000, Math.max(3000, timeout)) : 15000,
  };
}

/* ─── Onboarding AI ─── */
export function sanitizeAnalysisPayload(input) {
  const stage = clean(input?.stage, 30);
  if (!ALLOWED_STAGES.has(stage)) throw new Error("无法识别这个分析阶段。");
  const clues = (Array.isArray(input?.source?.clues) ? input.source.clues : []).slice(0, 6).map((clue) => ({
    title: clean(clue?.title, 180),
    dimension: ALLOWED_DIMENSIONS.has(clue?.dimension) ? clue.dimension : "meaning_association",
    text: clean(clue?.text, 1000),
    hasImage: Boolean(clue?.hasImage),
  })).filter((clue) => clue.title && (clue.text || clue.hasImage));
  const confirmedSlices = (Array.isArray(input?.confirmedSlices) ? input.confirmedSlices : []).slice(0, 12).map((slice) => ({
    dimension: ALLOWED_DIMENSIONS.has(slice?.dimension) ? slice.dimension : "meaning_association",
    statement: clean(slice?.statement, 700),
  })).filter((slice) => slice.statement);
  return {
    stage,
    source: {
      type: clean(input?.source?.type, 40) || "clue",
      title: clean(input?.source?.title, 180),
      text: clean(input?.source?.text, 2000),
      hasImage: Boolean(input?.source?.hasImage),
      clues,
    },
    followUp: { question: clean(input?.followUp?.question, 300), answer: clean(input?.followUp?.answer, 1200) },
    selections: { attention: cleanList(input?.selections?.attention), ways: cleanList(input?.selections?.ways) },
    confirmedSlices,
  };
}

export function buildMessages(payload) {
  const system = [
    "You are the narrow onboarding interpretation service for Whisper Hands, a creative process companion.",
    "Respond in natural Simplified Chinese and return JSON only, without Markdown fences.",
    "Separate observation from interpretation. Never diagnose emotion, mental health, trauma, attachment, intelligence, or personality type.",
    "Use tentative language. Do not turn a single clue into a stable identity claim. Preserve uncertainty and contradiction.",
    "You may draw carefully from aesthetics, creative practice, philosophy, neuroscience, and nonviolent communication, but only to formulate a grounded question or an editable hypothesis—not an expert diagnosis.",
    "Do not quote or reveal prior confirmed slices unless directly relevant. Do not invent visual observations: image bytes are not included.",
  ].join(" ");
  const stageInstruction = payload.stage === "followup"
    ? "Return exactly: {\"acknowledgement\":\"one short sentence\",\"followUpQuestion\":\"one gentle, specific question\"}. Ask only one question."
    : "Return exactly: {\"candidates\":[{\"dimension\":\"one allowed dimension\",\"statement\":\"first-person editable candidate\",\"confidence\":\"tentative|developing\",\"permittedUses\":[\"artwork_interpretation|creative_reflection|creative_tips\"]}]}. Return 1-3 candidates. Every statement must be confirmable, rejectable, and grounded in supplied evidence.";
  return [
    { role: "system", content: `${system} ${stageInstruction}` },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

function extractJsonText(content) {
  const text = clean(content, 12000).replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON。");
  return text.slice(start, end + 1);
}

export function normalizeModelResult(stage, rawContent) {
  let parsed;
  try { parsed = JSON.parse(extractJsonText(rawContent)); } catch { throw new Error("模型返回格式无法解析。"); }
  if (stage === "followup") {
    const followUpQuestion = clean(parsed.followUpQuestion, 300);
    if (!followUpQuestion) throw new Error("模型没有返回有效追问。");
    return { acknowledgement: clean(parsed.acknowledgement, 300), followUpQuestion };
  }
  const candidates = (Array.isArray(parsed.candidates) ? parsed.candidates : []).slice(0, 3).map((candidate) => ({
    dimension: ALLOWED_DIMENSIONS.has(candidate?.dimension) ? candidate.dimension : "meaning_association",
    statement: clean(candidate?.statement, 1000),
    confidence: ["tentative", "developing"].includes(candidate?.confidence) ? candidate.confidence : "tentative",
    permittedUses: cleanList(candidate?.permittedUses, 3, 80).filter((use) => ALLOWED_USES.has(use)),
  })).filter((candidate) => candidate.statement);
  if (!candidates.length) throw new Error("模型没有返回有效候选。");
  return { candidates };
}

export async function callAi(payload, config, fetchImpl = fetch) {
  if (!config.url || !config.model || !config.apiKey) throw new Error("AI_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Accept-Language": "zh-CN,zh;q=0.9" },
      body: JSON.stringify({ model: config.model, messages: buildMessages(payload), stream: false, temperature: 0.45, max_tokens: 900 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("模型响应中没有文本内容。");
    return normalizeModelResult(payload.stage, content);
  } finally { clearTimeout(timer); }
}

/* ─── Identity AI ─── */
export function sanitizeIdentityInput(input) {
  const userInput = clean(input?.userInput, 1800);
  if (!userInput) throw new Error("IDENTITY_INPUT_REQUIRED");
  const requestedRawPlanet = clean(input?.planet, 120) || DEFAULT_IDENTITY_PLANET;
  const requestedPlanet = IDENTITY_PLANET_ALIASES.get(requestedRawPlanet) || requestedRawPlanet;
  if (!IDENTITY_PLANETS.has(requestedPlanet)) throw new Error("IDENTITY_PLANET_INVALID");
  const existingKernel = (Array.isArray(input?.existingKernel) ? input.existingKernel : []).slice(0, 5).map((item, index) => ({
    id: clean(item?.id, 120) || `existing-${index + 1}`,
    statement: clean(item?.statement, 700),
    scope: IDENTITY_SCOPES.has(item?.scope) ? item.scope : "long_term",
    status: "confirmed",
  })).filter((item) => item.statement);
  return {
    schemaVersion: "identity-extraction-input.v0.1",
    caseId: clean(input?.caseId, 40),
    planet: requestedPlanet,
    evidence: { id: "current-evidence", userInput, context: `用户正在回答：${requestedPlanet}。` },
    existingKernel,
  };
}

export function buildIdentityMessages(payload) {
  const system = [
    "你是絮手 Creator Identity Engine 的窄域信息提取器。只处理当前证据，不提供心理诊断。",
    "严格区分：用户明确表达的事实、对当前证据的观察、需要确认的 Identity Thread 假设。AI inference 不等于 truth。",
    "单份证据不得形成 Observed Pattern，不得进入 Creator Identity Kernel。kernelUpdateAllowed 必须为 false。",
    "不得推断人格类型、创伤、依恋、精神健康、智力或未被用户说出的情绪。信息不足时追问，不要补全。",
    `当前星球的专属边界：${PLANET_IDENTITY_RULES[payload.planet]}`,
    "如果 userInput 只是单个名词或极短片段，threadCandidates 和 userFacingCandidates 必须为空，只能记录与当前星球语境一致的最小 Fact/Observation、列出歧义并提出一个追问；不得把一次提及扩张成广泛偏好或稳定身份。",
    "旧 Kernel 与新证据不一致时，记录 tension 或 possible contradiction；绝不覆盖旧内容。",
    "所有 statement 使用自然、克制的简体中文。给用户看的候选最多两条。只返回 JSON，不要 Markdown。",
    "JSON 字段必须是：schemaVersion, explicitFactCandidates, observations, threadCandidates, supportedExistingThreads, possibleContradictions, ambiguities, followUp, userFacingCandidates, kernelUpdateAllowed。",
    "Fact 字段：statement, scope, certainty。Observation 字段：dimension, statement。Thread 字段：threadKey, statement, scope, confidence。Contradiction 字段：existingThreadId, relationship, explanation, shouldOverwriteExisting。",
    "followUp 为 null 或包含 question, informationGain, requiredBeforeThreadConfirmation。userFacingCandidates 字段为 statement, sourceType。",
  ].join(" ");
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

const normalizeIdentityItems = (items, limit, mapper) => (Array.isArray(items) ? items : []).slice(0, limit).map(mapper).filter(Boolean);

export function normalizeIdentityResult(rawContent, planet = DEFAULT_IDENTITY_PLANET) {
  let parsed;
  try { parsed = JSON.parse(extractJsonText(rawContent)); } catch {
    try {
      const repaired = extractJsonText(rawContent).replace(/[""]/gu, '"').replace(/[，]/gu, ",").replace(/,\s*([}\]])/gu, "$1");
      parsed = JSON.parse(repaired);
    } catch { throw new Error("IDENTITY_FORMAT_INVALID"); }
  }
  const canonicalPlanet = IDENTITY_PLANET_ALIASES.get(planet) || planet;
  const forcedScope = canonicalPlanet === "一句现在想说的话" ? "moment" : canonicalPlanet === "一种想尝试的材料" ? "project" : null;
  const explicitFactCandidates = normalizeIdentityItems(parsed.explicitFactCandidates, 3, (item) => {
    const statement = clean(item?.statement, 700);
    return statement ? { statement, scope: forcedScope || (IDENTITY_SCOPES.has(item?.scope) ? item.scope : "moment"), certainty: clean(item?.certainty, 80) || "explicit_but_underspecified", evidenceRefs: ["current-evidence"], needsUserConfirmation: true } : null;
  });
  const observations = normalizeIdentityItems(parsed.observations, 4, (item) => {
    const statement = clean(item?.statement, 700);
    return statement ? { dimension: clean(item?.dimension, 80) || "attention", statement, evidenceRefs: ["current-evidence"] } : null;
  });
  const threadCandidates = normalizeIdentityItems(parsed.threadCandidates, 2, (item) => {
    const statement = clean(item?.statement, 700);
    return statement ? { threadKey: clean(item?.threadKey, 120) || "unnamed_thread", statement, scope: forcedScope || (IDENTITY_SCOPES.has(item?.scope) ? item.scope : "moment"), confidence: IDENTITY_CONFIDENCE.has(item?.confidence) ? item.confidence : "tentative", evidenceRefs: ["current-evidence"], kernelEligible: false } : null;
  });
  const supportedExistingThreads = cleanList(parsed.supportedExistingThreads, 3, 300);
  const possibleContradictions = normalizeIdentityItems(parsed.possibleContradictions, 3, (item) => {
    const explanation = clean(item?.explanation, 700);
    return explanation ? { existingThreadId: clean(item?.existingThreadId, 120), relationship: ["tension", "possible_contradiction", "exception"].includes(item?.relationship) ? item.relationship : "tension", explanation, shouldOverwriteExisting: false } : null;
  });
  const ambiguities = cleanList(parsed.ambiguities, 4, 400);
  const followUpQuestion = clean(parsed.followUp?.question, 400);
  const followUp = followUpQuestion ? { question: followUpQuestion, informationGain: clean(parsed.followUp?.informationGain, 500), requiredBeforeThreadConfirmation: parsed.followUp?.requiredBeforeThreadConfirmation !== false } : null;
  const userFacingCandidates = normalizeIdentityItems(parsed.userFacingCandidates, 2, (item) => {
    const statement = clean(item?.statement, 500);
    return statement ? { statement, sourceType: clean(item?.sourceType, 80) || "thread_candidate" } : null;
  });
  return { schemaVersion: "identity-extraction.v0.1", explicitFactCandidates, observations, threadCandidates, supportedExistingThreads, possibleContradictions, ambiguities, followUp, userFacingCandidates, kernelUpdateAllowed: false };
}

export async function callIdentityAi(payload, config, fetchImpl = fetch) {
  if (!config.url || !config.model || !config.apiKey) throw new Error("AI_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Accept-Language": "zh-CN,zh;q=0.9" },
      body: JSON.stringify({ model: config.model, messages: buildIdentityMessages(payload), stream: false, thinking: { type: "disabled" }, response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 1000 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("IDENTITY_CONTENT_MISSING");
    return { extraction: normalizeIdentityResult(content, payload.planet), usage: { promptTokens: Number(data?.usage?.prompt_tokens) || null, completionTokens: Number(data?.usage?.completion_tokens) || null, totalTokens: Number(data?.usage?.total_tokens) || null } };
  } finally { clearTimeout(timer); }
}

/* ─── Work Analysis AI ─── */
export function sanitizeWorkAnalysisInput(input) {
  const imageDataUrl = clean(input?.imageDataUrl, 1_600_000);
  if (!/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/iu.test(imageDataUrl)) throw new Error("WORK_IMAGE_REQUIRED");
  const creatorKernel = (Array.isArray(input?.creatorKernel) ? input.creatorKernel : []).slice(0, 5).map((item, index) => ({
    id: clean(item?.id, 120) || `kernel-${index + 1}`, statement: clean(item?.statement, 500), scope: IDENTITY_SCOPES.has(item?.scope) ? item.scope : "long_term",
  })).filter((item) => item.statement);
  return {
    schemaVersion: "work-analysis-input.v0.1",
    work: { title: clean(input?.title, 180) || "未命名作品", time: clean(input?.time, 120), userIntroduction: clean(input?.reason, 1600) },
    creatorKernel,
    visualSignals: { width: Math.max(1, Math.min(5000, Number(input?.visualSignals?.width) || 1)), height: Math.max(1, Math.min(5000, Number(input?.visualSignals?.height) || 1)), orientation: clean(input?.visualSignals?.orientation, 40), dominantColors: cleanList(input?.visualSignals?.dominantColors, 4, 20), brightness: clean(input?.visualSignals?.brightness, 40), contrast: clean(input?.visualSignals?.contrast, 40), saturation: clean(input?.visualSignals?.saturation, 40), visualDensity: clean(input?.visualSignals?.visualDensity, 40), lightDistribution: clean(input?.visualSignals?.lightDistribution, 80) },
    imageDataUrl,
  };
}

export function buildWorkAnalysisMessages(payload) {
  const system = [
    "你是絮手的 Work Interpretation Engine。你正在看一件用户上传的作品。",
    "严格区分图像中可见的事实与解释性假设。visualObservations 只能写可以从图像直接支持的颜色、光线、形态、材质表象、构图与空间关系。",
    "formalLanguage 解释这些形式元素如何共同工作，但不要断言创作者的心理、人格、创伤、情绪或人生经历。",
    "inspirationHypotheses 必须使用'可能、仿佛、可以让人联想到'等开放语言；不得把联想冒充作者真实灵感。",
    "polishedIntroduction 要保留用户明确说出的事实和第一人称立场，写成 100–180 字的自然简体中文作品介绍；不得添加用户未说过的生平事实。",
    "Creator Identity Kernel 只能帮助调整关注角度和语言，不得被当作图像事实，也不得在回复里直接复述私人档案。",
    "如果你无法看到图片，visionAvailable 必须为 false，其他分析数组必须为空。只返回 JSON，不要 Markdown。",
    "JSON 字段必须是：schemaVersion, visionAvailable, visualObservations, formalLanguage, inspirationHypotheses, polishedIntroduction, followUpQuestion。",
  ].join(" ");
  return [
    { role: "system", content: system },
    { role: "user", content: [{ type: "text", text: JSON.stringify({ schemaVersion: payload.schemaVersion, work: payload.work, creatorKernel: payload.creatorKernel, instruction: "看图后生成一份等待用户确认的作品解读初稿。" }) }, { type: "image_url", image_url: { url: payload.imageDataUrl, detail: "low" } }] },
  ];
}

export function normalizeWorkAnalysisResult(rawContent) {
  let parsed;
  try { parsed = JSON.parse(extractJsonText(rawContent)); } catch { throw new Error("WORK_ANALYSIS_FORMAT_INVALID"); }
  if (parsed?.visionAvailable === false) throw new Error("VISION_NOT_SUPPORTED");
  const visualObservations = cleanList(parsed?.visualObservations, 5, 300);
  const formalLanguage = cleanList(parsed?.formalLanguage, 4, 400);
  const inspirationHypotheses = cleanList(parsed?.inspirationHypotheses, 3, 400);
  const polishedIntroduction = clean(parsed?.polishedIntroduction, 1200);
  if (!visualObservations.length || !polishedIntroduction) throw new Error("WORK_ANALYSIS_INCOMPLETE");
  return { schemaVersion: "work-analysis.v0.1", visionAvailable: true, visualObservations, formalLanguage, inspirationHypotheses, polishedIntroduction, followUpQuestion: clean(parsed?.followUpQuestion, 400), identityUpdateAllowed: false };
}

function localVisualObservations(signals) {
  const palette = signals.dominantColors.length ? `主要色彩取样为 ${signals.dominantColors.join("、")}` : "未形成稳定的主色取样";
  return [
    `画面为${signals.orientation || "未确定"}构图，尺寸比例约为 ${signals.width}:${signals.height}；${palette}。`,
    `图像整体明度${signals.brightness || "未确定"}、对比度${signals.contrast || "未确定"}、饱和度${signals.saturation || "未确定"}。`,
    `画面变化密度${signals.visualDensity || "未确定"}；${signals.lightDistribution || "明暗分布未确定"}。`,
  ];
}

export function buildWorkSignalMessages(payload) {
  const system = [
    "你是絮手的作品文字解读器。你没有直接看到图片，只收到浏览器本地计算的色彩、明度、对比与画面密度，以及用户自己的介绍。",
    "不得声称看见具体物体、造型、人物、材料、技法或空间；不得根据数值特征补出不存在的图像内容。",
    "formalLanguage 只能讨论色彩关系、明暗、对比、视觉密度与画幅方向可能带来的形式感。",
    "inspirationHypotheses 必须以'可能、可以联想到、也许'表达，并优先从用户原话发展；不得编造作者经历。",
    "polishedIntroduction 保留用户明确事实与第一人称立场，写成 100–180 字自然简体中文。",
    "Creator Identity Kernel 只能调节关注角度，不得直接复述。只返回 JSON，不要 Markdown。",
    "JSON 字段：formalLanguage, inspirationHypotheses, polishedIntroduction, followUpQuestion。",
  ].join(" ");
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ work: payload.work, localVisualSignals: payload.visualSignals, creatorKernel: payload.creatorKernel }) },
  ];
}

export function normalizeWorkSignalResult(rawContent, signals) {
  let parsed;
  try { parsed = JSON.parse(extractJsonText(rawContent)); } catch { throw new Error("WORK_ANALYSIS_FORMAT_INVALID"); }
  const formalLanguage = cleanList(parsed?.formalLanguage, 4, 400);
  const inspirationHypotheses = cleanList(parsed?.inspirationHypotheses, 3, 400);
  const polishedIntroduction = clean(parsed?.polishedIntroduction, 1200);
  if (!formalLanguage.length || !polishedIntroduction) throw new Error("WORK_ANALYSIS_INCOMPLETE");
  return { schemaVersion: "work-analysis.v0.1", visionAvailable: false, analysisBasis: "local_visual_signals", visualObservations: localVisualObservations(signals), formalLanguage, inspirationHypotheses, polishedIntroduction, followUpQuestion: clean(parsed?.followUpQuestion, 400), identityUpdateAllowed: false };
}

export async function callWorkAnalysisAi(payload, config, fetchImpl = fetch) {
  if (!config.url || !config.model || !config.apiKey) throw new Error("AI_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(config.timeoutMs, 30000));
  try {
    const useVision = Boolean(config.visionModel);
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Accept-Language": "zh-CN,zh;q=0.9" },
      body: JSON.stringify({ model: useVision ? config.visionModel : config.model, messages: useVision ? buildWorkAnalysisMessages(payload) : buildWorkSignalMessages(payload), stream: false, thinking: { type: "disabled" }, response_format: { type: "json_object" }, temperature: 0.35, max_tokens: 1200 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("WORK_ANALYSIS_CONTENT_MISSING");
    return { analysis: useVision ? { ...normalizeWorkAnalysisResult(content), analysisBasis: "vision_model" } : normalizeWorkSignalResult(content, payload.visualSignals), usage: { totalTokens: Number(data?.usage?.total_tokens) || null } };
  } finally { clearTimeout(timer); }
}

/* ─── 转写 AI ─── */
export function sanitizeTranscribeInsightInput(input) {
  const transcript = clean(input?.transcript, 6000);
  if (!transcript) throw new Error("TRANSCRIBE_INPUT_REQUIRED");
  return { transcript, sessionType: clean(input?.sessionType, 40) || "create" };
}

export function buildTranscribeInsightMessages(payload) {
  const system = [
    "你是絮手的语音理解助手。用户刚完成一段创作，语音转写如下。",
    "从这段转写里提取最多 3 个关键标签，标签只能选一个维度：材料、颜色、动作、节奏、触感、光线、空间、情绪状态（取创作描述，不诊断用户）。",
    "只返回 JSON，不要 Markdown，不要解释。",
    "JSON 格式：{\"tags\":[\"标签1\",\"标签2\",\"标签3\"]}，每个标签不超过 6 个字，禁止重复。",
    `创作类型参考：${payload.sessionType}。`,
  ].join(" ");
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ transcript: payload.transcript }) },
  ];
}

export function normalizeTranscribeInsightResult(rawContent) {
  let parsed;
  try { parsed = JSON.parse(extractJsonText(rawContent)); } catch { throw new Error("TRANSCRIBE_FORMAT_INVALID"); }
  const tags = cleanList(parsed?.tags, 3, 10).filter((tag) => tag && tag.length <= 8);
  if (!tags.length) throw new Error("TRANSCRIBE_NO_TAGS");
  return { tags };
}

export async function callTranscribeInsightAi(payload, config, fetchImpl = fetch) {
  if (!config.url || !config.model || !config.apiKey) throw new Error("AI_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(config.timeoutMs, 20000));
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages: buildTranscribeInsightMessages(payload), stream: false, thinking: { type: "disabled" }, response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 80 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("TRANSCRIBE_CONTENT_MISSING");
    return normalizeTranscribeInsightResult(content);
  } finally { clearTimeout(timer); }
}

/* ─── Creative Reflect / Tips ─── */
export function sanitizeCreativeInput(input) {
  const sessionSummary = clean(input?.sessionSummary, 2000);
  const meaningLayer = clean(input?.meaningLayer, 3000);
  const confirmedSlices = Array.isArray(input?.confirmedSlices) ? input.confirmedSlices.slice(0, 12).map((slice) => ({
    dimension: clean(slice?.dimension, 60), statement: clean(slice?.statement, 700),
  })) : [];
  if (!sessionSummary && !meaningLayer && !confirmedSlices.length) throw new Error("CREATIVE_INPUT_REQUIRED");
  return { sessionSummary, meaningLayer, confirmedSlices };
}

export function buildCreativeReflectMessages(payload) {
  const system = [
    "你是絮手的创作过程回顾助手。根据用户的创作时间线和语音标记，写️段简短反思（60–120字）。",
    "用「你刚才」「这一小时」「这段材料」等第二人称，不评价作品，只复盘过程。",
    "别给建议，别提重复概念，别用破折号排比。说人话，要像对一个刚结束创作的朋友说话。",
    "只返回 JSON：{\"reflection\":\"……\"}",
  ].join(" ");
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

export function buildCreativeTipsMessages(payload) {
  const system = [
    "你是絮手的创作提示助手。根据用户的创作回顾和 Meaning Layer，给️条温和建议（各不超过 40 字）。",
    "不重复已放弃的方法，不否定当前方向。用「可以试试」「下次注意」等软语气。",
    "只返回 JSON：{\"tips\":[\"……\",\"……\"]}，最多 2 条。",
  ].join(" ");
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

export function normalizeCreativeResult(rawContent, type) {
  let parsed;
  try { parsed = JSON.parse(extractJsonText(rawContent)); } catch { throw new Error("CREATIVE_FORMAT_INVALID"); }
  if (type === "reflect") {
    const reflection = clean(parsed?.reflection, 240);
    if (!reflection) throw new Error("CREATIVE_NO_RESULT");
    return { reflection };
  }
  const tips = cleanList(parsed?.tips, 2, 80).filter(Boolean);
  if (!tips.length) throw new Error("CREATIVE_NO_RESULT");
  return { tips };
}

export async function callCreativeAi(payload, config, type, fetchImpl = fetch) {
  if (!config.url || !config.model || !config.apiKey) throw new Error("AI_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(config.timeoutMs, 20000));
  try {
    const messages = type === "reflect" ? buildCreativeReflectMessages(payload) : buildCreativeTipsMessages(payload);
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages, stream: false, thinking: { type: "disabled" }, response_format: { type: "json_object" }, temperature: 0.5, max_tokens: 300 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("CREATIVE_CONTENT_MISSING");
    return normalizeCreativeResult(content, type);
  } finally { clearTimeout(timer); }
}

  /* ─── HTTP 辅助 ─── */
async function readJsonBody(request, maxBytes = MAX_REQUEST_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) { total += chunk.length; if (total > maxBytes) throw new Error("REQUEST_TOO_LARGE"); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw new Error("INVALID_JSON"); }
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Access-Control-Allow-Origin": "*" });
  response.end(JSON.stringify(body));
}

function isPublicStaticPath(relativePath) {
  const path = clean(relativePath, 500).replaceAll("\\", "/");
  return PUBLIC_FILES.has(path) || PUBLIC_DIRECTORIES.some((directory) => path.startsWith(directory));
}

export { isPublicStaticPath };

/* ─── 静态文件服务 ─── */
async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const relativePath = normalize(pathname).replace(/^[/\\]+/u, "");
  if (!relativePath || relativePath.startsWith(".") || relativePath.includes("..")) return sendJson(response, 404, { error: "Not found" });
  if (!isPublicStaticPath(relativePath)) return sendJson(response, 404, { error: "Not found" });
  const filePath = resolve(ROOT, relativePath);
  if (relative(ROOT, filePath).startsWith("..")) return sendJson(response, 404, { error: "Not found" });
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("NOT_FILE");
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch { sendJson(response, 404, { error: "Not found" }); }
}

/* ─── 硬件桥接状态 ─── */
function createHardwareBridge({ t5BaseUrl = process.env.T5_BASE_URL || "http://192.168.4.1", now = Date.now, fetchImpl = fetch } = {}) {
  const clients = new Set();
  const recentSequence = new Map();
  const devices = { esp32: { lastSeenAt: null, deviceId: null }, t5: { lastSeenAt: null, baseUrl: t5BaseUrl } };

  function broadcast(event) {
    const packet = `event: hardware\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) client.write(packet);
  }

  function online(lastSeenAt) {
    return Number.isFinite(lastSeenAt) && now() - lastSeenAt <= ONLINE_WINDOW_MS;
  }

  return { clients, devices, recentSequence, broadcast, online, t5BaseUrl, fetchImpl, now };
}

/* ─── 硬件路由处理 ─── */
async function handleHardwareRoute(bridge, request, response) {
  const url = new URL(request.url || "/", "http://localhost");
  const { clients, devices, recentSequence, broadcast, online, t5BaseUrl, fetchImpl, now } = bridge;

  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" });
      response.end();
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/hardware/events") {
      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no", "access-control-allow-origin": "*" });
      response.write("retry: 1500\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/hardware/event") {
      const event = normalizeHardwareEvent(await readJsonBody(request, MAX_JSON_BYTES), now);
      const seenAt = now();
      const recent = recentSequence.get(event.deviceId);
      const duplicate = recent?.seq === event.seq && seenAt - recent.seenAt <= DUPLICATE_WINDOW_MS;
      devices.esp32 = { deviceId: event.deviceId, lastSeenAt: seenAt };
      if (!duplicate) { recentSequence.set(event.deviceId, { seq: event.seq, seenAt }); broadcast(event); }
      sendJson(response, 202, { accepted: true, duplicate, event: event.event });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/device/status") {
      sendJson(response, 200, { esp32: { ...devices.esp32, online: online(devices.esp32.lastSeenAt) }, t5: { ...devices.t5, online: online(devices.t5.lastSeenAt) }, bridge: { online: true, now: now() } });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/config") {
      sendJson(response, 200, { t5BaseUrl, streamUrl: "/api/t5/stream", snapshotUrl: "/api/t5/snapshot" });
      return true;
    }

    if (request.method === "GET" && (url.pathname === "/api/t5/stream" || url.pathname === "/api/t5/snapshot")) {
      const upstreamPath = url.pathname.endsWith("/snapshot") ? "/snapshot" : "/stream";
      const upstreamOptions = { headers: { accept: upstreamPath === "/stream" ? "multipart/x-mixed-replace,image/jpeg" : "image/jpeg" } };
      if (upstreamPath === "/snapshot") upstreamOptions.signal = AbortSignal.timeout(5_000);
      const upstream = await fetchImpl(`${t5BaseUrl.replace(/\/$/, "")}${upstreamPath}`, upstreamOptions);
      if (!upstream.ok || !upstream.body) throw new Error(`摄像头设备返回 HTTP ${upstream.status}`);
      devices.t5.lastSeenAt = now();
      response.writeHead(200, { "content-type": upstream.headers.get("content-type") || "application/octet-stream", "cache-control": "no-store, no-cache, must-revalidate", connection: "close" });
      Readable.fromWeb(upstream.body).on("error", () => response.destroy()).pipe(response);
      return true;
    }
  } catch (error) {
    if (response.headersSent) { response.destroy(error); return true; }
    const isClientError = error instanceof TypeError;
    sendJson(response, isClientError ? 400 : 502, { error: error.message || "bridge error" });
    return true;
  }
  return false;
}

/* ─── 合并服务器 ─── */
export function createWhisperServer({ env = process.env, fetchImpl = fetch, rootDir = ROOT, t5BaseUrl, now: nowFn } = {}) {
  const bridge = createHardwareBridge({ t5BaseUrl: t5BaseUrl || process.env.T5_BASE_URL, now: nowFn, fetchImpl });
  const staticRoot = rootDir;

  async function serve(request, response) {
    const url = new URL(request.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const relativePath = normalize(pathname).replace(/^[/\\\\]+/u, "");
    if (!relativePath || relativePath.startsWith(".") || relativePath.includes("..")) return sendJson(response, 404, { error: "Not found" });
    if (!isPublicStaticPath(relativePath)) return sendJson(response, 404, { error: "Not found" });
    const filePath = resolve(staticRoot, relativePath);
    if (relative(staticRoot, filePath).startsWith("..")) return sendJson(response, 404, { error: "Not found" });
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("NOT_FILE");
      const body = await readFile(filePath);
      response.writeHead(200, { "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch { sendJson(response, 404, { error: "Not found" }); }
  }

  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");

    /* ── 硬件桥接路由 ── */
    if (await handleHardwareRoute(bridge, request, response)) return;

    /* ── AI 路由 ── */
    if (url.pathname === "/api/work/analyze" && request.method === "POST") {
      try {
        const payload = sanitizeWorkAnalysisInput(await readJsonBody(request, MAX_WORK_REQUEST_BYTES));
        const result = await callWorkAnalysisAi(payload, getAiConfig(env), fetchImpl);
        return sendJson(response, 200, { status: "ok", ...result });
      } catch (error) {
        const message = String(error?.message || "");
        if (message === "AI_NOT_CONFIGURED") return sendJson(response, 503, { error: "作品 AI 尚未配置。" });
        if (message === "WORK_IMAGE_REQUIRED") return sendJson(response, 400, { error: "请先上传一张 JPG、PNG 或 WEBP 作品图片。" });
        if (message === "REQUEST_TOO_LARGE") return sendJson(response, 413, { error: "压缩后的作品图片仍然过大，请换一张较小的图片。" });
        if (message === "UPSTREAM_401") return sendJson(response, 401, { error: "主办方 API Key 未通过验证。" });
        if (message === "UPSTREAM_429") return sendJson(response, 429, { error: "主办方接口当前请求过多，请稍后再试。" });
        if (message === "UPSTREAM_400" || message === "VISION_NOT_SUPPORTED") return sendJson(response, 422, { error: "主办方视觉模型暂时无法读取这张图片；这次不会生成虚假的视觉分析。" });
        if (message.startsWith("UPSTREAM_")) return sendJson(response, 502, { error: `主办方图片接口返回 ${message.slice(9)}。` });
        return sendJson(response, 502, { error: "AI 暂时没有返回可信的作品视觉分析。" });
      }
    }

    if (url.pathname === "/api/identity/extract" && request.method === "POST") {
      try {
        const payload = sanitizeIdentityInput(await readJsonBody(request));
        const result = await callIdentityAi(payload, getAiConfig(env), fetchImpl);
        return sendJson(response, 200, { status: "ok", ...result });
      } catch (error) {
        const message = String(error?.message || "");
        if (message === "AI_NOT_CONFIGURED") return sendJson(response, 503, { error: "Prompt Lab 尚未配置 API Key。" });
        if (message === "IDENTITY_INPUT_REQUIRED" || message === "INVALID_JSON") return sendJson(response, 400, { error: "请先为这颗星球留下一点文字。" });
        if (message === "IDENTITY_PLANET_INVALID") return sendJson(response, 400, { error: "无法识别这颗 Identity 星球。" });
        if (message === "UPSTREAM_401") return sendJson(response, 401, { error: "主办方 API Key 未通过验证（401），请检查 Whisper Hands 自己的 .env。" });
        if (message === "UPSTREAM_429") return sendJson(response, 429, { error: "主办方接口当前请求过多，请稍后再试。" });
        if (message.startsWith("UPSTREAM_")) return sendJson(response, 502, { error: `主办方接口返回 ${message.slice(9)}，请检查模型名或接口地址。` });
        return sendJson(response, 502, { error: "AI 返回的结构暂时无法通过 v0.1 校验；这正是 Prompt Lab 要捕捉的问题。" });
      }
    }

    if (url.pathname === "/api/onboarding/analyze" && request.method === "POST") {
      try {
        const payload = sanitizeAnalysisPayload(await readJsonBody(request));
        const result = await callAi(payload, getAiConfig(env), fetchImpl);
        return sendJson(response, 200, { status: "ok", stage: payload.stage, ...result });
      } catch (error) {
        const message = String(error?.message || "");
        if (message === "AI_NOT_CONFIGURED") return sendJson(response, 503, { error: "AI 服务尚未配置，已切换到本地模式。" });
        if (message === "REQUEST_TOO_LARGE") return sendJson(response, 413, { error: "这次发送的内容过大。" });
        if (message === "INVALID_JSON" || message.includes("分析阶段")) return sendJson(response, 400, { error: "无法读取这次 AI 请求。" });
        return sendJson(response, 502, { error: "AI 服务暂时没有返回可用结果，已切换到本地模式。" });
      }
    }

    if (url.pathname === "/api/transcribe/insight" && request.method === "POST") {
      try {
        const payload = sanitizeTranscribeInsightInput(await readJsonBody(request));
        const result = await callTranscribeInsightAi(payload, getAiConfig(env), fetchImpl);
        return sendJson(response, 200, { status: "ok", ...result });
      } catch (error) {
        const message = String(error?.message || "");
        if (message === "AI_NOT_CONFIGURED") return sendJson(response, 503, { error: "AI 服务尚未配置，已切换到本地模式。" });
        if (message === "TRANSCRIBE_INPUT_REQUIRED") return sendJson(response, 400, { error: "没有收到转写内容。" });
        if (message === "REQUEST_TOO_LARGE") return sendJson(response, 413, { error: "这次发送的内容过大。" });
        if (message.startsWith("UPSTREAM_")) return sendJson(response, 502, { error: `主办方接口返回 ${message.slice(9)}。` });
        return sendJson(response, 502, { error: "AI 没有返回有效标签。" });
      }
    }

    if (url.pathname === "/api/creative/reflect" && request.method === "POST") {
      try {
        const payload = sanitizeCreativeInput(await readJsonBody(request));
        const result = await callCreativeAi(payload, getAiConfig(env), "reflect", fetchImpl);
        return sendJson(response, 200, { status: "ok", ...result });
      } catch (error) {
        const message = String(error?.message || "");
        if (message === "AI_NOT_CONFIGURED") return sendJson(response, 503, { error: "AI 服务尚未配置。" });
        if (message === "CREATIVE_INPUT_REQUIRED") return sendJson(response, 400, { error: "没有收到创作资料。" });
        if (message.startsWith("UPSTREAM_")) return sendJson(response, 502, { error: `主办方接口返回 ${message.slice(9)}。` });
        return sendJson(response, 502, { error: "AI 没有返回反思内容。" });
      }
    }

    if (url.pathname === "/api/creative/tips" && request.method === "POST") {
      try {
        const payload = sanitizeCreativeInput(await readJsonBody(request));
        const result = await callCreativeAi(payload, getAiConfig(env), "tips", fetchImpl);
        return sendJson(response, 200, { status: "ok", ...result });
      } catch (error) {
        const message = String(error?.message || "");
        if (message === "AI_NOT_CONFIGURED") return sendJson(response, 503, { error: "AI 服务尚未配置。" });
        if (message === "CREATIVE_INPUT_REQUIRED") return sendJson(response, 400, { error: "没有收到创作资料。" });
        if (message.startsWith("UPSTREAM_")) return sendJson(response, 502, { error: `主办方接口返回 ${message.slice(9)}。` });
        return sendJson(response, 502, { error: "AI 没有返回提示内容。" });
      }
    }

    /* ── 静态文件 ── */
    if (request.method === "GET" || request.method === "HEAD") return serve(request, response);
    return sendJson(response, 405, { error: "Method not allowed" });
  });
}

/* ── 直接启动 ── */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  await loadLocalEnv();
  const port = Number(process.env.PORT || 8000);
  const host = process.env.HOST || "127.0.0.1";
  const server = createWhisperServer();
  server.listen(port, host, () => {
    console.log(`Whisper Hands: http://${host}:${port}`);
    console.log(getAiConfig().apiKey ? "AI adapter: configured" : "AI adapter: local fallback (add AI_API_KEY to .env)");
    console.log(`摄像头流源: ${process.env.T5_BASE_URL || "http://192.168.4.1"}/stream`);
  });
}