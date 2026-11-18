-- Exactly five available client-facing reporting slots per business.
-- Agency tracking is independent and remains unrestricted by this table.
CREATE UNIQUE INDEX IF NOT EXISTS seo_keywords_client_id_id ON seo_keywords(client_id,id);
CREATE TABLE IF NOT EXISTS seo_client_keyword_slots (
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
 slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 5 AND typeof(slot)='integer'),
 keyword_id TEXT NOT NULL,
 PRIMARY KEY(client_id,slot),
 UNIQUE(client_id,keyword_id),
 FOREIGN KEY(client_id,keyword_id) REFERENCES seo_keywords(client_id,id) ON DELETE CASCADE
);
