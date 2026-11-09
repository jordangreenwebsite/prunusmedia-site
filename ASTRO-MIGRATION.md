# Prunus Media Astro migration

This branch introduces an Astro static-site build and a repeatable blog/portfolio publishing system **without altering the original exported pages**. Read \`design.md\` first.

## Stage-one fidelity architecture

- \`src/pages/index.astro\`, \`src/pages/[...slug].astro\` and \`src/pages/404.astro\` prerender the original exported HTML verbatim. They are real Astro routes.
- \`src/lib/exported-pages.mjs\` enumerates all public export pages in the original repository. New legacy routes in listed directories are picked up automatically at build time.
- \`scripts/postbuild.mjs\` adds all current WordPress-exported static assets (CSS, JS, images) from the repository to \`dist/\` after the Astro build. There is no PHP execution or live WordPress server in this setup.
- Existing page appearance and interactive functionality are protected at this stage, but **the legacy pages still use exported Breakdance frontend CSS/JS**. This bridge is not the final dependency-free refactor. Replace each component after tested visual and behavioural parity per \`design.md\`.
- Separate editorial routes (\`/blog/\`, \`/our-work/\`) use editable Astro content collections.
- The original \`main\` deploy stays untouched unless review explicitly approves merging this branch.

## Local and Cloudflare Pages build

\`\`\`bash
npm install
npm run dev       # copies original assets into local public/ automatically
npm run check:export
npm run build
npm run preview
\`\`\`

For Cloudflare Pages set build command \`npm run build\`, output directory \`dist\`, and Node 20 or later (Node 22 recommended). Do **not** change the production Pages project or custom-domain/DNS setting until the preview is tested.

## Publish a Prunus blog post

Create \`src/content/blog/my-search-topic.md\` with YAML frontmatter (see \`src/content/blog/_example.md\` for an unpublished template). Set \`draft: false\` only for ready-to-publish content; commit, build, review and merge. It appears under \`/blog/my-search-topic/\`, \`/blog/\` and in the generated sitemap.

## Add a new client website

Create \`src/content/work/client-slug.md\` (see \`_example.md\`). Use real client name, approved work description, services, screenshot and a verified live website URL. Set \`draft: false\` to publish on \`/our-work/\` and \`/our-work/client-slug/\`. The current homepage portfolio remains unchanged until Jordan separately approves connecting the new data-driven cards to the existing tabs.

## Publishing quality controls

For every post or case study: verify facts, use real/approved assets, add descriptive alt text, correct canonical and page metadata, link naturally to existing services, and run the link/visual/sitemap tests. No invented review, ROI or ranking evidence. Design stays identical on legacy pages.

## Unverified matters

No clean install/build, browser screenshot comparison, Worker test, form delivery, or Cloudflare preview deployment has yet been confirmed by this document. Record actual results before authorising production.

## Standalone frontend migration in progress

Astro now transforms committed exported pages to replace WordPress/Breakdance runtime script and stylesheet **links** with generated Prunus-owned CSS bundles and authored JavaScript. Media remains at its existing URLs. The former CSS is **compiled from original exported designs** for visual compatibility and therefore is not yet a clean semantic hand-written design system. It must be refactored section-by-section and verified in real browsers before this PR is merged. Separate forms/auditor remain unchanged. Do not confuse removal of runtime plugin URL references with full source-level elimination of builder-era styling.

## Clean-code acceptance gate

The conversion is **not yet complete**: old source HTML and exported CSS are still read at build time as the reference for the preserved layouts. It is not sufficient simply to rename legacy CSS files. Replace the exported layout and compiled rules with maintainable Astro components and authored styles before marking this a dependency-free rebuild. The original Breakdance/WordPress plugin JavaScript should never be restored to the generated pages.

After comparison approval, merge to `main` and configure the production Cloudflare Pages build as `npm run build` with output directory `dist`. Do not point the custom domain at an unreviewed feature branch.

## Approved homepage/gallery/footer project changes (2026-11-09)

- Work cards are authored in `src/content/work/*.md`, using `status`, optional `completedAt` (verified date only), `priority` (display curation when unknown), and `featured` for exactly 3 homepage cards. `addedAt` is a portfolio publish date, **not** a fabricated launch date.
- `src/lib/portfolio-ui.mjs` renders consistent cards on the homepage and portfolio index; `src/lib/standalone.mjs` replaces the one approved homepage section.
- The footer lives in `src/lib/footer.mjs`, styled by `public/assets/prunus-styles/footer.css`. The same footer appears in legacy pages and editorial shell.
- Keep `/client-login/` as a **noindex** holding/entry route until the separate Cloudflare Worker PR #2 is deployed and verified. Once it is genuinely operational, set `PUBLIC_PRUNUS_PORTAL_ACTIVE=true` in the marketing Pages project and rebuild; do not override DNS or activate this merely to show a working link.
- UI screenshot artefacts from GitHub Actions include full recent-work gallery and footer at desktop/mobile sizes. Review visually before production merge.
