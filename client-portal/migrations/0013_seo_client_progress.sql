-- Reviewed client-facing SEO work updates; no internal evidence or costs exposed.
CREATE TABLE IF NOT EXISTS seo_client_updates (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', completed_on TEXT NOT NULL,
 source_task_key TEXT, published_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(client_id,source_task_key)
);
CREATE INDEX IF NOT EXISTS seo_client_updates_month ON seo_client_updates(client_id,completed_on DESC);
