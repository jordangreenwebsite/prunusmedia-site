-- Add scheduling metadata without changing previous draft attempts.
ALTER TABLE marketing_draft_attempts ADD COLUMN provider_post_uuid TEXT;
CREATE UNIQUE INDEX marketing_drafts_uuid_unique ON marketing_draft_attempts(provider_post_uuid) WHERE provider_post_uuid IS NOT NULL;
CREATE TABLE marketing_schedule_attempts (
 provider_post_uuid TEXT PRIMARY KEY,
 actor_email TEXT NOT NULL,
 approved_snapshot TEXT NOT NULL,
 scheduled_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','uncertain','confirmed')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
