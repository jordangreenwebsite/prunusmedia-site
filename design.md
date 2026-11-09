# Prunus Media — design.md
Status: DESIGN LOCK / VISUAL PRESERVATION
Source of truth: https://prunusmedia.com and `main` at 2026-11-06 (commit `cdc6b63df0bae70e84ab97e82020457068284e08`)
Implementation branch: `astro-preservation-rebuild-2026-11-06`

## Non-negotiable design contract

This is **a technical migration, NOT a redesign**. Existing pages must remain visually, structurally, and functionally the same. Preserve every approved heading, paragraph, illustration, image, position, scale, animation, button, interaction, typography, breakpoint, and route until Jordan approves a specific change. "Exactly the same" means compare screenshots and real browser interactions rather than trusting visual intuition. Do not rewrite marketing copy or swap photos as part of migration. Do not silently remove odd-looking or repeated elements; flag them for separate approval.

Never overwrite the production `main` or switch Cloudflare configuration while parity is unverified. Preserve existing public URLs and redirects. Stage on an independent branch and use a Cloudflare preview if the repository/Cloudflare connection supports it.

## Original page and brand reference

- Primary URL: `https://prunusmedia.com/`
- Site HTML source: the Simply Static export currently committed at repository root.
- Existing colours from Breakdance global settings: warm cream `#FAF4EE`, pale blush `#F8DCDC`, sage `#94A998`, yellow-green `#B4D980`, gold `#ECCD82`, charcoal `#2E2E2E`. Other page-specific colours may occur. Source CSS wins over this abbreviated list.
- Cursor animation: exact source in the legacy page's `PrunusCursorFX` script. Gold/light gold/sage/cream petals and particles; tiny movement trails and click bursts. Existing script excludes coarse-pointer devices, uses a canvas layer that doesn't intercept clicks and caps particle count. Preserve its drawing shape, colour, lifetime, click response and performance behaviour.
- Type families already loaded: Space Grotesk, Alegreya Sans, Playfair Display. Keep weights, sizes and letter spacing from legacy styles.
- Responsive: preserve desktop, tablet and mobile hierarchy, margins, navigation collapse, hover/focus/click behaviour and the sticky/scroll header.
- Navigation: retain the same order, names, working dropdowns and destinations until asked otherwise.
- Footer: **approved exception 2026-11-09** — replace the original weak footer with one responsive, semantic, SEO-conscious footer, consistent across legacy and editorial pages. Include real service links, contact, portfolio, blog, social profiles, and discreet Client login at the very bottom. No fake claims, fake location data, or broken policy pages.
- Industry pages are intentionally distinct in tone and visual design (accountants, private clinics, physiotherapists); never impose a generic shared hero on them.

## Source inventory — must survive

- Home; About; Contact; Industries hub; industry details (accountants, physiotherapists, private clinics).
- Website Design and its existing detailed routes (redesign, e-commerce, landing-page design, care/hosting, website review, brand identity, content creation, packages).
- SEO Agency UK, Local SEO, SEO Content, Technical SEO, Free SEO Audit; Social Media Marketing UK.
- Existing static 404, social share metadata, canonical destinations, redirects and sitemap.
- Homepage animations, tabs, comparison sliders, rotating headings, entrance effects and FAQs.
- Contact form: current direct Formspree action (do not change endpoint or fields without a separate decision).
- **Free SEO auditor**: bespoke inline frontend uses `https://prunus-seo-audit.jordanjpiper.workers.dev/`; GET audit by `?url=` and POST to email report with `auditId,name,email`. This Worker is backend, not a WordPress function. Preserve progress, scoring, reports, accessibility and carbon explanations, email gate, errors, and resend flow. Do not change the Worker URL/contract without testing.
- Existing homepage project showcase / before-after comparison: preserve until a new connected content workflow is approved.

## Astro target

- Use Astro static output for Cloudflare Pages. Keep `main`/DNS production untouched until parity passed.
- Migration **phase 1**: preserve all page content/routes in Astro and use the legacy export solely as a design reference. A standalone adapter currently replaces original plugin CSS/JS links with Prunus CSS bundles and independent JavaScript. **Generated bundle declarations still originate from exported Breakdance CSS**, so source-level semantic refactoring is not complete. Do not present an Astro-only bundle as a full clean-source rebuild.
- Migration **phase 2**: replace generated CSS and builder-era DOM classes with authored semantic Astro layouts/components, focusing on header/footer, hero, reusable content sections and independent styles. Native JavaScript for cursor, menus, tabs, sliders, FAQs and animation now exists; refactor and test it against production. Retire all compiled exporter CSS as design equivalence is proved.
- Keep forms and backend API contracts explicit. Never expose secrets client-side or proxy arbitrary URLs without validation.
- Content should be simple to add: `src/content/blog/` for weekly research-led posts; `src/content/work/` for approved project portfolios, with templates in Astro. No invented testimonials or fake results.
- Preserve permalink slugs; do not build thin SEO doorway pages.
- Publish editorial content only when approved and supported by measured Search Console/analytics/SERP and conversion information where possible. No promises of ranking.

