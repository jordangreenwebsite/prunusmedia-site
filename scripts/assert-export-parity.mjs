import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getLegacyRoutes } from '../src/lib/exported-pages.mjs';

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
  const normalize = (html) => html.replace(/\r\n/g, '\n').trim();
  if (normalize(oldHtml) !== normalize(newHtml)) {
    const older = normalize(oldHtml), newer = normalize(newHtml);
    let diff = 0;
    while (diff < Math.min(older.length, newer.length) && older[diff] === newer[diff]) diff++;
    console.error('Changed source markup: ' + route.source + ' at char ' + diff);
    console.error('original: ' + JSON.stringify(older.slice(Math.max(0,diff - 100), diff + 180)));
    console.error('generated: ' + JSON.stringify(newer.slice(Math.max(0,diff - 100), diff + 180)));
    failures++;
  }
}
if (failures) {
  console.error(failures + ' exported documents changed during Astro render.');
  process.exit(1);
}
console.log('HTML preservation verified for all ' + routes.length + ' original documents.');
