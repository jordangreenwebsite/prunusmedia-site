# Phase 2 — optional DataForSEO
Deployment extends the Phase 1 portal. No paid request occurs without all three secrets and a positive budget. No secret goes into GitHub or the browser. Cloudflare Worker prunus-website-clients > Settings > Variables and Secrets, add these as Secret:
- DATAFORSEO_LOGIN: API access login
- DATAFORSEO_PASSWORD: API access password
- DATAFORSEO_ENABLED: true (leave unset until ready to spend)
- DATAFORSEO_MONTHLY_BUDGET_USD: 10 (optional; default $10, maximum $100, USD calendar month UTC)

Cloudflare documents that secrets omitted from --secrets-file are preserved. The existing CI secret file need not contain these. Check deployed bindings after each deployment. Also set a provider-side spend limit because local budget reservations are estimates, not a guarantee against external usage or changed provider tariffs. Disable via removing DATAFORSEO_ENABLED or setting false.

The agency-only UI supports keyword ideas, exact keyword metrics, competitor organic keyword samples, saved keyword rank targets, independent live organic rank snapshots to depth 30, dated rankings/history/top competitor results, and sampled backlink discovery (100 items, provider-reported new/lost). Rank checks and backlinks are separately opt-in per target/client. Research caches are reused for 30 days, backlink discovery 7 days. No Maps rank, exact search volumes, full backlink index, or guaranteed weekly coverage. A dedicated six-hour paid SEO cron, separate from the free SEO, editorial and billing jobs, checks up to eight due rank targets and one discovery site; maximum 224 rank attempts/week under ideal capacity and budget; actual lower if errors or limits. No scheduled paid research beyond explicit opt-in. Unknown costs stay reserved. Cost measured in millionths of USD; shared atomic reservations and billing overage stop. Local ledger includes only calls from this Worker, and is not a provider invoice.

Provider endpoint docs:
https://docs.dataforseo.com/v3/dataforseo_labs-google-keyword_ideas-live/
https://docs.dataforseo.com/v3/dataforseo_labs-google-keyword_overview-live/
https://docs.dataforseo.com/v3/dataforseo_labs-google-ranked_keywords-live/
https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/
https://docs.dataforseo.com/v3/backlinks-backlinks-live/
https://dataforseo.com/pricing
https://developers.cloudflare.com/workers/configuration/secrets/

Review migration and CI, deploy with integration disabled, check sign-in and tenant scope, configure secrets, verify trial requests with provider dashboard, match actual cost and result shape, then opt in to weekly jobs. Paid requests are never made by the test suite.