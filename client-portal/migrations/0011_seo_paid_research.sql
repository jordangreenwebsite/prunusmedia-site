-- Paid SEO is opt-in. Billing ledger deliberately survives client removal.
CREATE TABLE IF NOT EXISTS seo_provider_usage (
 id TEXT PRIMARY KEY, client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
 month TEXT NOT NULL, kind TEXT NOT NULL, request_key TEXT NOT NULL,
 reserved INTEGER NOT NULL, billed INTEGER, state TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS seo_provider_usage_month ON seo_provider_usage(month);
CREATE INDEX IF NOT EXISTS seo_provider_usage_recent ON seo_provider_usage(request_key,created_at);
CREATE TABLE IF NOT EXISTS seo_provider_cache (
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, request_key TEXT NOT NULL, payload TEXT NOT NULL,
 fetched_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(client_id,kind,request_key)
);
CREATE TABLE IF NOT EXISTS seo_rank_targets (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 keyword_id TEXT NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,
 location TEXT NOT NULL, device TEXT NOT NULL CHECK(device IN ('desktop','mobile')),
 enabled INTEGER NOT NULL DEFAULT 0, attempted_at TEXT, status TEXT NOT NULL DEFAULT 'pending',
 UNIQUE(client_id,keyword_id,location,device)
);
CREATE TABLE IF NOT EXISTS seo_rank_history (
 target_id TEXT NOT NULL REFERENCES seo_rank_targets(id) ON DELETE CASCADE,
 checked_at TEXT NOT NULL, keyword TEXT NOT NULL, domain TEXT NOT NULL,
 position INTEGER, url TEXT, result_count INTEGER NOT NULL, rivals TEXT NOT NULL,
 PRIMARY KEY(target_id,checked_at)
);
CREATE INDEX IF NOT EXISTS seo_rank_due ON seo_rank_targets(enabled,attempted_at);
CREATE TABLE IF NOT EXISTS seo_backlink_discovery (
 client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0, attempted_at TEXT, status TEXT NOT NULL DEFAULT 'pending'
);
