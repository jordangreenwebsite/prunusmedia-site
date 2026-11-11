-- Client portal workspace reorganisation. All tables belong to its isolated D1.
ALTER TABLE clients ADD COLUMN publishing_repo TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN publishing_path TEXT NOT NULL DEFAULT 'src/content/blog/';
ALTER TABLE clients ADD COLUMN publishing_branch TEXT NOT NULL DEFAULT 'main';
ALTER TABLE clients ADD COLUMN google_business_profile_url TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS request_attachments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_request_attachments_request ON request_attachments(request_id,client_id);

CREATE TABLE IF NOT EXISTS portal_ai_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  mcp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(mcp_enabled IN (0,1)),
  expose_search INTEGER NOT NULL DEFAULT 1 CHECK(expose_search IN (0,1)),
  expose_editorial INTEGER NOT NULL DEFAULT 1 CHECK(expose_editorial IN (0,1)),
  expose_research INTEGER NOT NULL DEFAULT 1 CHECK(expose_research IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO portal_ai_settings(id,mcp_enabled) VALUES (1,0);


-- OAuth consent state (short-lived, one-time) and encrypted refresh tokens,
-- stored in this portal's D1 only. Do not put OAuth credentials in a client row.
CREATE TABLE IF NOT EXISTS gbp_oauth_pending (
  state_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL,
  pkce_verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gbp_connections (
  client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  location_name TEXT NOT NULL DEFAULT '',
  location_title TEXT NOT NULL DEFAULT '',
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
