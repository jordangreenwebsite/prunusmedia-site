-- Aggregate-only activity data; no visitor names, emails, postcodes, or messages.
CREATE TABLE IF NOT EXISTS calculator_activity (
 site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 external_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('calculation','email_result_request','marketing_opt_in','cleaner_feedback')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(site_id,external_id,event_type)
);
CREATE INDEX IF NOT EXISTS idx_calculator_activity_client_date ON calculator_activity(client_id,created_at);
