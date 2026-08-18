import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../js/identity-kernel.js", import.meta.url), "utf8");

function createStore(sharedStorage = new Map()) {
  const localStorage = { getItem: (key) => sharedStorage.get(key) || null, setItem: (key, value) => sharedStorage.set(key, String(value)), removeItem: (key) => sharedStorage.delete(key) };
  const context = vm.createContext({ console, crypto: { randomUUID }, Date, JSON, Math, Set, localStorage });
  vm.runInContext(source, context);
  return { store: context.WhisperIdentityKernelLab, creatorStore: context.WhisperCreatorIdentityStore, sharedStorage };
}

test("Lab and formal Creator Identity stores are isolated", () => {
  const { store, creatorStore } = createStore();
  assert.notEqual(store.STORAGE_KEY, creatorStore.STORAGE_KEY);
  const patch = store.createPatch({ caseId: "lab", planet: "细节", evidenceId: "lab-evidence", decisions: [decision("fact", "实验室事实。", { certainty: "explicit" })] });
  store.applyPatch(patch);
  assert.equal(store.getState().facts.length, 1);
  assert.equal(creatorStore.getState().facts.length, 0);

  const formalPatch = creatorStore.createPatch({ caseId: "formal", planet: "细节", evidenceId: "formal-evidence", sourceType: "onboarding", decisions: [decision("fact", "我通常会先注意光落在哪里。", { certainty: "explicit" })] });
  creatorStore.applyPatch(formalPatch);
  assert.equal(formalPatch.source.type, "onboarding");
  assert.equal(formalPatch.source.rawInputIncluded, false);
  assert.equal(creatorStore.getKernel().items.length, 1);
  assert.equal(store.getState().facts.length, 1);
});

function decision(candidateType, statement, extras = {}) {
  return { candidateType, candidateIndex: 0, action: "confirm", statement, originalStatement: statement, scope: "recurring", threadKey: "light-shapes-space", confidence: "tentative", ...extras };
}

test("a confirmed recurring fact enters the Lab Kernel", () => {
  const { store } = createStore();
  const patch = store.createPatch({ caseId: "clear", planet: "细节", evidenceId: "evidence-1", decisions: [decision("fact", "我通常会先注意光落在哪里。", { certainty: "explicit" })] });
  const state = store.applyPatch(patch);
  assert.equal(state.revision, 1);
  assert.equal(state.facts.length, 1);
  assert.equal(state.kernel.length, 1);
  assert.equal(state.kernel[0].type, "explicit_fact");
  assert.equal(patch.source.rawInputIncluded, false);
});

test("one confirmed thread stays outside Kernel until a second evidence source supports it", () => {
  const { store } = createStore();
  const first = store.createPatch({ caseId: "clear", planet: "细节", evidenceId: "evidence-1", decisions: [decision("thread", "我的注意力会停在光如何改变空间上。")] });
  store.applyPatch(first);
  assert.equal(store.getState().threads[0].supportCount, 1);
  assert.equal(store.getKernel().items.length, 0);

  const second = store.createPatch({ caseId: "another", planet: "细节", evidenceId: "evidence-2", decisions: [decision("thread", "我的注意力会停在光如何改变空间上。")] });
  store.applyPatch(second);
  assert.equal(store.getState().threads[0].supportCount, 2);
  assert.equal(store.getKernel().items[0].type, "identity_thread");
});

test("repeating the same evidence cannot promote a thread", () => {
  const { store } = createStore();
  const first = store.createPatch({ caseId: "same", planet: "细节", evidenceId: "same-evidence", decisions: [decision("thread", "我的注意力会停在光如何改变空间上。")] });
  store.applyPatch(first);
  const repeated = store.createPatch({ caseId: "same", planet: "细节", evidenceId: "same-evidence", decisions: [decision("thread", "我的注意力会停在光如何改变空间上。")] });
  store.applyPatch(repeated);
  assert.equal(store.getState().threads[0].supportCount, 1);
  assert.equal(store.getKernel().items.length, 0);
});

test("moment and project threads never enter the long-term Kernel", () => {
  for (const scope of ["moment", "project"]) {
    const { store } = createStore();
    store.applyPatch(store.createPatch({ caseId: `${scope}-1`, planet: "一句现在想说的话", evidenceId: `${scope}-evidence-1`, decisions: [decision("thread", "这只是阶段性的表达。", { scope, threadKey: `temporary-${scope}` })] }));
    store.applyPatch(store.createPatch({ caseId: `${scope}-2`, planet: "一句现在想说的话", evidenceId: `${scope}-evidence-2`, decisions: [decision("thread", "这只是阶段性的表达。", { scope, threadKey: `temporary-${scope}` })] }));
    assert.equal(store.getState().threads[0].supportCount, 2);
    assert.equal(store.getKernel().items.length, 0);
  }
});

test("rejections are auditable but never influence Kernel", () => {
  const { store } = createStore();
  const patch = store.createPatch({ caseId: "ambiguous", planet: "细节", evidenceId: "evidence-3", decisions: [{ candidateType: "fact", candidateIndex: 0, action: "reject", statement: "", originalStatement: "我喜欢裂纹。" }] });
  const state = store.applyPatch(patch);
  assert.equal(state.rejectedCandidates.length, 1);
  assert.equal(state.rejectedCandidates[0].statement, undefined);
  assert.equal(state.kernel.length, 0);
});

test("state persists and stale patches cannot overwrite a newer revision", () => {
  const first = createStore();
  const stale = first.store.createPatch({ caseId: "stale", planet: "细节", evidenceId: "evidence-stale", decisions: [decision("fact", "旧候选。", { scope: "moment" })] });
  const current = first.store.createPatch({ caseId: "current", planet: "细节", evidenceId: "evidence-current", decisions: [decision("fact", "我经常注意侧光。", { certainty: "explicit" })] });
  first.store.applyPatch(current);
  assert.throws(() => first.store.applyPatch(stale), /PATCH_REVISION_CONFLICT/u);
  const restored = createStore(first.sharedStorage).store.getState();
  assert.equal(restored.revision, 1);
  assert.equal(restored.facts.length, 1);
});
