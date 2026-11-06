
/**
 * Standalone export adapter: serves all existing page designs without loading
 * WordPress/Breakdance front-end CSS/JS from their original URLs.
 *
 * This is a transitional visual-compatibility adapter. CSS rules are sourced
 * from the committed design export. They still need human-authored component
 * replacement before the project can be called fully dependency-free source.
 */
import path from 'node:path';
export function routeAssetName(filename) {
  if (filename === 'index.html') return 'home';
  if (filename === '404.html') return 'not-found';
  return filename.replace(/\/index\.html$/, '').replace(/[^a-z0-9_-]+/gi, '-');
}
export function extractCssPaths(html) {
  return [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
    .map((m) => (m[0].match(/href=["']([^"']+)["']/i) || [])[1])
    .filter((href) => href && (
      href.startsWith('/wp-content/plugins/breakdance/') ||
      href.startsWith('/wp-content/uploads/breakdance/')
    ))
    .map((href) => decodeURI(href.split('?')[0]).replace(/^\/+/, ''));
}
export function cssWithAbsoluteUrls(css, sourcePath) {
  const baseDir = path.posix.dirname('/' + sourcePath);
  return css.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (whole, quote, target) => {
    if (/^(?:data:|https?:|\/\/|\/|#)/i.test(target)) return whole;
    const normalized = path.posix.normalize(baseDir + '/' + target);
    return 'url(' + (quote || '') + normalized + (quote || '') + ')';
  });
}
export function cleanPageHtml(originalHtml, filename) {
  let html = originalHtml;
  const styles = extractCssPaths(html);
  if (styles.length) {
    let inserted = false;
    const link = '<link rel="stylesheet" href="/assets/prunus-styles/' + routeAssetName(filename) + '.css">';
    html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (match) => {
      if (!/href=["']\/wp-content\/(?:plugins\/breakdance|uploads\/breakdance)\//i.test(match)) return match;
      if (!inserted) { inserted = true; return link; }
      return '';
    });
  }
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) => {
    if (/<script\b[^>]*\bsrc=["'](?:\/wp-content\/plugins\/breakdance\/|\/wp-includes\/|https:\/\/unpkg\.com\/gsap)/i.test(script)) return '';
    if (/id=["']wp-emoji-settings["']/i.test(script)) return '';
    if (/wp-emoji-settings|BreakdanceFrontend\.data|new\s+(?:Breakdance|AwesomeMenu)\b|window\._wpemojiSettings/i.test(script)) return '';
    if (/window\.PrunusCursorFX/.test(script)) return '';
    return script;
  });
  html = html.replace(/<meta[^>]*(?:name=["']generator["']|name=["']ssp-config-path["'])[^>]*>/gi, '');
  html = html.replace(/<link[^>]*href=["']\/xmlrpc\.php[^>]*>/gi, '');
  html = html.replaceAll('http://prunus-media.local', 'https://prunusmedia.com');
  // Preserve exact text and DOM layouts. Native interactions operate on the
  // original class names pending verified semantic component conversion.
  const scripts = '<script defer src="/assets/prunus-scripts/prunus-interactions.js"></script>' +
    '<script defer src="/assets/prunus-scripts/prunus-cursor.js"></script>';
  if (html.includes('</body>')) html = html.replace('</body>', scripts + '\n</body>');
  return html;
}
