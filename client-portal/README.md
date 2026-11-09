# Prunus Media shared website-client portal

Status: **feature branch / NOT LIVE**. Backend code is contained in this directory. The live marketing website and the separate Astro migration remain untouched. Do not merge into a root-published static Cloudflare Pages deployment; the existing main website currently serves its repository root as static assets. Merge this feature only after the Astro migration switches the marketing site's output directory to dist, or move this directory into a dedicated private-source repository.

## Purpose

One Cloudflare Worker serves the Prunus client workspace at a planned portal.prunusmedia.com address. Every Prunus website customer has their own authorised account(s) and site. The same email-code login works from a sign-in link on their website; Prunus Media staff use the same workspace and see all authorised clients.

Features built:
- Invited-email, six-digit, ten-minute OTP; five code attempts; sixty-second resend delay; hashed codes and IP-based rate counter; seven-day secure HTTP-only sessions; no self-registration.
- Admin provisioning of clients/sites and team members; one-time integration token generation and rotation.
- Tenant-scoped list of website leads, client profile, change requests and request statuses; agency progress notes.
- Full article text and/or private PDF upload (5 MB max); no auto-publishing.
- Server-to-server lead ingestion with per-site bearer token; token stored hashed in D1 and raw value only shown at creation/rotation; the client's requested tenant ID is ignored.
- Private R2 file downloads authorised per user and tenant. PDF is always served as an attachment.
- Audit records for writes; admin notification delivery status saved for agency review.
- No Prunus Certificates account or database is reused.

## Cloudflare setup — required before deployment

1. Run the new Worker as its OWN project from this directory, never as a Cloudflare Pages function on the marketing website. In Cloudflare, create a D1 database named prunus-website-clients. Replace the database_id placeholder in wrangler.jsonc with the real ID. This value is not a secret.
2. Create a private R2 bucket named prunus-website-client-files. Do not enable a public bucket domain.
3. In the Worker, configure secrets (never commit their values):
   - AUTH_PEPPER: long, randomly generated secret used to HMAC OTPs and IP-rate-limit keys.
   - RESEND_API_KEY: Resend email API key with sending permission.
   - OTP_FROM_EMAIL: plain verified Prunus email address, for example portal@contact.prunusmedia.com, after verification.
   - ADMIN_EMAILS: comma-separated, verified agency email address(es) permitted to be admins; the OTP is still required.
   - ADMIN_NOTIFY_EMAIL: optional agency destination for work-request alerts.
4. Apply D1 migrations to the remote database BEFORE directing any traffic to the Worker. From this directory after configuring Wrangler: npm install; npx wrangler d1 migrations apply prunus-website-clients --remote.
5. Deploy from this directory: npm run deploy. In Cloudflare, attach portal.prunusmedia.com as a custom Worker domain with HTTPS. Do not point a client website or the Prunus marketing domain at the Worker.
6. Add a link from prunusmedia.com to the Worker only after the deployment passes the real-world tests below.
7. As Prunus admin, sign in using an email in ADMIN_EMAILS. Create the first customer. Record the returned site integration token securely; it will never be displayed again (unless rotated).
8. For each client's Cloudflare Pages project, add PORTAL_INGEST_TOKEN as a server-side secret using the token generated for that client's site. Do not set it in browser/public variables. The website quote function sends lead details to the portal API only after its existing Resend email send succeeds. No token means email-only mode.
9. Only after the portal and forms have passed acceptance tests should the client's website sign-in link be enabled/released.

The Worker must be protected with Cloudflare WAF/rate-limit rules for auth and ingestion. Current D1 IP counter reduces OTP abuse but is not an edge-wide abuse firewall. Monitor Resend quota, API errors, Worker logs and D1 reads/writes.

## Tests

