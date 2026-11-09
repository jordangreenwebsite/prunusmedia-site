# Prunus editorial standard and release gate

This standard applies to every Prunus Media and UK Trade Websites customer. The portal is an editorial management system, not an autonomous AI publishing engine.

## Research and idea selection
1. Record business, trade, genuine service area, primary services, customer questions, preferred voice and existing article inventory. Review recent Search Console queries, enquiry terms and page performance before public SERPs.
2. Every Monday enqueue one research task per active website. The queue does **not** mean that web research has happened. The researcher must check actual current search results, People Also Ask, relevant trade regulators or standards bodies, competitors and first-party business evidence before marking the task complete.
3. Prefer first-party regulations, official trade bodies, public-sector guidance, manufacturer technical specifications, reputable specialist publications and actual customer experience. Competitor articles may indicate questions but do not establish facts or authority by themselves.
4. Record each source's exact HTTPS URL, title and verification date. Prefer sources that directly support a specific practical claim. Never invent quotations, reviews, rankings, costs, laws, volumes, product specifications or local project details.
5. Check near-duplicate intent against all existing idea/draft/published posts and public client pages. The software blocks exact normalised topic duplicates. Semantic overlap still needs human review.
6. A research result must identify the reader question, user intent, short factual answer, local applicability, evidence, proposed H2 outline, useful internal links and a reason the page is valuable. Prioritise substance over an advertising article.

## Draft and approval gates
- Write in natural UK English as the particular client would speak. No em dashes, generic AI filler, deliberate grammatical errors or manufactured personal anecdotes. Proofread and verify grammar.
- For safety, law, medical, electrical, fire, structural, chemical or other higher-risk claims, use applicable primary authorities and specialist human review. Where uncertainty exists, state it.
- Every draft needs a target query or reader question, a substantial original brief, a meaningful complete draft, verified source URLs (or documented first-party evidence), and an evidence note before client review or scheduling.
- Add useful internal links, clear one-H1 structure, appropriate title/meta, concise paragraphs, real alt text for relevant images, appropriate schema, and a restrained next step. Don't force exact-match keywords.
- Client approval is optional by account. If enabled, the client must approve the editorial item before it can be scheduled or marked published. Approval does not skip Prunus quality checks.
- Scheduling only stores an intended publish time. It does not send text to a repository or publish it. Prunus must make a reviewed PR to the correct site repository, check the build, approve the deploy, verify the public URL, then mark it published.
- Keep drafts, ideas, uploads and sensitive client material private and tenant-scoped. Never put OAuth or GitHub credentials in browser code.

## Automation distinction
The D1 weekly queue is built and runs from the existing Worker cron. Actual unattended SERP research, Search Console access, AI drafting, GitHub PR creation and scheduled deployment require separate authorised service integrations and a monitored job runner. No unverified research or automatic publication is claimed by the MVP.

## Monitoring
Track website enquiry count and postcode district in the admin overview without exposing customer contact details. Clients retain their full enquiry contact actions. Historical email-only enquiries are not recovered automatically. Confirm legal/privacy retention, per-client data processing and recovery before live use.
