# Prunus Client Portal, first production deployment

This is a manual, gated deployment. The marketing website remains separate. Cloudflare Pages must build Astro from repository root using npm run build with output directory dist, never repository root. Otherwise server-side code could be served as public static files.

## Prepare in Cloudflare once

1. Ensure the prunusmedia.com zone is in the same Cloudflare account that will host the Worker.
2. In Workers & Pages / D1, create a database named prunus-website-clients. Copy its UUID. Do not send credentials or API tokens in a chat.
3. In R2 object storage, create a bucket named prunus-website-client-files. Keep all public domain access OFF.
4. In Resend, verify a Prunus sender domain. Decide on the real sender email, such as portal@prunusmedia.com, if verified. It must match the approved sender domain in src/index.js. If only a different domain is verified, change sender validation deliberately and retest before proceeding.
5. In Cloudflare, create a scoped account API token with permissions to deploy Workers and update D1. Restrict it to your Prunus account and zone. Do not grant unnecessary global access. Find the account ID in Cloudflare. Confirm there is no conflicting DNS record for portal.prunusmedia.com; Wrangler is configured to attach it as a custom Worker domain.

## Set up protected deployment in GitHub

In the repository jordangreenwebsite/prunusmedia-site open Settings > Environments and create an environment named portal-production. For extra safety, require approval before deployment.

Add one environment variable:
- PRUNUS_PORTAL_D1_DATABASE_ID = D1 database UUID from Cloudflare

Add environment secrets (never files in Git, ChatGPT messages or build logs):
- PRUNUS_CLOUDFLARE_API_TOKEN = scoped Cloudflare API token
- PRUNUS_CLOUDFLARE_ACCOUNT_ID = account identifier
- PRUNUS_RESEND_API_KEY = Resend API key
- PRUNUS_AUTH_PEPPER = a new, cryptographically random secret of at least 32 characters
- PRUNUS_ADMIN_EMAILS = one or more comma-separated email addresses for Prunus agency admins
- PRUNUS_OTP_FROM_EMAIL = verified sender address at prunusmedia.com or its subdomain
- PRUNUS_ADMIN_NOTIFY_EMAIL = optional agency destination for alerts

Do not commit keys to wrangler.jsonc. The deployment workflow substitutes the public D1 database UUID only in the ephemeral runner and uploads worker secrets in the same deploy operation.

## Deploy only after approved source is merged

1. Confirm both repository checks are green and Cloudflare Pages uses dist output, not root.
2. Review and merge the consolidated portal pull request into main.
3. In GitHub > Actions choose Deploy Prunus client portal (manual) > Run workflow > main. The workflow will test tenant isolation, run both production D1 migrations, deploy code/static assets/cron and attach the configured custom Worker domain. No automatic deployment occurs on a push.
4. Verify https://portal.prunusmedia.com loads over HTTPS, then test a real agency sign-in and OTP email.
5. As agency admin, add two test customer accounts with separate real email addresses and validate denial of every cross-tenant URL. Submit one test lead through a server-side integration, receive the corresponding website email, verify contact actions, then upload a test PDF/image and confirm private downloads and rejection from the other account.
6. Verify R2 backup/recovery, retention policies and privacy/controller-processor wording, and set Cloudflare WAF rate limiting for login and intake paths before onboarding paying customers.
7. Only after those live tests, set PUBLIC_PRUNUS_PORTAL_ACTIVE=true on the production Cloudflare Pages website, then rebuild and deploy Prunus Media. Confirm /client-login/ opens the real Worker. Activate the UK Trades header/sign-in path after confirming the central URL works.
8. Configure each customer's server-side PORTAL_INGEST_TOKEN only after adding its client/site in the portal. Existing website notification emails must remain functional if the portal ingestion API is unavailable.

## Client launch order

Residential Roofing & Fascias first: invite the real verified owner email, connect the existing staging roofing form integration, and test both Resend notification and private saved lead. Then PP Power Detailing: integrate its own backend form/server function with a distinct intake token and verify it uses only its own tenant.

Do not migrate past emails automatically. Client approvals and scheduled blog records do not publish articles. Weekly queued research jobs are not evidence of completed source research.

## Troubleshooting

A failed GitHub Action does not mean clients can log in. Open the failed Actions step; never paste secret values. If D1 migration fails, check the database UUID and binding, then inspect Cloudflare migration backup. If the Worker domain cannot attach, check DNS conflict and Cloudflare zone/account permissions. If sign-in email fails, check verified Resend sender, quota, and account secrets. Do not expose the Worker or switch the marketing redirect until acceptance tests pass.


## Customer list (migration 0005)
Worker deploy must apply 0005_lead_customers.sql to the portal's D1 before updating code. The production GitHub deployment workflow applies all pending migrations if correctly configured. A passing GitHub build does not prove Cloudflare secrets, PP client provision, OTP login, per-site token or live email intake are functional. Complete real tenant-separated acceptance tests before saying the integration is live.
