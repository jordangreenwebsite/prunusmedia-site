
/**
 * Standalone export adapter: serves all existing page designs without loading
 * WordPress/Breakdance front-end CSS/JS from their original URLs.
 *
 * This is a transitional visual-compatibility adapter. CSS rules are sourced
 * from the committed design export. They still need human-authored component
 * replacement before the project can be called fully dependency-free source.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { footerMarkup } from './footer.mjs';
import { improveLegacySeo } from './seo-enhancements.mjs';
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
// The approved homepage header is our single source of truth for navigation.
// Original Breakdance exports have different header versions: some accidentally
// include a second Industries column inside Website Design. Using one shared
// header also restores the logo and keeps the four top-level dropdowns aligned.
const headerPattern = /<header\\b[^>]*class="[^"]*bde-header-builder-27-100[^"]*"[^>]*>[\\s\\S]*?<\\/header>/i;
const originalHome = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
const sourceHeader = originalHome.match(headerPattern)?.[0];
if (!sourceHeader) throw new Error('Approved Prunus homepage header not found');

export function cleanPageHtml(originalHtml, filename) {
  let html = originalHtml;
  if (!headerPattern.test(html)) {
    throw new Error('Expected shared website header on '+filename);
  }
  if (filename !== 'index.html') {
    html = html.replace(headerPattern, sourceHeader);
    // The homepage is the markup source, not the active navigation item on
    // every inner page. Retain submenu behaviour and avoid a false active tab.
    html = html.replace(headerPattern, match => match.replace(
      /\\sbreakdance-menu-item--active|\\sbreakdance-dropdown-item--active/g, ''));
  }
  const styles = extractCssPaths(originalHtml);

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
  // Point the established header navigation and every legacy internal link to
  // one canonical, native Astro pricing page (the former URL redirects).
  html = html.replaceAll('/website-design/packages/', '/pricing/');
  html = html.replace(/(<span class="breakdance-dropdown-link__text">)\s*Packages(?=\s*<\/span>)/gi,'$1Pricing');

  // The live Astro site does not need WordPress's exported editor metadata,
  // emoji/plugin styles, or its obsolete XML-RPC/RSD discovery links.
  html = html.replace(/<style\b[^>]*id=["'](?:wp-img-auto-sizes-contain-inline-css|wp-emoji-styles-inline-css|wp-block-library-inline-css|classic-theme-styles-inline-css)["'][^>]*>[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<link\b[^>]*rel=["'](?:EditURI|shortlink)["'][^>]*>/gi, '');
  html = html.replace(/<meta\b[^>]*name=["'](?:ssp-config-version|ssp-origin-url)["'][^>]*>/gi, '');

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

  // Remove the original buried packages item from the Website Design list.
  // Pricing is now a distinct, high-contrast first item in EACH of the four
  // existing dropdowns. No fifth top-level item crowds the logo or mobile nav.
  html = html.replace(headerPattern, header => header.replace(
    /<li\\b[^>]*class="breakdance-dropdown-item[^"]*"[^>]*>\\s*<a\\b[^>]*href="\\/pricing\\/"[^>]*>[\\s\\S]*?<\\/a>\\s*<\\/li>/gi, ''));
  const pricingEntry = '<li class="breakdance-dropdown-item prunus-pricing-dropdown-item">' +
    '<a class="breakdance-link breakdance-dropdown-link" href="/pricing/" target="_self" data-type="url">' +
    '<span class="breakdance-dropdown-link__label"><span class="breakdance-dropdown-link__text">Pricing</span></span></a></li>';
  for (const number of ['148', '149', '153', '152']) {
    const pattern = new RegExp('(<li class="bde-menu-dropdown-27-' + number +
      '\\\\b[\\\\s\\\\S]*?<ul class="breakdance-dropdown-links">)', 'i');
    if (!pattern.test(html)) throw new Error('Missing menu dropdown '+number+' on '+filename);
    html = html.replace(pattern, match => match + pricingEntry);
  }
  const pricingMenuCount = (html.match(/class="breakdance-dropdown-item prunus-pricing-dropdown-item"/g)||[]).length;
  if (pricingMenuCount !== 4) throw new Error('Expected four pricing dropdown links, found '+pricingMenuCount+' on '+filename);


  // Replace the original exported footer on every existing route with a
  // semantic, consistent footer shared with Blog and Our Work. Never remove
  // adjacent scripts or content.
  const oldFooter = /<section class="bde-section-26-100\b[\s\S]*?<\/section>/i;
  if (oldFooter.test(html)) html = html.replace(oldFooter, footerMarkup);
  else if (html.includes('</body>')) html = html.replace('</body>', footerMarkup + '\n</body>');

  // The homepage gallery is generated from exactly the same Markdown
  // collection as /our-work/, not the unmaintainable builder tabs.
  if (filename === 'index.html') {
    const oldGallery = /<!--PRUNUS_LEGACY_HOME_WORK_SLOT-->|<section class="bde-section-35-477\b[\s\S]*?<\/section>/i;
    if (!oldGallery.test(html)) throw new Error('Homepage Recent Work slot not found');
    html = html.replace(oldGallery,
      '<section class="pm-home-work" id="recent-work" aria-labelledby="recent-work-title">' +
      '<div class="pm-home-work__inner"><div class="pm-home-work__top"><div>' +
      '<p class="pm-work-eyebrow">Selected projects / Our work</p>' +
      '<h2 id="recent-work-title">Some of our recent work.</h2>' +
      '<p class="pm-home-work__intro">Thoughtful websites for real businesses, and a few concepts exploring what is possible.</p>' +
      '</div></div><!--PRUNUS_RECENT_WORK_CARDS-->' +
      '<a class="pm-home-work__more" href="/our-work/">See more of our recent work <span aria-hidden="true">→</span></a>' +
      '</div></section>');
    // A compact price preview sits directly below the original hero so people
    // need not hunt for commercial terms in the dropdowns.
    const pricingTeaser =
      '<aside class="pm-home-pricing" aria-label="Website and SEO pricing">' +
      '<div class="pm-home-pricing__inner"><div>' +
      '<p class="pm-home-pricing__eyebrow">Clear prices · Built for growth</p>' +
      '<p class="pm-home-pricing__headline">Your next website starts here.</p>' +
      '<p class="pm-home-pricing__detail">Websites from £995 · One hosting rate of £99/month · SEO £195/month with hosting included</p>' +
      '</div><a href="/pricing/">Explore our pricing <span aria-hidden="true">→</span></a></div></aside>';
    const heroEnd = /(<section class="bde-section-35-253\\b[\\s\\S]*?<\\/section>)/i;
    if (!heroEnd.test(html)) throw new Error('Cannot locate approved homepage hero for pricing link');
    html = html.replace(heroEnd, match => match + pricingTeaser);
    // The original hero button had a label saying See Our Work, but linked
    // to Industries. Direct it to the actual portfolio.
    html = html.replace(/(class="bde-button-35-359\b[\s\S]*?<a\b[^>]*\bhref=")\/industries\//i,
      '$1/our-work/');
  }

  // Real keyboard skip link and target; the original export had neither.
  if (/<body\b/i.test(html) && !/class=["'][^"']*pm-skip-link/.test(html)) {
    html = html.replace(/<body\b([^>]*)>/i, (match,attrs) =>
      '<body' + attrs + (/\bid=["']/.test(attrs) ? '' : ' id="top"') + '>' +
      '<a class="pm-skip-link" href="#main-content">Skip to main content</a>');
  }
  if (!/\bid=["']main-content["']/.test(html)) {
    html = html.replace(/(<\/header>[\s\S]*?<section\b)([^>]*>)/i,
      (match,begin,end) => begin + (/\bid=/.test(end) ? end.replace(/\bid=["'][^"']+["']/, 'id="main-content"') : ' id="main-content"' + end));
  }


  const currentOffers = {
    'website-design/index.html': {
      eyebrow:'Website design pricing',
      heading:'Build it properly. Keep it growing.',
      copy:'Prunus builds from £995 one-off. Every website has the same £99/month hosting option. With our £195/month ongoing SEO service, hosting is included while SEO is active.'
    },
    'seo-agency-uk/index.html': {
      eyebrow:'Ongoing SEO & growth',
      heading:'Real, ongoing SEO. £195/month.',
      copy:'Five keywords tracked, up to five priority pages optimised a month, a researched weekly blog, eligible Google Business Profile support and monthly reporting. Your website hosting is included while SEO is active. Three-month minimum.'
    },
    'social-media-marketing-uk/index.html': {
      eyebrow:'Flexible marketing services',
      heading:'Social media support from £99/month.',
      copy:'We quote the work your business actually needs, rather than forcing you into tiers. Meta and Google Ads management start from £50/month, with advertising spend paid separately.'
    }
  };
  const offer=currentOffers[filename];
  if(offer){
    const htmlPromo='<section class="pm-growth-promo" aria-labelledby="pm-growth-heading">'+
      '<div class="pm-growth-promo__inner"><div><p>'+offer.eyebrow+'</p>'+
      '<h2 id="pm-growth-heading">'+offer.heading+'</h2>'+
      '<div class="pm-growth-promo__body">'+offer.copy+'</div></div>'+
      '<a href="/pricing/">View clear pricing <span aria-hidden="true">→</span></a></div></section>';
    // Insert immediately before the semantic footer; do not change the
    // existing page sections or interfere with the contact form.
    html=html.replace('<footer class="pm-site-footer"', htmlPromo+'<footer class="pm-site-footer"');
  }
  if(filename==='contact/index.html' && !html.includes('pricing-contact.js')){
    html=html.replace('</body>', '<script defer src="/assets/prunus-scripts/pricing-contact.js"></script>\n</body>');
  }

  // Search semantics, non-fabricated structured data, and image accessibility.
  html = improveLegacySeo(html, filename);

  // The header logo should never be deferred behind other lazy images.
  html = html.replace(/(<header\b[\s\S]*?<img\b[^>]*class="breakdance-image-object"[^>]*?)loading="lazy"/i,
    '$1loading="eager" fetchpriority="high"');


  // Preserve existing DOM layout while independent interactions replace the
  // exported builder's runtime.

  const scripts = '<script defer src="/assets/prunus-scripts/prunus-interactions.js"></script>' +
    '<script defer src="/assets/prunus-scripts/prunus-cursor.js"></script>';
  if (html.includes('</body>')) html = html.replace('</body>', scripts + '\n</body>');
  // In critical inline CSS the keyboard-only link is visually clipped by
  // default. This prevents a permanently visible link if Cloudflare/browser
  // caches an older shared stylesheet or the external CSS arrives late.
  // Clipping instead of display:none retains keyboard focusability.
  const skipLinkCriticalCss = '<style id="pm-skip-link-critical">' +
    '.pm-skip-link:not(:focus):not(:focus-visible){' +
    'position:absolute!important;top:0!important;left:0!important;' +
    'width:1px!important;height:1px!important;padding:0!important;' +
    'margin:-1px!important;border:0!important;overflow:hidden!important;' +
    'white-space:nowrap!important;clip:rect(0,0,0,0)!important;' +
    'clip-path:inset(50%)!important;transform:none!important;}' +
    '.pm-skip-link:focus,.pm-skip-link:focus-visible{' +
    'display:inline-block!important;position:fixed!important;top:12px!important;' +
    'left:12px!important;z-index:2147483000!important;width:auto!important;' +
    'height:auto!important;padding:11px 18px!important;margin:0!important;' +
    'overflow:visible!important;clip:auto!important;clip-path:none!important;' +
    'white-space:normal!important;transform:none!important;' +
    'background:#2e2e2e!important;color:#fff!important;' +
    'border:2px solid #fff!important;outline:3px solid #eccd82!important;}' +
    '</style>';
  if (html.includes('</head>')) html = html.replace('</head>', skipLinkCriticalCss + '\n</head>');
  if (html.includes('</head>')) html = html.replace('</head>',
    '<link rel="stylesheet" href="/assets/prunus-styles/components.css?v=skip-link-critical-20261109">\n' +
    '<link rel="stylesheet" href="/assets/prunus-styles/portfolio.css">\n' +
    '<link rel="stylesheet" href="/assets/prunus-styles/footer.css">\n</head>');
  return html;
}
