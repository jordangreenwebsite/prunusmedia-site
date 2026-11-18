CREATE TABLE IF NOT EXISTS seo_reporting_settings (
 client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
 domain TEXT NOT NULL,
 ga_property TEXT NOT NULL DEFAULT '',
 brand TEXT NOT NULL DEFAULT 'auto' CHECK(brand IN ('auto','prunus','uk-trades','dual'))
);
