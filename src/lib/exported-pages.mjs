/**
 * Initial zero-redesign bridge: Astro prerenders every public HTML page from
 * the existing committed Simply Static export. This does not yet remove the
 * exported Breakdance CSS/JS dependency; see design.md for the phased plan.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cleanPageHtml } from './standalone.mjs';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const publicDirs = [
  'about',
  'contact',
  'industries',
  'seo-agency-uk',
  'social-media-marketing-uk',
  'website-design',
  'page',
  'author',
  'qs'
];

export function getLegacyDocument(filename) {
  const absolute = path.resolve(root, filename);
  if (!absolute.startsWith(root + path.sep) && absolute !== path.resolve(root)) {
    throw new Error('Invalid exported page path: ' + filename);
  }
  return cleanPageHtml(readFileSync(absolute, 'utf8'), filename);
}

export function getLegacyRoutes() {
  const routes = [];
  function visit(directory, urlSegments) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute, [...urlSegments, entry.name]);
      } else if (entry.isFile() && entry.name === 'index.html') {
        // This obsolete URL redirects to the new native Astro /pricing/ page.
        if (urlSegments.join('/') === 'website-design/packages') continue;
        routes.push({
          slug: urlSegments.join('/'),
          filename: path.relative(root, absolute)
        });
      }
    }
  }
  for (const directory of publicDirs) {
    visit(path.join(root, directory), [directory]);
  }
  const unique = new Set();
  return routes.filter(({ slug }) => {
    if (unique.has(slug)) throw new Error('Duplicate export route: ' + slug);
    unique.add(slug);
    return true;
  }).sort((a, b) => a.slug.localeCompare(b.slug));
}
