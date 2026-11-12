/**
 * Preserve the original Simply Static assets and redirects in the Astro
 * output. Do not copy old HTML documents over Astro's generated routes.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
if (!existsSync(dist)) throw new Error('Run astro build before postbuild');

// Only actual brand/media assets are retained; do not deploy old plugin
// implementations, WordPress core files or Breakdance generated CSS.
for (const year of ['2024', '2025', '2026']) {
  const source = path.join(root, 'wp-content', 'uploads', year);
  if (existsSync(source)) cpSync(source, path.join(dist, 'wp-content', 'uploads', year), { recursive: true });
}
for (const filename of ['_redirects', 'main-sitemap.xsl', 'CNAME', 'wp-sitemap.xml']) {
  const source = path.join(root, filename);
  if (existsSync(source)) cpSync(source, path.join(dist, filename));
}

// A production sitemap generated from the actual Astro output avoids Local WP
// URLs and includes new blog/work pages as soon as they are built.
const urls = [];
function collect(folder, segments = []) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (['wp-content', 'wp-includes', '_astro'].includes(entry.name)) continue;
    const next = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      collect(next, [...segments, entry.name]);
    } else if (entry.isFile() && entry.name === 'index.html') {
      if (segments.some((s) => ['author','qs','page','client-login'].includes(s))) continue;
      urls.push('/' + (segments.length ? segments.join('/') + '/' : ''));
    }
  }
}
collect(dist);
urls.sort((a, b) => a.localeCompare(b));
const escapeXml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const body = urls.map((url) => '  <url><loc>' + escapeXml('https://prunusmedia.com' + url) + '</loc></url>').join('\n');
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n';
writeFileSync(path.join(dist, 'page-sitemap.xml'), xml);
writeFileSync(path.join(dist, 'sitemap_index.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  '  <sitemap><loc>https://prunusmedia.com/page-sitemap.xml</loc></sitemap>\n</sitemapindex>\n');
writeFileSync(path.join(dist, 'robots.txt'),
  'User-agent: *\nDisallow: /wp-admin/\n\nSitemap: https://prunusmedia.com/sitemap_index.xml\n');
// Visual policy: never publish decorative emoji characters, including older
// exported WordPress content and audit-check icons. No heading or link text is
// removed, and functional navigation arrows outside the emoji blocks remain.
const decorativeEmoji = /[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF]\uFE0F?/gu;
let strippedEmoji = 0;
function cleanRenderedTypography(folder) {
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    if (['wp-content', 'wp-includes'].includes(item.name)) continue;
    const p = path.join(folder, item.name);
    if (item.isDirectory()) cleanRenderedTypography(p);
    else if (item.isFile() && /\.(?:html|css)$/.test(item.name)) {
      const original = readFileSync(p, 'utf8');
      const cleaned = original.replace(decorativeEmoji, () => { strippedEmoji++; return ''; });
      if (cleaned !== original) writeFileSync(p, cleaned);
    }
  }
}
cleanRenderedTypography(dist);
console.log('Preserved exported assets and generated sitemap for ' + urls.length + ' public routes; removed ' + strippedEmoji + ' decorative symbols.');
