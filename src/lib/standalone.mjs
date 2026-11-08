
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

  // The original exported DOM already records the exact per-section effect.
  // Breakdance's entrance.css hides [data-entrance] until its removed runtime
  // fires; transfer the marker rather than relying on a fragile class regex.
  // Browser-native IntersectionObserver handles the animation independently.
  html = html.replace(/\sdata-entrance=(["'])([a-zA-Z]+)\1/g,
    (_, quote, effect) => ' data-prunus-reveal="' + effect + '"');

  // Preserve explicitly configured sticky elements without the old script.
  for (const [, className] of originalHtml.matchAll(
    /new BreakdanceSticky\(\s*['"]\.([^'"]+)['"]/g
  )) {
    if (!/^[a-zA-Z0-9_-]+$/.test(className)) continue;
    const pattern = new RegExp('(class="[^"]*\\b' + className + '\\b[^"]*")');
    html = html.replace(pattern, '$1 data-prunus-sticky');
  }


  // Preserve each page's original animated heading phrase (not just the
  // homepage phrase). Both the homepage and SEO page have distinct copy.
  for (const [, className, changingText] of originalHtml.matchAll(
    /new BreakdanceAnimatedHeading\(\s*['"]\.([\w-]+)['"]\s*,[\s\S]*?"changing_text":\s*\[\s*\{\s*"text":\s*"([^"]+)"/g
  )) {
    const label = changingText.replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const pattern = new RegExp('(<div class="' + className +
      '[^"]*bde-animated-heading")', 'i');
    html = html.replace(pattern, '$1 data-prunus-changing-text="' + label + '"');
  }

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
    if (/wp-emoji-settings|BreakdanceFrontend\.data|new\s+(?:Breakdance[A-Za-z]+|AwesomeMenu)\s*\(|window\._wpemojiSettings/i.test(script)) return '';
    if (/window\.PrunusCursorFX/.test(script)) return '';
    if (/\blozad\s*\(\s*\)/.test(script)) return '';
    if (/const\s+WORKER\s*=\s*['\"]https:\/\/prunus-seo-audit\.jordanjpiper\.workers\.dev\//.test(script)) {
      return '<script defer src="/assets/prunus-scripts/prunus-auditor.js"></script>';
    }
    return script;
  });
  html = html.replace(/<meta[^>]*(?:name=["']generator["']|name=["']ssp-config-path["'])[^>]*>/gi, '');
  html = html.replace(/<link[^>]*href=["']\/xmlrpc\.php[^>]*>/gi, '');
  html = html.replaceAll('http://prunus-media.local', 'https://prunusmedia.com');
  // Three legacy industry exports contain a broken single-quote escape in
  // the SEO auditor's escapeHtml helper. Correct the syntax, not the UI.
  html = html.replaceAll(".replace(/'/g,''')", ".replace(/'/g,'&#39;')");



  // Preserve the original four-dropdown header, leaving room for the logo.
  // Place Our Work as the first item of the existing "Our Work" dropdown
  // (before Industries) and Blog under "About / Contact".
  function dropdownEntry(href, label) {
    return '<li class="breakdance-dropdown-item prunus-added-dropdown-item">' +
      '<a class="breakdance-link breakdance-dropdown-link" href="' + href +
      '" target="_self" data-type="url"><span class="breakdance-dropdown-link__label">' +
      '<span class="breakdance-dropdown-link__text">' + label +
      '</span></span></a></li>';
  }
  function prependToDropdown(number, href, label) {
    const pattern = new RegExp('(<li class="bde-menu-dropdown-27-' + number +
      '\\b[\\s\\S]*?<ul class="breakdance-dropdown-links">)', 'i');
    if (pattern.test(html)) html = html.replace(pattern, (match) =>
      match + dropdownEntry(href, label));
    else if (html.includes('class="bde-menu-dropdown-27-' + number)) {
      throw new Error('Cannot insert ' + label + ' into the existing header on ' + filename);
    }
  }
  prependToDropdown('153', '/our-work/', 'Our Work');
  prependToDropdown('152', '/blog/', 'Blog');

  // The central client login belongs in the shared footer, never the header.
  // This transformation also runs on the Astro editorial shell, which reuses
  // the approved original header and footer from the exported homepage.
  const footerLogin = '<a class="bde-text-link prunus-footer-login breakdance-link"' +
    ' href="/client-login/" target="_self" data-type="url">Client login</a>';
  // Keep original footer links in order; Client login is a discreet final link.
  const footerContact = /(<a class="bde-text-link-26-116[^"]*"[^>]*>[\s\S]*?<\/a>)/i;
  const footerColumn = /(<div class="bde-div-26-113 bde-div">)/i;
  if (!html.includes('class="bde-text-link prunus-footer-login')) {
    if (footerContact.test(html)) html = html.replace(footerContact, '$1' + footerLogin);
    else if (footerColumn.test(html)) html = html.replace(footerColumn, '$1' + footerLogin);
  }
  else if (!html.includes('prunus-footer-login') && html.includes('</body>')) {
    // Older WP archive and 404 exports have no standard shared footer.
    html = html.replace('</body>',
      '<footer class="prunus-fallback-footer">' + footerLogin + '</footer></body>');
  }
  // The header logo should never be deferred behind other lazy images.
  html = html.replace(/(<header\b[\s\S]*?<img\b[^>]*class="breakdance-image-object"[^>]*?)loading="lazy"/i,
    '$1loading="eager" fetchpriority="high"');


  // Preserve existing DOM layout while independent interactions replace the
  // exported builder's runtime.

  const scripts = '<script defer src="/assets/prunus-scripts/prunus-interactions.js"></script>' +
    '<script defer src="/assets/prunus-scripts/prunus-cursor.js"></script>';
  if (html.includes('</body>')) html = html.replace('</body>', scripts + '\n</body>');
  if (html.includes('</head>')) html = html.replace('</head>', '<link rel="stylesheet" href="/assets/prunus-styles/components.css">\n</head>');
  return html;
}
