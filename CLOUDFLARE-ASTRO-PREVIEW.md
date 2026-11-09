# Prunus Media: Astro preview deployment

This repository currently supports both the existing static export on `main` and a separate Astro build branch.

## Why a successful Cloudflare preview can still show 404 for /blog/ and /our-work/

On `astro-preservation-rebuild-2026-11-06`, the `src/pages/blog/` and `src/pages/our-work/` routes **only exist in the generated Astro output, `dist/`**.

The original Pages project was configured around the legacy Simply Static export from the repository root. A green Cloudflare deploy can therefore publish the old files unchanged, without ever generating the new Astro pages or injecting their header navigation. GitHub Actions using `npm run build` do produce `dist/blog/index.html` and `dist/our-work/index.html`, but that does not mean the Cloudflare Pages project ran that build.

## Recommended safe setup: separate Cloudflare Pages project for Astro testing

Do **not** change the existing production project's global build settings yet; `main` still contains the legacy site and has no Astro build setup.

In Cloudflare, create another **Pages** project connected to the **same** GitHub repository, `jordangreenwebsite/prunusmedia-site`:

- Project name: e.g. `prunusmedia-astro-preview` (a distinct Pages project; do not attach `prunusmedia.com`).
- Production branch of **this new project only**: `astro-preservation-rebuild-2026-11-06`.
- Framework preset: Astro (or None with settings below).
- Root directory: repository root.
- Build command: `npm run build`.
- Build output directory: `dist`.
- Node.js: 22 (`NODE_VERSION=22` if required).
- No custom domains.

After the new deployment succeeds, verify the new Pages domain (not a deployment URL from the legacy project):
- `/`: visible top-level Blog and Our Work navigation links.
- `/blog/`: journal landing page.
- `/our-work/`: portfolio listing (3 initial projects).

The blog currently has no published articles (only an unpublished example template), so the empty-state message is expected; 404 is not.

Once the site has met visual/functional parity gates and the Astro branch is merged into `main`, reconfigure the existing production project to build with `npm run build` and output `dist`, then promote. Do not merge or switch domains as part of preview setup.
