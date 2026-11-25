# Marketing Studio — read-only Content360 pilot
The owner successfully tested Bearer-authenticated GET accounts/posts/media and created an unpublished draft manually. This module does not create drafts, upload, schedule, publish or run automatically.
 
Configure the separate prunus-website-clients Worker only:
- CONTENT360_API_TOKEN: encrypted runtime secret, already reported configured by owner; never put value in source or logs.
- CONTENT360_WORKSPACE_ID: runtime text variable, exact workspace UUID from the Content360 dashboard URL.
- CONTENT360_OWNER_EMAIL: encrypted runtime secret containing the exact owner login email, also in existing ADMIN_EMAILS. Other admins and client users are denied.

Use existing portal sign-in and open /marketing-studio (or agency dashboard link). Missing owner configuration fails closed. Each endpoint requests a single provider page only and displays bounded metadata, not total counts, raw posts, media URLs, personal IDs or secrets. HTTP failures are displayed without logging raw bodies. No provider-supplied pagination links are followed; redirects rejected. No new DB migration or dependencies. No changes to Certificates, blog publishing, or Stripe.

Release gate: run full portal test suite and validate actual Cloudflare secret retention before deploy; owner signs in, confirms three sections load and no credential appears in HTML or network responses; signed-out, client and other admin sessions must be denied. No unauthorised account writes. Future draft and schedule operations require separate account allowlists, audit/idempotency, explicit approval and real acceptance tests.