import { existsSync } from 'node:fs';
import path from 'node:path';
import { getLegacyRoutes } from '../src/lib/exported-pages.mjs';

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
console.log('Export preflight: ' + pages.length + ' preserved paths, main assets and critical routes present.');
