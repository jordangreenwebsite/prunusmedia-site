-- Optional, isolated Prunus Portal automation integrations (no Certificates data).
-- Exact Search Console property is per customer; API credentials are environment secrets.
ALTER TABLE clients ADD COLUMN gsc_property TEXT NOT NULL DEFAULT '';

-- Brave-discovered URLs are candidates, NOT verified facts or human-checked citations.
ALTER TABLE research_jobs ADD COLUMN discovery_query TEXT NOT NULL DEFAULT '';
ALTER TABLE research_jobs ADD COLUMN candidate_sources_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE research_jobs ADD COLUMN discovered_at TEXT;

-- Draft GitHub PRs can only target the whitelisted live Prunus Media repository.
ALTER TABLE editorial_posts ADD COLUMN github_pr_url TEXT NOT NULL DEFAULT '';
ALTER TABLE editorial_posts ADD COLUMN github_pr_number INTEGER;
