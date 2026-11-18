CREATE TABLE IF NOT EXISTS seo_maps_targets (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 keyword_id TEXT NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,
 place_identity TEXT NOT NULL, location TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 attempted_at TEXT, status TEXT NOT NULL DEFAULT 'pending',
 UNIQUE(client_id,keyword_id,place_identity,location)
);
CREATE TABLE IF NOT EXISTS seo_maps_checks (
 target_id TEXT NOT NULL REFERENCES seo_maps_targets(id) ON DELETE CASCADE,
 checked_at TEXT NOT NULL, keyword TEXT NOT NULL, domain TEXT NOT NULL, position INTEGER, result_count INTEGER NOT NULL,
 PRIMARY KEY(target_id,checked_at)
);
CREATE INDEX IF NOT EXISTS seo_maps_due ON seo_maps_targets(enabled,attempted_at);
CREATE TABLE IF NOT EXISTS seo_website_changes (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 title TEXT NOT NULL, changed_on TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', reference TEXT NOT NULL DEFAULT '',
 shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN(0,1)), created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX IF NOT EXISTS seo_changes_date ON seo_website_changes(client_id,changed_on DESC);
