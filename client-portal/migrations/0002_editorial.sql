-- Editorial calendar, private assets, tenant preferences and weekly research.
ALTER TABLE clients ADD COLUMN brand TEXT NOT NULL DEFAULT 'prunus';
ALTER TABLE clients ADD COLUMN industry TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN service_area TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN voice_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN requires_blog_approval INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN allow_client_ideas INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clients ADD COLUMN allow_client_uploads INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clients ADD COLUMN search_console_url TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS editorial_posts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  topic_key TEXT NOT NULL,
  title TEXT NOT NULL,
  suggested_by TEXT NOT NULL,
  audience_question TEXT NOT NULL DEFAULT '',
  target_query TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL DEFAULT '',
  draft TEXT NOT NULL DEFAULT '',
  sources_json TEXT NOT NULL DEFAULT '[]',
  evidence_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'idea' CHECK(status IN ('idea','research','draft','internal-review','client-review','approved','scheduled','published','rejected')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at TEXT,
  scheduled_at TEXT,
  published_url TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(client_id,topic_key)
);
CREATE INDEX IF NOT EXISTS idx_editorial_client_status ON editorial_posts(client_id,status,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_editorial_schedule ON editorial_posts(status,scheduled_at);

CREATE TABLE IF NOT EXISTS client_uploads (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL,
  file_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uploads_client_date ON client_uploads(client_id,created_at DESC);

CREATE TABLE IF NOT EXISTS research_jobs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','working','complete','failed')),
  research_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(client_id,week_start)
);
CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_jobs(status,week_start);
