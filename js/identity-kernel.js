(function attachWhisperIdentityStores(root) {
  "use strict";

  function createIdentityStore(STORAGE_KEY) {
  const SCHEMA_VERSION = "identity-store.v0.1";
  const PATCH_VERSION = "identity-patch.v0.1";
  const SCOPES = new Set(["moment", "project", "recurring", "long_term"]);
  const now = () => new Date().toISOString();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clean = (value, max = 1000) => String(value ?? "").replaceAll("\u0000", "").trim().slice(0, max);
  const makeId = (prefix) => `${prefix}-${root.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const unique = (values) => Array.from(new Set((Array.isArray(values) ? values : []).map((value) => clean(value, 180)).filter(Boolean)));

  function emptyState() {
    const timestamp = now();
    return { schemaVersion: SCHEMA_VERSION, revision: 0, createdAt: timestamp, updatedAt: timestamp, facts: [], threads: [], rejectedCandidates: [], patches: [], kernel: [] };
  }

  function normalizeState(value) {
    if (!value || value.schemaVersion !== SCHEMA_VERSION) return emptyState();
    const empty = emptyState();
    return {
      ...empty,
      ...value,
      revision: Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
      facts: Array.isArray(value.facts) ? value.facts : [],
      threads: Array.isArray(value.threads) ? value.threads : [],
      rejectedCandidates: Array.isArray(value.rejectedCandidates) ? value.rejectedCandidates : [],
      patches: Array.isArray(value.patches) ? value.patches.slice(-50) : [],
      kernel: Array.isArray(value.kernel) ? value.kernel : [],
    };
  }

  function readState() {
    try {
      const raw = root.localStorage?.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  let state = readState();

  function persist() {
    state.updatedAt = now();
    try { root.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Lab remains usable without persistence. */ }
    return getState();
  }

  function getState() { return clone(state); }
  function getKernel() { return clone({ schemaVersion: "creator-identity-kernel.v0.1", revision: state.revision, generatedAt: now(), items: state.kernel }); }

  function reset() {
    state = emptyState();
    return persist();
  }

  function normalizeDecision(decision) {
    const candidateType = ["fact", "thread"].includes(decision?.candidateType) ? decision.candidateType : "";
    const action = ["confirm", "reject"].includes(decision?.action) ? decision.action : "";
    const statement = clean(decision?.statement, 1000);
    if (!candidateType || !action || (action === "confirm" && !statement)) return null;
    return {
      candidateType,
      candidateIndex: Math.max(0, Number(decision?.candidateIndex) || 0),
      action,
      statement: action === "confirm" ? statement : "",
      originalStatement: clean(decision?.originalStatement, 1000),
      scope: SCOPES.has(decision?.scope) ? decision.scope : "moment",
      certainty: clean(decision?.certainty, 80),
      threadKey: clean(decision?.threadKey, 120),
      confidence: clean(decision?.confidence, 80) || "tentative",
    };
  }

  function createPatch({ caseId, planet, evidenceId, decisions, sourceType = "prompt_lab" }) {
    const safeDecisions = (Array.isArray(decisions) ? decisions : []).map(normalizeDecision).filter(Boolean);
    if (!safeDecisions.length) throw new Error("PATCH_DECISION_REQUIRED");
    const safeEvidenceId = clean(evidenceId, 180) || makeId("evidence");
    const safeSourceType = ["prompt_lab", "onboarding"].includes(sourceType) ? sourceType : "prompt_lab";
    const operations = safeDecisions.map((decision) => {
      if (decision.action === "reject") return { op: "reject_candidate", candidateType: decision.candidateType, candidateIndex: decision.candidateIndex, evidenceRefs: [safeEvidenceId] };
      return {
        op: decision.candidateType === "fact" ? "confirm_fact" : "confirm_thread",
        candidateIndex: decision.candidateIndex,
        statement: decision.statement,
        originalStatement: decision.originalStatement,
        userEdited: Boolean(decision.originalStatement && decision.statement !== decision.originalStatement),
        scope: decision.scope,
        certainty: decision.certainty,
        threadKey: decision.threadKey,
        confidence: decision.confidence,
        evidenceRefs: [safeEvidenceId],
      };
    });
    return {
      schemaVersion: PATCH_VERSION,
      id: makeId("identity-patch"),
      baseRevision: state.revision,
      source: { type: safeSourceType, caseId: clean(caseId, 80), planet: clean(planet, 120), evidenceId: safeEvidenceId, rawInputIncluded: false },
      operations,
      createdAt: now(),
    };
  }

  function compileKernel() {
    const factItems = state.facts
      .filter((fact) => fact.status === "confirmed" && ["recurring", "long_term"].includes(fact.scope))
      .map((fact) => ({ id: `kernel-${fact.id}`, type: "explicit_fact", statement: fact.statement, scope: fact.scope, confidence: "user_confirmed", evidenceRefs: clone(fact.evidenceRefs), confirmedByUser: true, updatedAt: fact.updatedAt }));
    const threadItems = state.threads
      .filter((thread) => thread.status === "confirmed" && thread.supportCount >= 2 && ["recurring", "long_term"].includes(thread.scope))
      .map((thread) => ({ id: `kernel-${thread.id}`, type: "identity_thread", statement: thread.statement, scope: thread.scope, confidence: thread.supportCount >= 3 ? "well_supported" : "developing", evidenceRefs: clone(thread.evidenceRefs), confirmedByUser: true, updatedAt: thread.updatedAt }));
    state.kernel = [...factItems, ...threadItems].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 12);
  }

  function applyPatch(patch) {
    if (!patch || patch.schemaVersion !== PATCH_VERSION) throw new Error("PATCH_VERSION_INVALID");
    if (state.patches.some((item) => item.id === patch.id)) return getState();
    if (patch.baseRevision !== state.revision) throw new Error("PATCH_REVISION_CONFLICT");
    const timestamp = now();
    patch.operations.forEach((operation) => {
      if (operation.op === "reject_candidate") {
        state.rejectedCandidates.push({ id: makeId("rejected"), candidateType: operation.candidateType, evidenceRefs: unique(operation.evidenceRefs), rejectedAt: timestamp });
        return;
      }
      if (operation.op === "confirm_fact") {
        const existing = state.facts.find((fact) => fact.statement === operation.statement && fact.scope === operation.scope);
        if (existing) {
          existing.evidenceRefs = unique([...existing.evidenceRefs, ...operation.evidenceRefs]);
          existing.updatedAt = timestamp;
        } else {
          state.facts.push({ id: makeId("fact"), statement: clean(operation.statement), scope: SCOPES.has(operation.scope) ? operation.scope : "moment", certainty: clean(operation.certainty, 80), status: "confirmed", userEdited: Boolean(operation.userEdited), evidenceRefs: unique(operation.evidenceRefs), confirmedAt: timestamp, updatedAt: timestamp });
        }
        return;
      }
      if (operation.op === "confirm_thread") {
        const key = clean(operation.threadKey, 120) || clean(operation.statement, 160);
        const existing = state.threads.find((thread) => thread.threadKey === key);
        if (existing) {
          existing.statement = clean(operation.statement);
          existing.evidenceRefs = unique([...existing.evidenceRefs, ...operation.evidenceRefs]);
          existing.supportCount = existing.evidenceRefs.length;
          existing.updatedAt = timestamp;
        } else {
          const refs = unique(operation.evidenceRefs);
          state.threads.push({ id: makeId("thread"), threadKey: key, statement: clean(operation.statement), scope: SCOPES.has(operation.scope) ? operation.scope : "moment", confidence: clean(operation.confidence, 80) || "tentative", status: "confirmed", userEdited: Boolean(operation.userEdited), evidenceRefs: refs, supportCount: refs.length, kernelEligible: false, confirmedAt: timestamp, updatedAt: timestamp });
        }
      }
    });
    state.threads.forEach((thread) => { thread.kernelEligible = thread.status === "confirmed" && thread.supportCount >= 2; });
    state.revision += 1;
    state.patches.push({ ...clone(patch), appliedRevision: state.revision, appliedAt: timestamp });
    compileKernel();
    return persist();
  }

  return { STORAGE_KEY, SCHEMA_VERSION, PATCH_VERSION, getState, getKernel, reset, createPatch, applyPatch };
  }

  const labStore = createIdentityStore("whisper-hands:identity-lab:v0.1");
  const creatorStore = createIdentityStore("whisper-hands:creator-identity:v0.1");
  root.WhisperIdentityKernelCore = { createIdentityStore };
  root.WhisperIdentityKernelLab = labStore;
  root.WhisperCreatorIdentityStore = creatorStore;
  root.getWhisperHandsLabKernel = labStore.getKernel;
  root.getWhisperHandsCreatorKernel = creatorStore.getKernel;
})(typeof window !== "undefined" ? window : globalThis);
