PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Template Registry: official templates and user-owned editable copies.
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  parent_template_id TEXT REFERENCES templates(id),
  scope TEXT NOT NULL CHECK(scope IN ('official', 'user')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_events (
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

-- Private raw facts. These records are never used to drive recall.
CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE REFERENCES device_events(event_id),
  project_id TEXT REFERENCES projects(id),
  template_id TEXT NOT NULL REFERENCES templates(id),
  status TEXT NOT NULL CHECK(status IN ('captured', 'partial', 'ready_to_shape', 'candidate_ready', 'confirmed', 'discarded')),
  captured_at TEXT NOT NULL,
  transcript_raw TEXT,
  assets_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Candidate output remains editable and separate from confirmed personal knowledge.
CREATE TABLE IF NOT EXISTS candidate_records (
  id TEXT PRIMARY KEY,
  inbox_item_id TEXT NOT NULL UNIQUE REFERENCES inbox_items(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES templates(id),
  values_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('draft', 'needs_input', 'accepted', 'discarded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS confirmed_records (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES candidate_records(id),
  project_id TEXT REFERENCES projects(id),
  template_id TEXT NOT NULL REFERENCES templates(id),
  values_json TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Public reference material stays independently attributable and read-only in Demo.
CREATE TABLE IF NOT EXISTS reference_cards (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  applicability TEXT NOT NULL,
  warning TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recall_notifications (
  id TEXT PRIMARY KEY,
  confirmed_record_id TEXT NOT NULL REFERENCES confirmed_records(id),
  template_id TEXT NOT NULL REFERENCES templates(id),
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('field_change', 'project_open', 'scheduled_time')),
  trigger_key TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued', 'presented', 'opened', 'dismissed', 'snoozed', 'disabled')),
  queued_at TEXT NOT NULL,
  acted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_template ON projects(template_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_template ON inbox_items(template_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_template ON confirmed_records(template_id, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reference_template ON reference_cards(template_id);
CREATE INDEX IF NOT EXISTS idx_recall_status ON recall_notifications(status, queued_at);
