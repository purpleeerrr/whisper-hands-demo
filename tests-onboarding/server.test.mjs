import assert from "node:assert/strict";
import test from "node:test";
import { callAi, getAiConfig, isPublicStaticPath, normalizeModelResult, sanitizeAnalysisPayload } from "../server.mjs";

test("sanitizes the narrow AI payload", () => {
  const payload = sanitizeAnalysisPayload({
    stage: "candidates",
    source: { type: "clue", title: "作品", text: "a".repeat(2500), hasImage: true },
    followUp: { question: "为什么？", answer: "因为光。" },
    selections: { attention: ["颜色", "颜色"], ways: ["边做边改"] },
    confirmedSlices: [{ dimension: "values", statement: "保留不确定。", rawText: "must not pass" }],
    fullProfile: { private: true },
  });

  assert.equal(payload.source.text.length, 2000);
  assert.deepEqual(payload.selections.attention, ["颜色"]);
  assert.equal(payload.confirmedSlices.length, 1);
  assert.equal("rawText" in payload.confirmedSlices[0], false);
  assert.equal("fullProfile" in payload, false);
});

test("uses the organizer gateway and model as server defaults", () => {
  const config = getAiConfig({});
  assert.equal(config.url, "https://api.magikcloud.cn/v1/chat/completions");
  assert.equal(config.model, "glm-5.2");
  assert.equal(config.visionModel, "");
  assert.equal(config.apiKey, "");
});

test("normalizes fenced GLM JSON without reasoning content", () => {
  const result = normalizeModelResult("followup", "<think>ignored</think>\n```json\n{\"acknowledgement\":\"我收到了。\",\"followUpQuestion\":\"你更想保留光，还是裂纹？\"}\n```");
  assert.equal(result.followUpQuestion, "你更想保留光，还是裂纹？");
});

test("calls an OpenAI-compatible GLM endpoint with server-only auth", async () => {
  let captured;
  const fakeFetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ candidates: [{ dimension: "attention", statement: "我目前先注意光线。", confidence: "tentative", permittedUses: ["artwork_interpretation"] }] }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const payload = sanitizeAnalysisPayload({ stage: "candidates", source: { title: "作品", text: "蓝色玻璃" } });
  const config = getAiConfig({ AI_CHAT_COMPLETIONS_URL: "https://example.invalid/chat/completions", AI_MODEL: "glm-test", AI_API_KEY: "server-secret", AI_TIMEOUT_MS: "5000" });
  const result = await callAi(payload, config, fakeFetch);

  assert.equal(captured.url, "https://example.invalid/chat/completions");
  assert.equal(captured.options.headers.Authorization, "Bearer server-secret");
  const requestBody = JSON.parse(captured.options.body);
  assert.equal(requestBody.model, "glm-test");
  assert.equal("thinking" in requestBody, false);
  assert.equal(result.candidates.length, 1);
});

test("serves public nested assets with Windows path separators", () => {
  assert.equal(isPublicStaticPath("css\\styles.css"), true);
  assert.equal(isPublicStaticPath("js\\app.js"), true);
  assert.equal(isPublicStaticPath("tests\\server.test.mjs"), false);
});
