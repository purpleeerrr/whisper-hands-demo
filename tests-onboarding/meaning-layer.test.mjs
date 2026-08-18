import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../js/meaning-layer.js", import.meta.url), "utf8");

function createContext(sharedStorage = new Map()) {
  const localStorage = {
    getItem(key) { return sharedStorage.has(key) ? sharedStorage.get(key) : null; },
    setItem(key, value) { sharedStorage.set(key, String(value)); },
    removeItem(key) { sharedStorage.delete(key); },
  };
  const context = vm.createContext({
    console,
    crypto: { randomUUID },
    Date,
    JSON,
    Math,
    Set,
    localStorage,
  });
  vm.runInContext(source, context);
  return { context, sharedStorage };
}

test("stores raw sources but exports confirmed meaning only", () => {
  const { context } = createContext();
  const store = context.WhisperMeaningStore;
  const clue = store.saveClue({
    title: "一句现在想说的话",
    text: "this is a private raw fragment",
    imageMetadata: { fileName: "private.png", contentType: "image/png", byteSize: 42 },
  });
  const followUp = store.saveFollowUp({
    clueSourceId: clue.id,
    question: "这句话更像愿望还是问题？",
    answer: "a private follow-up answer",
  });
  const [keep, reject] = store.addCandidates([
    {
      dimension: "language_voice",
      statement: "你暂时更愿意用具体画面表达尚未确定的感受。",
      evidenceRefs: [clue.id, followUp.id],
      confidence: "tentative",
      permittedUses: ["creative_reflection"],
    },
    {
      dimension: "values",
      statement: "你永远拒绝秩序。",
      evidenceRefs: [clue.id],
    },
  ]);

  store.respondToCandidate(keep.id, "edit", "我现在更愿意用具体画面表达还没有答案的感受。");
  store.respondToCandidate(reject.id, "reject");

  const internal = store.getState();
  const exported = store.getConfirmedMeaningLayer();
  const serialized = JSON.stringify(exported);

  assert.equal(internal.sources.length, 2);
  assert.equal(internal.sources[0].rawText, "this is a private raw fragment");
  assert.equal(exported.rawMaterialIncluded, false);
  assert.equal(exported.confirmedSlices.length, 1);
  assert.equal(exported.confirmedSlices[0].statement, "我现在更愿意用具体画面表达还没有答案的感受。");
  assert.doesNotMatch(serialized, /private raw fragment|private follow-up answer|private\.png|永远拒绝秩序/);
});

test("does not duplicate a deterministic candidate", () => {
  const { context } = createContext();
  const store = context.WhisperMeaningStore;
  const candidate = {
    id: "mock-source-attention",
    dimension: "attention",
    statement: "你目前先注意颜色。",
  };

  store.addCandidates([candidate]);
  store.addCandidates([candidate]);

  assert.equal(store.getState().meaningSlices.length, 1);
});

test("restores safe onboarding state after reload", () => {
  const sharedStorage = new Map();
  const first = createContext(sharedStorage).context.WhisperMeaningStore;
  first.saveSelections("attention", ["颜色或光线", "材料或触感"]);
  first.setProgress("stars");

  const second = createContext(sharedStorage).context.WhisperMeaningStore;
  const restored = second.getState();

  assert.deepEqual(Array.from(restored.ui.attention), ["颜色或光线", "材料或触感"]);
  assert.equal(restored.progress.currentScene, "stars");
  assert.equal(restored.profileId, first.getState().profileId);
});

test("exports only user-confirmed work interpretations", () => {
  const { context } = createContext();
  const store = context.WhisperMeaningStore;
  const analysis = {
    analysisBasis: "local_visual_signals",
    visualObservations: ["画面整体明度中等。"],
    formalLanguage: ["色彩关系形成克制的节奏。"],
    inspirationHypotheses: ["可能让人联想到靠近与分离。"],
    polishedIntroduction: "AI 的初稿。",
  };
  store.saveWorks([
    {
      id: "work-confirmed", title: "between", reason: "private original introduction", fileName: "private.png", analysis,
      analysisReview: { status: "confirmed", confirmedIntroduction: "这是我确认并改写后的作品介绍。", userEdited: true, confirmedFormalLanguage: analysis.formalLanguage, confirmedInspirationHypotheses: analysis.inspirationHypotheses, reviewedAt: "2026-08-15T00:00:00.000Z" },
    },
    {
      id: "work-rejected", title: "rejected", reason: "another private original", analysis,
      analysisReview: { status: "rejected", reviewedAt: "2026-08-15T00:00:00.000Z" },
    },
    { id: "work-pending", title: "pending", reason: "pending private original", analysis },
  ]);

  const exported = store.getConfirmedWorkInterpretations();
  const serialized = JSON.stringify(exported);
  assert.equal(exported.rawMaterialIncluded, false);
  assert.equal(exported.imageIncluded, false);
  assert.equal(exported.works.length, 1);
  assert.equal(exported.works[0].id, "work-confirmed");
  assert.equal(exported.works[0].confirmedIntroduction, "这是我确认并改写后的作品介绍。");
  assert.equal(exported.works[0].confirmedByUser, true);
  assert.doesNotMatch(serialized, /private original|private\.png|work-rejected|work-pending|AI 的初稿/u);
});
