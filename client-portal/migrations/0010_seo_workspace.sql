-- Agency-only SEO workspace, keyed to existing businesses.
CREATE TABLE IF NOT EXISTS seo_keywords (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 keyword TEXT NOT NULL, keyword_key TEXT NOT NULL, service TEXT NOT NULL DEFAULT '',
 location TEXT NOT NULL DEFAULT '', target_url TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(client_id,keyword_key)
);
CREATE INDEX IF NOT EXISTS seo_keywords_client ON seo_keywords(client_id,keyword_key);
CREATE TABLE IF NOT EXISTS seo_daily (
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 day TEXT NOT NULL, clicks INTEGER NOT NULL, impressions INTEGER NOT NULL,
 ctr REAL NOT NULL, position REAL NOT NULL, PRIMARY KEY(client_id,day)
);
CREATE TABLE IF NOT EXISTS seo_sync (
 client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
 property TEXT NOT NULL DEFAULT '', attempted_at TEXT, synced_at TEXT, status TEXT NOT NULL DEFAULT 'pending',
 snapshot TEXT
);
CREATE TABLE IF NOT EXISTS seo_backlinks (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 source_url TEXT NOT NULL, target_url TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '',
 outreach_status TEXT NOT NULL DEFAULT 'prospect' CHECK(outreach_status IN ('prospect','contacted','follow-up','secured','declined')),
 contacted_on TEXT NOT NULL DEFAULT '', follow_up_on TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 monitor INTEGER NOT NULL DEFAULT 0 CHECK(monitor IN (0,1)),
 check_status TEXT NOT NULL DEFAULT 'unchecked', checked_at TEXT, link_rel TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(client_id,source_url,target_url)
);
CREATE INDEX IF NOT EXISTS seo_backlinks_due ON seo_backlinks(monitor,checked_at);
