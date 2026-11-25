-- One durable attempt per exact workspace/account/content combination.
-- Ambiguous remote outcomes stay blocked until a separately reviewed reconciliation.
CREATE TABLE IF NOT EXISTS marketing_draft_attempts (
  digest TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','confirmed','uncertain')),
  provider_post_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);