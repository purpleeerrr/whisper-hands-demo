const STORAGE_KEY = 'whisper-hands-demo-v1';

export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      visualMatches: [],
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadState(storage, fallback) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.templates) || !parsed.project) return fallback;
    return {
      ...fallback,
      ...parsed,
      currentMedia: parsed.currentMedia || [],
      reminders: parsed.reminders || [],
      activeReminder: parsed.activeReminder || null,
      visualMatches: [],
      device: { ...fallback.device, ...(parsed.device || {}) },
      projectDrafts: {
        ...(fallback.projectDrafts || {}),
        ...(parsed.projectDrafts || {}),
        [parsed.project.templateId]: parsed.project,
      },
    };
  } catch {
    return fallback;
  }
}

export function exportRecords(state) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    project: state.project,
    records: state.confirmedRecords,
  }, null, 2);
}
