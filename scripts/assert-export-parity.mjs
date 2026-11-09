import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getLegacyRoutes } from '../src/lib/exported-pages.mjs';
import { cleanPageHtml } from '../src/lib/standalone.mjs';

const base = process.cwd();
const routes = [
  { source: 'index.html', output: 'index.html' },
  { source: '404.html', output: '404.html' },
  ...getLegacyRoutes().map(({ filename, slug }) => ({
    source: filename,
    output: path.join(slug, 'index.html')
  }))
];
let failures = 0;
for (const route of routes) {
  const oldHtml = readFileSync(path.join(base, route.source), 'utf8');
  const newHtml = readFileSync(path.join(base, 'dist', route.output), 'utf8');
  const standaloneHtml = cleanPageHtml(oldHtml, route.source);
  // The homepage collection-driven gallery changes by design. Assert that
  // everything outside its one explicit section is still an exact match.
  const normalize = (html) => html.replace(/\r\n/g, '\n').trim().replace(
    /<section class="pm-home-work"[^>]*>[\s\S]*?<\/section>/,
    '<section data-collection-driven-gallery></section>'
  ).replace(
    /<style id="pm-roofing-story-css">[\s\S]*?<\/style><section class="pm-roofing-story[\s\S]*?<\/section>/,
    ''
  );
  if (normalize(standaloneHtml) !== normalize(newHtml)) {
    const older = normalize(standaloneHtml), newer = normalize(newHtml);
    let diff = 0;
    while (diff < Math.min(older.length, newer.length) && older[diff] === newer[diff]) diff++;
    console.error('Changed transformed source markup: ' + route.source + ' at char ' + diff);
    console.error('original: ' + JSON.stringify(older.slice(Math.max(0,diff - 100), diff + 180)));
    console.error('generated: ' + JSON.stringify(newer.slice(Math.max(0,diff - 100), diff + 180)));
    failures++;
  }
}
if (failures) {
  console.error(failures + ' exported documents changed during Astro render.');
  process.exit(1);
}
console.log('Standalone transformation verified against all ' + routes.length + ' original documents.');
// No production pages should request the old builder/plugin CSS or JS.
for (const route of routes) {
  const html = readFileSync(path.join(base, 'dist', route.output), 'utf8');
  if (/<(?:script|link)\b[^>]*(?:src|href)=(["'])\/wp-content\/(?:plugins\/breakdance|uploads\/breakdance)\//i.test(html)) {
    console.error('Legacy builder CSS/JS still referenced in ' + route.output);
    process.exit(1);
  }
}
console.log('No original Breakdance plugin stylesheet or script URLs in prerendered HTML.');
