import { existsSync } from 'node:fs';
import path from 'node:path';
import { getLegacyRoutes, getLegacyDocument } from '../src/lib/exported-pages.mjs';

const root = process.cwd();
const required = ['index.html','404.html','wp-content','wp-includes','seo-agency-uk/free-seo-audit/index.html','contact/index.html'];
const missing = required.filter((p) => !existsSync(path.join(root,p)));
if (missing.length) {
  console.error('Missing source snapshot paths:', missing.join(', '));
  process.exit(1);
}
const pages = getLegacyRoutes();
if (pages.length < 20) {
  console.error('Expected at least 20 existing content routes; found ' + pages.length);
  process.exit(1);
}
const slugs = pages.map((p) => p.slug);
for (const important of ['about','contact','industries/accountants','industries/physiotherapists','industries/private-clinics','seo-agency-uk/free-seo-audit']) {
  if (!slugs.includes(important)) {
    console.error('Missing important route: ' + important);
    process.exit(1);
  }
}
// The approved client portal link now lives in the shared footer; the header
// must retain its original four dropdowns, primary CTA and room for its logo.
for (const route of ['index.html','about/index.html','website-design/index.html']) {
  const html=getLegacyDocument(route);
  if (!html.includes('class="bde-text-link prunus-footer-login breakdance-link"') ||
      !html.includes('href="/client-login/"') ||
      !html.includes('Start a Project')) {
    throw new Error('Footer client login or original CTA missing from ' + route);
  }
  if (html.includes('class="breakdance-menu-item prunus-client-login"') ||
      html.includes('prunus-editorial-nav-item')) {
    throw new Error('Old oversized header still present in ' + route);
  }
  for (const href of ['/blog/', '/our-work/']) {
    if (!html.includes('href="' + href + '"')) {
      throw new Error('Dropdown link missing ' + href + ' from ' + route);
    }
  }
}
console.log('Export preflight: ' + pages.length + ' preserved paths, main assets and critical routes present.');
