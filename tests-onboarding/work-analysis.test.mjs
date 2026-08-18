import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkAnalysisMessages, callWorkAnalysisAi, normalizeWorkAnalysisResult, sanitizeWorkAnalysisInput } from "../server.mjs";

const tinyImage = `data:image/jpeg;base64,${Buffer.from("test-image").toString("base64")}`;

test("sanitizes a narrow work analysis payload", () => {
  const payload = sanitizeWorkAnalysisInput({
    title: "between",
    reason: "从 2018 年延续到现在的主题。",
    imageDataUrl: tinyImage,
    creatorKernel: [{ id: "k-1", statement: "我会注意光如何改变空间。", scope: "recurring", privateStory: "must not pass" }],
    fullProfile: { private: true },
  });
  assert.equal(payload.creatorKernel.length, 1);
  assert.equal("privateStory" in payload.creatorKernel[0], false);
  assert.equal("fullProfile" in payload, false);
  const messages = buildWorkAnalysisMessages(payload);
  assert.equal(messages[1].content[1].type, "image_url");
  assert.equal(messages[1].content[1].image_url.detail, "low");
});

test("keeps observations separate and forbids automatic identity updates", () => {
  const result = normalizeWorkAnalysisResult(JSON.stringify({
    visionAvailable: true,
    visualObservations: ["画面中有两个圆润物体。"],
    formalLanguage: ["两个物体形成靠近与分离的空间关系。"],
    inspirationHypotheses: ["可能让人联想到陪伴。"],
    polishedIntroduction: "这组作品从两个彼此靠近、又各自独立的形体展开。",
    identityUpdateAllowed: true,
  }));
  assert.equal(result.visualObservations.length, 1);
  assert.equal(result.identityUpdateAllowed, false);
});

test("does not pretend to analyze when vision is unavailable", () => {
  assert.throws(() => normalizeWorkAnalysisResult(JSON.stringify({ visionAvailable: false, visualObservations: [], polishedIntroduction: "只润色文字。" })), /VISION_NOT_SUPPORTED/u);
});

test("calls the work model exactly once", async () => {
  let calls = 0;
  const fakeFetch = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.messages[1].content[1].type, "image_url");
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ visionAvailable: true, visualObservations: ["可见两个形体。"], formalLanguage: [], inspirationHypotheses: [], polishedIntroduction: "两个形体构成作品的主要视觉关系。" }) } }],
      usage: { total_tokens: 321 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const payload = sanitizeWorkAnalysisInput({ title: "test", imageDataUrl: tinyImage });
  const result = await callWorkAnalysisAi(payload, { url: "https://example.invalid/chat/completions", model: "text-test", visionModel: "vision-test", apiKey: "test-only", timeoutMs: 5000 }, fakeFetch);
  assert.equal(calls, 1);
  assert.equal(result.usage.totalTokens, 321);
});

test("uses local visual signals with GLM when no vision model is authorized", async () => {
  let capturedBody;
  const fakeFetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      formalLanguage: ["低饱和色彩与中等对比形成克制的形式感。"],
      inspirationHypotheses: ["可能让人联想到靠近与分离。"],
      polishedIntroduction: "这件作品从一个持续多年的主题出发，让色彩与明暗关系承载仍在发展的想法。",
    }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const payload = sanitizeWorkAnalysisInput({ title: "between", reason: "持续多年的主题。", imageDataUrl: tinyImage, visualSignals: { width: 800, height: 600, orientation: "横向", dominantColors: ["#cccccc"], brightness: "中等", contrast: "中等", saturation: "较低", visualDensity: "中等", lightDistribution: "右侧整体更亮" } });
  const result = await callWorkAnalysisAi(payload, { url: "https://example.invalid/chat/completions", model: "glm-test", visionModel: "", apiKey: "test-only", timeoutMs: 5000 }, fakeFetch);
  assert.equal(capturedBody.model, "glm-test");
  assert.equal(typeof capturedBody.messages[1].content, "string");
  assert.equal(result.analysis.analysisBasis, "local_visual_signals");
  assert.match(result.analysis.visualObservations[0], /#cccccc/u);
  assert.equal(result.analysis.identityUpdateAllowed, false);
});
