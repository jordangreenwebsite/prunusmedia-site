/**
 * Production-output regression checks for Prunus GA4 and consent.
 * Run after npm run build.
 */
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = process.cwd();
const tag = '/assets/prunus-scripts/analytics-consent.js';
const marketing = [
  'index.html',
  'about/index.html',
  'contact/index.html',
  'blog/index.html',
  'industries/index.html',
  'pricing/index.html',
  'our-work/index.html'
];

for (const relative of marketing) {
  const file = path.join(root, 'dist', relative);
  assert.ok(existsSync(file), 'Missing marketing route: ' + relative);
  const html = readFileSync(file, 'utf8');
  assert.equal(html.split(tag).length - 1, 1,
    'Exactly one consent script expected on ' + relative);
  assert.ok(!html.includes('https://www.googletagmanager.com/gtm.js'),
    'GTM must not load directly without consent: ' + relative);
}
for (const relative of ['buy-now/index.html', 'client-login/index.html']) {
  const file = path.join(root, 'dist', relative);
  assert.ok(existsSync(file), 'Missing excluded route: ' + relative);
  assert.ok(!readFileSync(file, 'utf8').includes(tag),
    'Marketing consent script not allowed on ' + relative);
}
const source = readFileSync(path.join(root, 'dist', tag.slice(1)), 'utf8');
assert.ok(source.includes('G-QGL84J7V81'), 'Expected GA4 Measurement ID missing');
assert.ok(source.includes("window.gtag('config', measurementId)"), 'Expected one direct GA4 config call');
assert.ok(source.includes('www.googletagmanager.com/gtag/js?id='), 'Missing direct GA4 loader');
assert.ok(!source.includes('www.googletagmanager.com/gtm.js'), 'Old GTM loader must be removed');
assert.ok(source.includes('analytics_storage'), 'Google analytics consent defaults missing');
assert.ok(source.includes("if (previousChoice === 'accepted')"),
  'Unconsented visitors must not load Google Analytics');
console.log('Direct GA4 analytics and consent checks passed on all key routes.');
