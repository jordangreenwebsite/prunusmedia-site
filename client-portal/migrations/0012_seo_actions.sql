-- Private agency action plan, bounded crawl results and reviewed report snapshots.
CREATE TABLE IF NOT EXISTS seo_action_settings (
 client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
 audit_enabled INTEGER NOT NULL DEFAULT 0 CHECK(audit_enabled IN (0,1)),
 reports_enabled INTEGER NOT NULL DEFAULT 0 CHECK(reports_enabled IN (0,1)),
 audit_attempted_at TEXT, report_attempted_at TEXT, report_attempted_month TEXT,
 audit_status TEXT NOT NULL DEFAULT 'pending', report_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS seo_audits (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 domain TEXT NOT NULL, checked_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seo_audits_client ON seo_audits(client_id,checked_at DESC);
CREATE TABLE IF NOT EXISTS seo_action_tasks (
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 task_key TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','done','dismissed')),
 title TEXT NOT NULL, evidence TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(client_id,task_key)
);
CREATE TABLE IF NOT EXISTS seo_monthly_reports (
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 month TEXT NOT NULL, domain TEXT NOT NULL, property TEXT NOT NULL,
 generated_at TEXT NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(client_id,month)
);
