# Prunus Client Portal — Search Console, research, MCP & GitHub integration

These optional integrations belong **only** to the Prunus Media website client portal Worker in this repository. They do not read or write Prunus Certificates, UK Trade Websites site code or customer website repositories. Existing D1/R2 bindings, Resend code login, client records and client-access permissions remain separate.

## Status and security promises

- Base portal continues without any of the following credentials.
- The SEO panel only displays real measured Search Console API data. It does not simulate clicks, rankings or keyword traffic.
- Weekly research automatically finds **source candidates** only after you connect Brave Search and set each client's true industry. Discovery is not fact verification, AI drafting or publishing.
- Read-only MCP endpoint is **disabled** without a dedicated, independently generated token.
- GitHub PR generation is **disabled** without a separately scoped token. It ONLY creates a draft PR in jordangreenwebsite/prunusmedia-site for an article belonging to the Prunus Media website itself. It cannot write to other client repositories or Certificates.
- No integration has been connected to an external ChatGPT MCP connector using OAuth. The endpoint is available for trusted bearer-token MCP clients, not a claim of installed or authorised ChatGPT connector access.

## 1. Google Search Console (measured evidence)

Google API:
https://developers.google.com/webmaster-tools/v1/searchanalytics/query
Service account auth:
https://developers.google.com/identity/protocols/oauth2/service-account

1. In Google Cloud Console, use a dedicated project for the Prunus client portal (not Certificates); enable **Google Search Console API**.
2. Create a dedicated service account with the minimum permissions to call the API. You do **not** need to grant it broad Google Cloud IAM roles for Search Console itself.
3. Under that service account, create a **new JSON key**; treat it like a password. Do not paste it in chat or commit it to GitHub.
4. Open GitHub > jordangreenwebsite/prunusmedia-site > Settings > Environments > portal-production > Environment secrets and add:
   - PRUNUS_GSC_SERVICE_ACCOUNT_JSON = the **entire JSON contents**, including the private key.
5. In **each client's actual Search Console property** > Settings > Users and permissions, add the service account's email with restricted/read-only permission. If you do not have the property's permission to add users, ask the actual property owner to add the service account.
6. In the portal, choose that client > Administration > Selected client's content settings:
   - **Exact Search Console property (API)** = the actual property identifier, e.g. sc-domain:example.co.uk or https://www.example.co.uk/
   - The existing Search Console link remains an optional shortcut, not the property identifier.
   - Save and visit **Search Insights** or select Refresh insights.
7. Re-run the GitHub portal deployment workflow after adding the new secret, so the Worker receives it. The deployment workflow does not print credential contents.

Returns finalised Google Search Console clicks, impressions, CTR, average position and top queries for the most recent completed 28-day range, compared with the previous 28 days. Current search data may lag a few days. Clients can see **only their own** configured property's metrics.

## 2. Source discovery with Brave Search

Documentation:
https://api-dashboard.search.brave.com/api-reference/web/search/get

1. Create a separate Brave Search API subscription/key for the client portal. There may be API charges based on usage.
2. Add GitHub environment secret **PRUNUS_BRAVE_SEARCH_API_KEY**.
3. For each customer, enter accurate niche and real service area under **Selected client's content settings**; don't invent locations or mix a customer's search terms with another.
4. Re-run the portal deployment after saving the key.
5. The existing daily Worker cron queues one weekly task per active customer and attempts up to **two** queued source-discovery jobs per day when the Brave key exists. The admin can also click **Find source candidates** on an individual job.
6. Open the returned original pages and check every factual claim, dates, relevance, licence and primary authority. Candidates are explicitly labelled **candidate-not-verified**, with no fabricated checked date.
7. Save detailed notes with real HTTPS URLs or documented first-party evidence before setting a research job to complete. Use the existing editorial calendar to create an actual article plan.

The system does not automatically invent blog articles or publish; it collects real research inputs for editorial review. Brave is an external third party: do not send confidential client enquiry text or personal information in search terms.

## 3. Read-only MCP tool endpoint

Protocol reference:
https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx

1. Generate a **new random** secret (48+ characters) separate from the authentication pepper and Certificates.
2. Add GitHub environment secret **PRUNUS_PORTAL_MCP_ADMIN_TOKEN**. Redeploy the portal Worker.
3. Endpoint: https://portal.prunusmedia.com/mcp (POST only), bearer authentication.
4. Supports stateless MCP initialize, tools/list, tools/call and ping via JSON-RPC / Streamable HTTP. For version 2026-07-28 include the required MCP method/name headers.
5. Read-only tools:
   - list_clients — business names/industries/domains only
   - get_search_performance — measured, tenant-specific GSC stats if configured
   - get_editorial_plan — titles, stages and scheduled dates, not confidential drafts
   - get_research_queue — job status and explicitly unverified source candidates

No MCP tools change data, create clients, retrieve lead messages, download uploads, merge a PR or publish pages. This token is global-agency visibility: store it only in trusted server clients. An OAuth-based public ChatGPT MCP connector is **not configured**; bearer-only transport may require a future OAuth gateway for certain clients.

## 4. Draft GitHub PR for Prunus Media's own blog

1. Create a **fine-grained GitHub PAT** limited to **jordangreenwebsite/prunusmedia-site**. Grant Contents: Read/Write and Pull requests: Read/Write, with no access to any other repositories.
2. Save it in the protected GitHub environment as **PRUNUS_GITHUB_CONTENT_TOKEN**. Redeploy the portal Worker.
3. In the portal, ensure Prunus Media is itself a connected client with domain prunusmedia.com and brand prunus. An unrelated customer or UK Trade Websites cannot use this writer.
4. Create a researched, complete article. Mark it Approved or Scheduled only after any required client approval and real source review.
5. Click **Prepare GitHub draft PR**. The Worker creates a branch and a markdown blog entry with **draft: true** and a draft pull request in the exact approved repo.
6. A reviewer must inspect every statement and source, check the Astro build, deliberately change draft to false, approve/merge, verify the actual live URL, then record Published in the portal.

This is not a cross-client publishing engine. **No integrations for Roofing or PP Power Detailing repos are authorised here.** Those need separate explicit scope, client approval and a tenant-to-repository permission mapping.

## Deployment and verification

Production workflow: .github/workflows/prunus-portal-deploy.yml
New D1 migration: client-portal/migrations/0003_integrations.sql

All four new secrets are optional. The deployment script checks structure without logging values. Use the Actions manual dispatch on main after changing environment secrets. Run tests first; migration applies to the **existing portal D1 only**. Existing Certificates storage remains separate.

Check with two separate test client accounts that:
- The client GSC API cannot access another client's site data.
- The agency admin can view permitted cross-client summaries without individual lead contact details.
- Missing secrets show clear configuration messages, never simulated metrics or fabricated source research.
- MCP returns 503 when unconfigured and 401 for unauthorised requests.
- GitHub action never writes to a client repo, never touches Certificates and always creates a draft PR, never publishes.
