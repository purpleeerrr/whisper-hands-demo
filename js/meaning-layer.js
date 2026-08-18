(function attachWhisperMeaningStore(root) {
  "use strict";

  const STORAGE_KEY = "whisper-hands:onboarding:v0.1";
  const SCHEMA_VERSION = "0.1";
  const SLICE_STATUSES = new Set(["candidate", "confirmed", "rejected", "deferred"]);
  const WORK_REVIEW_STATUSES = new Set(["confirmed", "rejected"]);
  const SLICE_DIMENSIONS = new Set([
    "attention",
    "aesthetic",
    "making_process",
    "meaning_association",
    "values",
    "worldview_tension",
    "language_voice",
    "boundary",
  ]);

  const now = () => new Date().toISOString();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const cleanText = (value, max = 1200) => String(value ?? "").replaceAll("\u0000", "").trim().slice(0, max);
  const makeId = (prefix) => {
    const suffix = root.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${suffix}`;
  };

  function createEmptyState() {
    const timestamp = now();
    return {
      schemaVersion: SCHEMA_VERSION,
      profileId: makeId("profile"),
      createdAt: timestamp,
      updatedAt: timestamp,
      progress: { currentScene: "intro", completed: false },
      ui: {
        clue: "",
        clueText: "",
        clueEntries: {},
        attention: [],
        ways: [],
        followUpQuestion: "",
        followUpAnswer: "",
        followUpSourceId: "",
        candidateIds: [],
        mode: "",
        works: [],
      },
      sources: [],
      meaningSlices: [],
    };
  }

  function normalizeState(value) {
    if (!value || typeof value !== "object" || value.schemaVersion !== SCHEMA_VERSION) return createEmptyState();
    const empty = createEmptyState();
    return {
      ...empty,
      ...value,
      progress: { ...empty.progress, ...(value.progress || {}) },
      ui: { ...empty.ui, ...(value.ui || {}) },
      sources: Array.isArray(value.sources) ? value.sources : [],
      meaningSlices: Array.isArray(value.meaningSlices)
        ? value.meaningSlices.filter((slice) => slice && SLICE_STATUSES.has(slice.status))
        : [],
    };
  }

  function readStoredState() {
    try {
      const raw = root.localStorage?.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : createEmptyState();
    } catch {
      return createEmptyState();
    }
  }

  let state = readStoredState();

  function persist() {
    state.updatedAt = now();
    try {
      root.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The demo remains usable when storage is unavailable or full.
    }
    return clone(state);
  }

  function getState() {
    return clone(state);
  }

  function reset() {
    state = createEmptyState();
    return persist();
  }

  function setProgress(currentScene, completed = false) {
    state.progress = {
      currentScene: cleanText(currentScene, 40) || state.progress.currentScene,
      completed: Boolean(completed || state.progress.completed),
    };
    return persist();
  }

  function saveUiState(partial) {
    const allowed = ["clue", "clueText", "clueEntries", "attention", "ways", "followUpQuestion", "followUpAnswer", "followUpSourceId", "candidateIds", "mode", "works"];
    const next = { ...state.ui };
    allowed.forEach((key) => {
      if (Object.hasOwn(partial || {}, key)) next[key] = clone(partial[key]);
    });
    state.ui = next;
    return persist();
  }

  function safeMediaMetadata(media) {
    if (!media || typeof media !== "object") return null;
    return {
      fileName: cleanText(media.fileName, 180),
      contentType: cleanText(media.contentType, 100),
      byteSize: Number.isFinite(Number(media.byteSize)) ? Number(media.byteSize) : 0,
    };
  }

  function upsertSource(input) {
    const timestamp = now();
    const externalId = cleanText(input.externalId, 200);
    const existing = state.sources.find((source) => externalId && source.externalId === externalId);
    const media = (Array.isArray(input.media) ? input.media : [])
      .map(safeMediaMetadata)
      .filter(Boolean);
    const source = {
      id: existing?.id || makeId("source"),
      externalId: externalId || null,
      type: cleanText(input.type, 40) || "clue",
      title: cleanText(input.title, 180),
      rawText: cleanText(input.rawText, 2000),
      media,
      privacy: cleanText(input.privacy, 40) || "private",
      analysisPermission: cleanText(input.analysisPermission, 40) || "candidate_allowed",
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (existing) state.sources[state.sources.indexOf(existing)] = source;
    else state.sources.push(source);
    persist();
    return clone(source);
  }

  function saveClue({ title, text, imageMetadata }) {
    const cleanTitle = cleanText(title, 180);
    return upsertSource({
      externalId: `clue:${cleanTitle || "untitled"}`,
      type: "clue",
      title: cleanTitle,
      rawText: text,
      media: imageMetadata ? [imageMetadata] : [],
      privacy: "private",
      analysisPermission: "candidate_allowed",
    });
  }

  function saveFollowUp({ clueSourceId, question, answer }) {
    const sourceRef = cleanText(clueSourceId, 180);
    return upsertSource({
      externalId: `follow-up:${sourceRef || "unknown"}`,
      type: "follow_up",
      title: cleanText(question, 300),
      rawText: answer,
      media: [],
      privacy: "private",
      analysisPermission: "candidate_allowed",
    });
  }

  function saveSelections(key, values) {
    if (!new Set(["attention", "ways"]).has(key)) return getState();
    const cleaned = Array.from(new Set((Array.isArray(values) ? values : []).map((value) => cleanText(value, 180)).filter(Boolean)));
    saveUiState({ [key]: cleaned });
    if (cleaned.length) {
      upsertSource({
        externalId: `selection:${key}`,
        type: "structured_response",
        title: key === "attention" ? "最先注意到的部分" : "目前认同的创作方式",
        rawText: cleaned.join("；"),
        media: [],
        privacy: "private",
        analysisPermission: "candidate_allowed",
      });
    }
    return getState();
  }

  function saveWorks(works) {
    const cleanedWorks = (Array.isArray(works) ? works : []).slice(0, 20).map((work, index) => ({
      id: cleanText(work.id, 160) || `work-${index + 1}`,
      title: cleanText(work.title, 180) || `作品 ${index + 1}`,
      time: cleanText(work.time, 120),
      reason: cleanText(work.reason, 1200),
      fileName: cleanText(work.fileName, 180),
      contentType: cleanText(work.contentType, 100),
      byteSize: Number.isFinite(Number(work.byteSize)) ? Number(work.byteSize) : 0,
      analysis: work.analysis ? {
        schemaVersion: "work-analysis.v0.1",
        analysisBasis: cleanText(work.analysis.analysisBasis, 80),
        visionAvailable: work.analysis.visionAvailable === true,
        visualObservations: (Array.isArray(work.analysis.visualObservations) ? work.analysis.visualObservations : []).slice(0, 5).map((item) => cleanText(item, 300)).filter(Boolean),
        formalLanguage: (Array.isArray(work.analysis.formalLanguage) ? work.analysis.formalLanguage : []).slice(0, 4).map((item) => cleanText(item, 400)).filter(Boolean),
        inspirationHypotheses: (Array.isArray(work.analysis.inspirationHypotheses) ? work.analysis.inspirationHypotheses : []).slice(0, 3).map((item) => cleanText(item, 400)).filter(Boolean),
        polishedIntroduction: cleanText(work.analysis.polishedIntroduction, 1200),
        followUpQuestion: cleanText(work.analysis.followUpQuestion, 400),
        identityUpdateAllowed: false,
      } : null,
      analysisReview: work.analysisReview && WORK_REVIEW_STATUSES.has(work.analysisReview.status) ? {
        status: work.analysisReview.status,
        confirmedIntroduction: work.analysisReview.status === "confirmed" ? cleanText(work.analysisReview.confirmedIntroduction, 1200) : "",
        userEdited: work.analysisReview.status === "confirmed" && work.analysisReview.userEdited === true,
        confirmedFormalLanguage: work.analysisReview.status === "confirmed" ? (Array.isArray(work.analysisReview.confirmedFormalLanguage) ? work.analysisReview.confirmedFormalLanguage : []).slice(0, 4).map((item) => cleanText(item, 400)).filter(Boolean) : [],
        confirmedInspirationHypotheses: work.analysisReview.status === "confirmed" ? (Array.isArray(work.analysisReview.confirmedInspirationHypotheses) ? work.analysisReview.confirmedInspirationHypotheses : []).slice(0, 3).map((item) => cleanText(item, 400)).filter(Boolean) : [],
        reviewedAt: cleanText(work.analysisReview.reviewedAt, 80) || now(),
      } : null,
    }));
    saveUiState({ works: cleanedWorks });
    cleanedWorks.forEach((work) => {
      upsertSource({
        externalId: `work:${work.id}`,
        type: "past_work",
        title: work.title,
        rawText: work.reason,
        media: work.fileName ? [{ fileName: work.fileName, contentType: work.contentType, byteSize: work.byteSize }] : [],
        privacy: "private",
        analysisPermission: "candidate_allowed",
      });
    });
    return getState();
  }

  function addCandidates(candidates) {
    const added = [];
    (Array.isArray(candidates) ? candidates : []).slice(0, 8).forEach((input) => {
      const statement = cleanText(input.statement, 1000);
      if (!statement) return;
      const dimension = SLICE_DIMENSIONS.has(input.dimension) ? input.dimension : "meaning_association";
      const suppliedId = cleanText(input.id, 160);
      const existing = suppliedId ? state.meaningSlices.find((slice) => slice.id === suppliedId) : null;
      if (existing) {
        added.push(existing);
        return;
      }
      const timestamp = now();
      const candidate = {
        id: suppliedId || makeId("slice"),
        dimension,
        statement,
        status: "candidate",
        evidenceRefs: Array.from(new Set((Array.isArray(input.evidenceRefs) ? input.evidenceRefs : []).map((ref) => cleanText(ref, 180)).filter(Boolean))),
        confidence: ["tentative", "developing", "well_supported"].includes(input.confidence) ? input.confidence : "tentative",
        permittedUses: Array.from(new Set((Array.isArray(input.permittedUses) ? input.permittedUses : []).map((use) => cleanText(use, 80)).filter(Boolean))),
        createdAt: timestamp,
        updatedAt: timestamp,
        confirmedAt: null,
      };
      state.meaningSlices.push(candidate);
      added.push(candidate);
    });
    persist();
    return clone(added);
  }

  function respondToCandidate(candidateId, action, editedStatement = "") {
    const candidate = state.meaningSlices.find((slice) => slice.id === candidateId);
    if (!candidate || candidate.status !== "candidate") return null;
    const actions = { confirm: "confirmed", edit: "confirmed", reject: "rejected", defer: "deferred" };
    const nextStatus = actions[action];
    if (!nextStatus) return null;
    if (action === "edit") {
      const edited = cleanText(editedStatement, 1000);
      if (!edited) return null;
      candidate.statement = edited;
    }
    candidate.status = nextStatus;
    candidate.updatedAt = now();
    candidate.confirmedAt = nextStatus === "confirmed" ? candidate.updatedAt : null;
    persist();
    return clone(candidate);
  }

  function getConfirmedMeaningLayer() {
    return {
      schemaVersion: SCHEMA_VERSION,
      profileId: state.profileId,
      generatedAt: now(),
      rawMaterialIncluded: false,
      confirmedSlices: state.meaningSlices
        .filter((slice) => slice.status === "confirmed")
        .map((slice) => ({
          id: slice.id,
          dimension: slice.dimension,
          statement: slice.statement,
          evidenceRefs: clone(slice.evidenceRefs),
          confidence: slice.confidence,
          permittedUses: clone(slice.permittedUses),
          confirmedAt: slice.confirmedAt,
        })),
    };
  }

  function getConfirmedWorkInterpretations() {
    return {
      schemaVersion: "confirmed-work-interpretations.v0.1",
      profileId: state.profileId,
      generatedAt: now(),
      rawMaterialIncluded: false,
      imageIncluded: false,
      works: (Array.isArray(state.ui.works) ? state.ui.works : [])
        .filter((work) => work?.analysis && work?.analysisReview?.status === "confirmed" && work.analysisReview.confirmedIntroduction)
        .map((work) => ({
          id: work.id,
          title: work.title,
          time: work.time,
          confirmedIntroduction: work.analysisReview.confirmedIntroduction,
          visualObservations: clone(work.analysis.visualObservations || []),
          formalLanguage: clone(work.analysisReview.confirmedFormalLanguage || []),
          inspirationHypotheses: clone(work.analysisReview.confirmedInspirationHypotheses || []),
          analysisBasis: work.analysis.analysisBasis,
          userEdited: Boolean(work.analysisReview.userEdited),
          confirmedByUser: true,
          confirmedAt: work.analysisReview.reviewedAt,
          evidenceRef: `work:${work.id}`,
        })),
    };
  }

  const api = {
    STORAGE_KEY,
    SCHEMA_VERSION,
    getState,
    reset,
    setProgress,
    saveUiState,
    saveClue,
    saveFollowUp,
    saveSelections,
    saveWorks,
    addCandidates,
    respondToCandidate,
    getConfirmedMeaningLayer,
    getConfirmedWorkInterpretations,
  };

  root.WhisperMeaningStore = api;
  root.getWhisperHandsMeaningLayer = getConfirmedMeaningLayer;
  root.getWhisperHandsConfirmedWorks = getConfirmedWorkInterpretations;
})(typeof window !== "undefined" ? window : globalThis);
