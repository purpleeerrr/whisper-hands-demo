import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../js/ai-adapter.js", import.meta.url), "utf8");

test("formal onboarding calls the narrow Identity Extraction endpoint", async () => {
  let captured;
  const context = vm.createContext({
    AbortController,
    JSON,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        json: async () => ({ status: "ok", extraction: { schemaVersion: "identity-extraction.v0.1", explicitFactCandidates: [], threadCandidates: [] }, usage: { totalTokens: 100 } }),
      };
    },
  });
  vm.runInContext(source, context);
  const result = await context.WhisperAI.extractIdentity({
    caseId: "formal-detail",
    userInput: "我进入空间时会先注意光落在哪里。",
    existingKernel: [{ id: "kernel-1", statement: "我常注意光。", scope: "recurring" }],
  });

  assert.equal(captured.url, "/api/identity/extract");
  const body = JSON.parse(captured.options.body);
  assert.equal(body.planet, "一个总会注意的细节");
  assert.equal(body.userInput, "我进入空间时会先注意光落在哪里。");
  assert.equal(body.existingKernel.length, 1);
  assert.equal(result.usage.totalTokens, 100);
});

test("work analysis sends one compressed image request", async () => {
  let captured;
  const context = vm.createContext({
    AbortController, JSON, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ status: "ok", analysis: { visionAvailable: true, visualObservations: ["可见两个形体。"], polishedIntroduction: "作品介绍。" } }) };
    },
  });
  vm.runInContext(source, context);
  await context.WhisperAI.analyzeWork({ title: "between", imageDataUrl: "data:image/jpeg;base64,dGVzdA==", creatorKernel: [] });
  assert.equal(captured.url, "/api/work/analyze");
  const body = JSON.parse(captured.options.body);
  assert.match(body.imageDataUrl, /^data:image\/jpeg;base64,/u);
});
