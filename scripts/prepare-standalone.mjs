
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getLegacyRoutes } from '../src/lib/exported-pages.mjs';
import { extractCssPaths, routeAssetName, cssWithAbsoluteUrls } from '../src/lib/standalone.mjs';

const root = process.cwd();
const target = path.join(root, 'public', 'assets', 'prunus-styles');
mkdirSync(target, { recursive: true });
const pages = [
  { filename: 'index.html' }, { filename: '404.html' }, ...getLegacyRoutes()
];
const pageCss = new Map();
let totalSize = 0;
for (const { filename } of pages) {
  const html = readFileSync(path.join(root, filename), 'utf8');
  const paths = extractCssPaths(html);
  const css = paths.map((relativePath) => {
    const absolute = path.join(root, relativePath);
    if (!existsSync(absolute)) {
      throw new Error('Missing standalone stylesheet source ' + relativePath + ' on ' + filename);
    }
    return cssWithAbsoluteUrls(readFileSync(absolute, 'utf8'), relativePath);
  }).join('\n');
  writeFileSync(path.join(target, routeAssetName(filename) + '.css'),
    '/* Prunus Media retained layout snapshot: ' + filename + ' */\n' + css);
  pageCss.set(filename, paths.length);
  totalSize += css.length;
}

const home = readFileSync(path.join(root, 'index.html'), 'utf8');
const cursor = [...home.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]).find((script) => script.includes('window.PrunusCursorFX'));
if (!cursor) throw new Error('The approved flower cursor implementation is missing');
const scriptDir = path.join(root, 'public', 'assets', 'prunus-scripts');
mkdirSync(scriptDir, { recursive: true });
writeFileSync(path.join(scriptDir, 'prunus-cursor.js'), cursor);
const auditor = [...home.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]).find((script) =>
    script.includes("const WORKER='https://prunus-seo-audit.jordanjpiper.workers.dev/'"));
if (!auditor) throw new Error('Original free SEO audit JavaScript missing');
writeFileSync(path.join(scriptDir, 'prunus-auditor.js'), auditor);

console.log('Prepared owned CSS assets for ' + pages.length + ' original page documents; ' +
  totalSize + ' CSS characters. Compiled source still requires semantic refactor.');