## New-content design (not a change to existing pages)

Blog and work pages should use existing brand tokens, matching header/footer appearance, a generous reading width, clear editorial headings, readable typography, and responsive image dimensions. Blog: title, description, date, optionally updated date, author, image and alt text, canonical, internal links, useful related links. Work: verified client name, category, service, location where relevant, exact work delivered, before/after if genuinely sourced, image and alt, optional live website link; never claim metrics without evidence.

New navigation links may be inserted after QA and Jordan's approval; preserving the historical header is the default in the interim.

## Acceptance / parity testing

1. Check Astro build succeeds on clean dependency install and that all 22 currently indexed sitemap routes, plus other committed public routes, output valid files.
2. Compare production vs preview screenshots at 1440px, 1024px, 768px and 390px. Check fonts, image cropping, margins, hero, menu, footer, and industry-specific differences.
3. Test navigation using mouse, keyboard and touch; sticky header; dropdown close; click/outside-click; animations, before-after sliders, tabs, FAQs and prefers-reduced-motion behaviour.
4. Confirm flower trail/click burst and absence of canvas on coarse pointers. Check smoothness and no JS console errors.
5. Run real SEO audit (GET), save/send report (POST), verify Cloudflare Worker CORS, error and loading paths. Test contact form delivery with a non-production test recipient strategy.
6. Check every internal link, image, form, OG image, canonical, robots and sitemap. Fix stale Local WP links as an **explicit SEO correction** (not as a visual redesign).
7. Check responsive overflow, headings, contrast, keyboard accessibility, images, Core Web Vitals, Lighthouse and build output. Do not invent passing scores.
8. Only approve production merge after exact-parity visual/interaction tests and editor workflows for blog/work pass.

## Working style

Jordan can request: "Publish a weekly Prunus post about X" or "We built a new website for Y, add it to Our Work." The assistant should research/verify relevant claims, create a content entry with proper SEO/frontmatter/assets, add internal links intentionally, build/test, open a PR or publish on agreed workflow, and report exact deployed URL and commit when truly confirmed. Do not claim a deployment from a repository write.

Do not inspect or change historical `prunusmedia` / `prunus-media` repositories or Certificates.

## Active migration review — 2026-11-06

- GitHub CI builds Astro and checks all original HTML documents after deterministic standalone transformation.
- Chromium smoke checks passed on homepage, desktop/mobile routes, contact, SEO audit, sample industries, new blog and work pages, with zero runtime JS exceptions after removing plugin initialisers and fixing a malformed legacy auditor escape function.
- Snapshot comparison at common viewport sizes: homepage desktop 9.29%, homepage mobile 19.52%, contact mobile 13.85%, accountants desktop 9.73%, clinics desktop 9.60%, auditor desktop 0% pixel difference. These differences are unreviewed potential regressions; **do not merge solely because CI builds green**.
- Browser sweep across all original routes and region-by-region visual diagnostics are being added; check current CI outcomes rather than assuming successful completion.
- Native frontend paths exist for blog and `/our-work/` with case-study links. SEO Worker and Formspree destinations remain untouched.
- Production stays on `main` with the old deployment. PR #1 remains draft until source cleanup and browser parity are complete.

### Whole-site runtime check (2026-11-06)

