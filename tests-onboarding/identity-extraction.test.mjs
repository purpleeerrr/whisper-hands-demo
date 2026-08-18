import assert from "node:assert/strict";
import test from "node:test";
import { buildIdentityMessages, callIdentityAi, isPublicStaticPath, normalizeIdentityResult, sanitizeIdentityInput } from "../server.mjs";

test("keeps Identity Prompt Lab input narrow", () => {
  const payload = sanitizeIdentityInput({
    userInput: "裂纹。",
    existingKernel: Array.from({ length: 8 }, (_, index) => ({ id: `k-${index}`, statement: `确认内容 ${index}`, privateRawStory: "must not pass" })),
    fullProfile: { private: true },
  });
  assert.equal(payload.planet, "一个总会注意的细节");
  assert.equal(payload.existingKernel.length, 5);
  assert.equal("fullProfile" in payload, false);
  assert.equal("privateRawStory" in payload.existingKernel[0], false);
});

test("the prompt explicitly forbids threads from a one-word clue", () => {
  const payload = sanitizeIdentityInput({ userInput: "裂纹。" });
  const systemPrompt = buildIdentityMessages(payload)[0].content;
  assert.match(systemPrompt, /threadCandidates 和 userFacingCandidates 必须为空/u);
  assert.match(systemPrompt, /注意到不等于喜欢/u);
});

test("all six onboarding planets receive their own interpretation boundary", () => {
  const cases = [
    ["一件喜欢的作品", /不得从一个作品推断固定品味/u],
    ["一个反复想到的人", /严禁推断依恋类型/u],
    ["一处忘不掉的场景", /不得把难忘自动解释为创伤/u],
    ["一种想尝试的材料", /不等于用户已经使用/u],
    ["一个总会注意的细节", /注意到不等于喜欢/u],
    ["一句现在想说的话", /所有 Fact 与 Thread 默认 scope 为 moment/u],
  ];
  cases.forEach(([planet, pattern]) => {
    const payload = sanitizeIdentityInput({ planet, userInput: "测试输入。" });
    assert.equal(payload.planet, planet);
    assert.match(buildIdentityMessages(payload)[0].content, pattern);
  });
});

test("moment speech and material intentions cannot be normalized as long-term identity", () => {
  const raw = JSON.stringify({
    explicitFactCandidates: [{ statement: "候选 Fact。", scope: "long_term" }],
    threadCandidates: [{ threadKey: "candidate", statement: "候选 Thread。", scope: "long_term", confidence: "well_supported" }],
  });
  const speech = normalizeIdentityResult(raw, "一句现在想说的话");
  assert.equal(speech.explicitFactCandidates[0].scope, "moment");
  assert.equal(speech.threadCandidates[0].scope, "moment");
  const material = normalizeIdentityResult(raw, "一种想尝试的材料");
  assert.equal(material.explicitFactCandidates[0].scope, "project");
  assert.equal(material.threadCandidates[0].scope, "project");
});

test("forces all model interpretations to remain non-kernel candidates", () => {
  const result = normalizeIdentityResult(JSON.stringify({
    explicitFactCandidates: [{ statement: "我会注意裂纹。", scope: "recurring", needsUserConfirmation: false }],
    observations: [{ dimension: "attention", statement: "用户提到裂纹。" }],
    threadCandidates: [{ threadKey: "cracks", statement: "我喜欢裂纹。", scope: "long_term", confidence: "well_supported", kernelEligible: true }],
    possibleContradictions: [{ existingThreadId: "kernel-1", relationship: "tension", explanation: "存在张力。", shouldOverwriteExisting: true }],
    kernelUpdateAllowed: true,
  }));
  assert.equal(result.kernelUpdateAllowed, false);
  assert.equal(result.explicitFactCandidates[0].needsUserConfirmation, true);
  assert.equal(result.threadCandidates[0].kernelEligible, false);
  assert.equal(result.possibleContradictions[0].shouldOverwriteExisting, false);
});

test("calls the identity model once and reports token usage", async () => {
  let calls = 0;
  const fakeFetch = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.temperature, 0.2);
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.max_tokens, 1000);
    assert.equal(body.messages.length, 2);
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ explicitFactCandidates: [], observations: [], threadCandidates: [], ambiguities: ["信息不足"], followUp: { question: "你注意的是哪一部分？", informationGain: "减少歧义" } }) } }],
      usage: { prompt_tokens: 321, completion_tokens: 123, total_tokens: 444 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const payload = sanitizeIdentityInput({ userInput: "裂纹。" });
  const result = await callIdentityAi(payload, { url: "https://example.invalid/chat/completions", model: "glm-test", apiKey: "test-only", timeoutMs: 5000 }, fakeFetch);
  assert.equal(calls, 1);
  assert.equal(result.usage.totalTokens, 444);
  assert.equal(result.extraction.kernelUpdateAllowed, false);
});

test("repairs common trailing commas without weakening kernel boundaries", () => {
  const result = normalizeIdentityResult('{"explicitFactCandidates":[],"observations":[],"threadCandidates":[],"ambiguities":["信息不足",],"kernelUpdateAllowed":true,}');
  assert.deepEqual(result.ambiguities, ["信息不足"]);
  assert.equal(result.kernelUpdateAllowed, false);
});

test("does not expose server source, tests, env or package metadata", () => {
  assert.equal(isPublicStaticPath("prompt-lab.html"), true);
  assert.equal(isPublicStaticPath("js/prompt-lab.js"), true);
  assert.equal(isPublicStaticPath("server.mjs"), false);
  assert.equal(isPublicStaticPath("tests/identity-extraction.test.mjs"), false);
  assert.equal(isPublicStaticPath("package.json"), false);
  assert.equal(isPublicStaticPath(".env"), false);
});