- Run Node 22 or later: node --experimental-sqlite --test tests/*.test.mjs (or npm run check with a suitable Node version).
- Test at least two real invited accounts from separate client businesses: each must be unable to load the other client's leads, requests, profile or private PDFs through direct API requests.
- Verify codes expire, cannot be reused, stop after five bad tries and are not sent to uninvited addresses.
- Verify stored lead details and email delivery independently with a real test lead; the existing email form must still succeed if the portal API is temporarily down.
- Upload a valid PDF, reject a non-PDF and reject an oversized upload, and confirm no public R2 URL exists.
- Send full article text only, then PDF + text, and confirm neither publishes a blog to a live website.
- Check mobile sign-in, keyboard accessibility, account logout and admin status updates.
- Recheck Cloudflare custom domain, secrets, CSP, HTTPS and rate-limit/WAF protection before offering clients access.

## Privacy and ongoing operations

The roofing website already collects personal data in its form. Before switching on portal storage, update the client privacy notice/data-processing documentation to disclose the central secure storage and clarify the client's controller role and Prunus Media's processor role where applicable. Establish retention periods, deletion/export requests, agency access policy, D1 backups and R2 recovery tests. No retroactive import of already-emailed leads is automatic.

R2 PDFs may contain embedded active content or dangerous links despite a valid PDF signature. The system accepts a PDF byte signature and forces download rather than inline display, but it does NOT provide malware scanning; agency staff should scan PDFs before opening them. Consider automated malware scanning before scaling to additional clients.

Work requests are suggestions for Prunus review; converting a blog PDF into an accessible, SEO-aware Astro/HTML page and publishing it to the correct client site is a separate, reviewed GitHub change. The client cannot edit or publish live pages directly.

## MVP acceptance / deployment gate

This is an implemented **candidate**, not a claim of deployed functionality. Keep the client-side navigation integration in a separate PR until the Worker is reachable and a real OTP/lead/PDF test has passed. GitHub Actions test completion alone cannot verify live Cloudflare bindings, deliverability, WAF rules, malware scanning or legal/privacy documents.

Future: lead contacted/dealt-with UI, staff permissions with assigned tenants, comment threads, upload virus-scanning pipeline, audited retention/erasure/export, admin queue across tenants, automated backup & restore drills.


## Client login links and enquiry pipeline (added 2026-11-06)

- Clients enter from https://prunusmedia.com/client-login/ on the new Astro site and their own website. The roofing link passes a ?site=residential-roofing-fascias hint to preselect only an account the email is authorised to see.
- Astro Cloudflare Pages redirects /client-login/ to the independently hosted portal.prunusmedia.com Worker. Both sites must be deployed before this route works.
- The account-scoped Back to my website button links to the selected tenant's registered HTTPS domain. Query-string return URL overrides are not supported.
- Stored enquiry cards offer WhatsApp (for recognisable UK mobile numbers only), Call and Email actions like the lead notification emails. These open apps without sending any message automatically.
- Clients can update their own leads using New, Contacted, and Dealt with stages and filter the pipeline. Server-side permissions and auditing enforce tenant separation.
- The first Prunus admin from ADMIN_EMAILS can sign in and provision the first customer even when the database is empty.

RELEASE GATE: Do not merge login links while the Worker is unreachable. Before enabling the roofing lead-integration secret, add the verified owner email and run an end-to-end form -> email -> lead list -> contact action -> status change test.

Cloudflare Worker custom domain is declared in wrangler.jsonc. It requires a Cloudflare zone owned by the account, authorised deploy credentials, no conflicting CNAME, D1/R2 bindings and secrets.


## Editorial MVP extension (2026-11-09, staged)

The existing draft portal now includes the agency-wide editorial calendar, tenant preferences and client approval workflow, general photos/PDF uploads and aggregate enquiry reporting.

### What is implemented
- D1 migration 0002_editorial.sql stores brand (Prunus or UK Trades), niche, real service areas, voice notes, a Search Console link, per-client idea/upload/approval toggles, editorial posts, verified-reference metadata, private client assets and weekly research jobs.
- Admin can see every connected client with enquiry totals, last-30-day counts, blog stages, pending approvals and uploaded file counts. Enquiry reporting shows only date and postcode district; it does not return personal lead details. The client dashboard still shows full enquiry details to that authorised client.
- Admin may maintain article research briefs, draft text, reference URLs and dates, evidence notes, status and scheduled publication date. Clients may suggest topics and, when requested for that article, review the complete draft, approve it or request changes.
- Entering the client-review stage sends a Resend email to the client's active member emails when the Worker email secrets are configured. The client approval/changes response can notify the agency. Failed delivery is logged as a notification for admin inspection.
- Private images (JPG/PNG/WebP) and PDFs up to 8 MB are validated, tenant-scoped in R2, and always downloaded as attachments. Uploaded PDFs are not auto-converted to posts.
- Cloudflare's existing daily Worker cron creates one idempotent research task for each active client per week. Admin can record the actual source links and research findings and mark it complete. EDITORIAL_POLICY.md defines publication gates and writing standards.
- Google Search Console is **a client-specific, admin-only link**, not an OAuth data ingestion or Search Console API integration. The portal does not claim access to external analytics.
- The portal does **not** automatically research the web, invent an idea list, create GitHub pull requests, publish at scheduled time or connect to a customer site until each independent integration is built, authorised and tested.

### Required setup
1. Provision the D1 database and private R2 bucket from the earlier setup section.
2. Apply both D1 migrations before deploying. Test migration 0002 on a throwaway D1 database first and back up before applying to an existing dataset.
3. Configure a real verified sender, Resend email key, admin email(s), session pepper and admin notices; do not commit secrets.
4. Connect each client website's server-side form ingestion token separately. The roofing integration remains a draft PR; PP Power Detailing has not been connected.
5. Sign in as the admin, create client accounts, set individual approval preferences, connect verified client emails, and test with two invited accounts.
6. Configure Cloudflare custom domain, HTTPS, WAF rate limits, R2 malware safety/retention plan and privacy notices. Test real email delivery, full lead + stats visibility and files before enabling public sign-in.
7. Do not remove the marketing site's holding page or merge login-route redirects until the Worker and real cross-tenant tests are successful.

Scheduled articles deliberately require a separate reviewed GitHub PR, successful build and verified live URL. This is the safe release gate for SEO clients.