- GitHub Actions run [42184445665](https://github.com/jordangreenwebsite/prunusmedia-site/actions/runs/42184445665): **SUCCESS**. Chrome checks all **25 original routes**, with **0 page JavaScript exceptions**; homepage/auditor/contact/industry/blog/portfolio smoke pages also passed.
- Removed the lingering `lozad()` call from Social Media Marketing and replaced its lazy-media and embedded YouTube behaviour with independent JavaScript.
- First controlled screenshot comparisons still show differences requiring review. They are concentrated in dynamic page areas and particularly the mobile hero/header. This is **not** permission to merge or promise pixel-identical output.
- Source CSS remains generated from the original exported design; replacing that compiled stylesheet with semantic authored CSS is the remaining core migration requirement.

## Explicitly approved design changes — 2026-11-09

- The homepage's old three-tab case-study/slider block under **Some of our recent work** may be completely replaced by a fresh gallery of **three recently completed selected projects** plus a link to `/our-work/`. Use the same Markdown work collection as the full gallery; do not show fictitious statistics or pretend designs are live when they are concepts.
- The full `/our-work/` portfolio is expanded to include client work, older work, in-house products and clearly labelled concepts. Order verified completion dates newest first, and group undated projects separately; never imply that the date added to the portfolio is the project launch date.
- The entire footer may be redesigned. Current implementation in `src/lib/footer.mjs` and `public/assets/prunus-styles/footer.css`. Keep the domain and identity credible, with useful linked service navigation and real social/contact destinations.
- Restore the hand-drawn **white** highlight on **Websites built** in the homepage hero, using owned CSS and IntersectionObserver instead of the removed RoughNotation plugin.
- Approved scroll header: visible through the first ~1,100 px. Past that point, it hides after downward scrolling and reveals when scrolling up, with escape hatches for reduced motion, keyboard focus, and open mobile navigation.
- The footer's **Client login** points to `/client-login/`. Shared Worker code lives in **draft PR #2**. The portal `portal.prunusmedia.com` is **NOT confirmed live**, so the login route currently shows a noindex access-information page and must NOT automatically redirect until D1/R2, Resend OTP, secrets, custom domain, rate limits and two-client privacy verification have passed. Once those gates pass, set the Cloudflare Pages environment variable `PUBLIC_PRUNUS_PORTAL_ACTIVE=true` to enable the secure handoff, rebuild and test the redirected login; do not set this early.
- All exceptions remain **preview-only** pending review. Keep live `main` and custom domains untouched until merge/cutover approval.


## Approved new visual case study (9 November 2026)

- The Residential Roofing & Fascias before/after feature is a **specific owner-requested homepage addition**, not permission to change the existing hero, gallery, cursor, navigation or other historical layouts. Preserve export parity outside the approved case-study section.
- `src/lib/roofing-case-study.mjs` provides the styled comparison for the homepage, Our Work index and the detailed roofing project; separate from UK Trade Websites' design system and using Prunus's cream, sage, charcoal, Playfair Display and Space Grotesk.
- The three genuine tinified screenshots are hosted by the sister UK Trade Websites site at `/case-studies/roofing/{before.jpg,after.jpg,after-menu.png}`, sourced from the uploaded ZIP. Keep both screenshot windows independently scrollable and keyboard-accessible; show the redesigned menu below.
- Fact claims: a newly launched but difficult-to-maintain site with little initial visibility; retained visual character; 17-page static rebuild including **15 additional** service/location pages; ongoing local SEO. Do **not** promise immediate rankings or fabricated conversions.
- Keep this work in a review PR until the homepage's approved addition is inspected at desktop/mobile sizes per the visual-preservation contract.


## Approved commercial update — 9 November 2026
- Publish a single premium /pricing/ page (301 from /website-design/packages/ and /packages/), retain the established one-off build prices (£995 Launch, £1,795 Growth, £2,995 Scale / Custom), and show one £99/month managed hosting rate across plans.
- £195/month SEO (three-month minimum), with hosting included while SEO is active; five keywords tracked, up to five priority pages worked on monthly, one useful weekly blog, relevant GBP setup/optimisation where eligible, and honest monthly reporting. No guaranteed rankings or enquiries.
- Provide a rebuild offer, referencing the genuine roofing project and linking to real case studies. Do not invent search rankings or conversions.
- Supplementary services: social management from £99/month, Meta/Google Ads management from £50/month excluding ad spend, existing-site help £50/hour. Avoid old fixed two-tier social cards.
- Preserve existing Formspree contact endpoint; pricing CTAs preselect the relevant service on the contact form.
- On editorial routes including /our-work/, keep "Skip to main content" accessible but visually hide it until keyboard focus.
- Preserve approved design language (warm cream, sage, serif headings) and industry-specific page styling.


## Approved shared navigation cleanup — 2026-11-09
- The homepage header is the sole approved structural source for all legacy and native editorial page headers. Historic Breakdance exports duplicated Industries as a second Website Design dropdown column and differed in logo/menu presentation. Never restore that extra column.
- Preserve four top-level dropdowns, mobile controls, approved logo and header dimensions; do not add a crowded fifth top-level button.
- Pricing (/pricing/) appears in a separate, high-contrast white box with black lettering as the first entry in each dropdown. Normal links underneath retain their order: Our Work follows Pricing and Blog follows Pricing in About/Contact.
- Remove the old buried Website Design > Packages menu item. Keep 301 redirects to /pricing/ and a compact homepage pricing invitation immediately below the existing hero, without changing the hero illustration or actions.
- Reaffirmed prices: one-off builds from £995 / £1,795 / £2,995, standalone hosting £99/month, SEO £195/month with hosting while active, social from £99/month, Meta/Google Ads management from £50/month (ad spend separate), website support £50/hour.
- Historical builder pricing embedded in the excluded website-design/packages HTML source is not published and must never be linked or reintroduced.
- Verify representative pages and every dropdown on mobile and desktop; check actual logo visibility, not just the presence of image markup.
