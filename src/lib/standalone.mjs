
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
import { industrySlugByName, additionalIndustryPages, industryPages } from '../data/industry-pages.mjs';
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
const headerPattern = /<header\b[^>]*class="[^"]*bde-header-builder-27-100[^"]*"[^>]*>[\s\S]*?<\/header>/i;
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
    /<li\b[^>]*class="breakdance-dropdown-item[^"]*"[^>]*>\s*<a\b[^>]*href="\/pricing\/"[^>]*>[\s\S]*?<\/a>\s*<\/li>/gi, ''));
  const pricingEntry = '<li class="breakdance-dropdown-item prunus-pricing-dropdown-item">' +
    '<a class="breakdance-link breakdance-dropdown-link" href="/pricing/" target="_self" data-type="url">' +
    '<span class="breakdance-dropdown-link__label"><span class="breakdance-dropdown-link__text">Pricing</span></span></a></li>';
  for (const number of ['148', '149', '153', '152']) {
    const pattern = new RegExp('(<li class="bde-menu-dropdown-27-' + number +
      '\\b[\\s\\S]*?<ul class="breakdance-dropdown-links">)', 'i');
    if (!pattern.test(html)) throw new Error('Missing menu dropdown '+number+' on '+filename);
    html = html.replace(pattern, match => match + pricingEntry);
  }
  const pricingMenuCount = (html.match(/class="breakdance-dropdown-item prunus-pricing-dropdown-item"/g)||[]).length;
  if (pricingMenuCount !== 4) throw new Error('Expected four pricing dropdown links, found '+pricingMenuCount+' on '+filename);



  // All published industry pages belong in the shared Our Work menu.
  // The index export is the source header for legacy and editorial routes,
  // so this single transformation keeps the entire site consistent.
  const industryGroups = [
    { name: 'Professional & Financial', slug: 'professional', legacy: [
      ['accountants', 'Accountants'], ['private-clinics', 'Private Clinics'],
      ['physiotherapists', 'Physiotherapists']
    ] },
    { name: 'Property & Services', slug: 'property', legacy: [] },
    { name: 'Trades & Contractors', slug: 'contractors', legacy: [] },
    { name: 'Specialist Businesses', slug: 'overlooked', legacy: [] },
    { name: 'More Industries', slug: 'additional', legacy: [] }
  ];
  const menuLink = (slug, label) => '<li><a href="/industries/' +
    slug + '/">Websites for ' + label.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</a></li>';
  const groupedIndustryLinks = industryGroups.map(group => {
    const links = [
      ...group.legacy.map(([slug, label]) => ({ slug, label })),
      ...industryPages.filter(page => page.group === group.slug)
    ];
    if (!links.length) return '';
    return '<li class="pm-industry-menu-group"><span class="pm-industry-menu-heading">' +
      group.name + '</span><ul>' +
      links.map(page => menuLink(page.slug, page.label)).join('') +
      '</ul></li>';
  }).join('');
  const menuStart = '<li class="bde-menu-dropdown-27-153';
  html = html.replace(headerPattern, header => {
    if (!header.includes(menuStart)) throw new Error('Missing Our Work dropdown on ' + filename);
    const groupPattern = /(<li class="bde-menu-dropdown-27-153\b[\s\S]*?<ul class="breakdance-dropdown-links">)[\s\S]*?(<\/ul>)/i;
    if (!groupPattern.test(header)) throw new Error('Cannot find industry menu list on ' + filename);
    return header.replace(groupPattern, (_, start, end) =>
      start + pricingEntry + dropdownEntry('/our-work/', 'Our Work') +
      dropdownEntry('/industries/', 'All Industries') + groupedIndustryLinks + end);
  });
  const menuIndustryCount = (html.match(/<a href="\/industries\/[a-z-]+\/">Websites for /g) || []).length;
  if (menuIndustryCount !== 37) throw new Error('Expected 37 industry menu links; found ' + menuIndustryCount + ' on ' + filename);
  const industryMenuCss = `<style id="pm-industry-menu-styles">
  /* Keep the wide industry menu inside the viewport rather than expanding right
     from the Our Work trigger. Make all groups accessible by scrolling. */
  .bde-menu-dropdown-27-153{position:relative}
  .bde-menu-dropdown-27-153 .breakdance-dropdown-floater{
    left:auto!important;right:0!important;transform:none!important;
    width:min(820px,calc(100vw - 40px))!important;
    min-width:0!important;max-width:calc(100vw - 40px)!important;
    box-sizing:border-box
  }
  .bde-menu-dropdown-27-153 .breakdance-dropdown-body{
    width:100%!important;min-width:0!important;box-sizing:border-box;
    max-height:min(72vh,640px);overflow:auto!important;
    overscroll-behavior:contain
  }
  .bde-menu-dropdown-27-153 .breakdance-dropdown-section,
  .bde-menu-dropdown-27-153 .breakdance-dropdown-columns,
  .bde-menu-dropdown-27-153 .breakdance-dropdown-column{
    width:100%!important;min-width:0!important;max-width:100%!important;
    box-sizing:border-box
  }
  .bde-menu-dropdown-27-153 .breakdance-dropdown-links{
    display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));
    gap:18px 18px!important;margin:0!important;padding:16px!important;
    width:100%!important;max-width:100%!important;box-sizing:border-box
  }
  .bde-menu-dropdown-27-153 .breakdance-dropdown-links>li:nth-child(-n+3){
    grid-row:1!important;min-width:0!important;margin:0!important;
    padding:0!important;list-style:none
  }
  .bde-menu-dropdown-27-153 .breakdance-dropdown-links>li:nth-child(1){grid-column:1}
  .bde-menu-dropdown-27-153 .breakdance-dropdown-links>li:nth-child(2){grid-column:2}
  .bde-menu-dropdown-27-153 .breakdance-dropdown-links>li:nth-child(3){grid-column:3}
  .bde-menu-dropdown-27-153 .breakdance-dropdown-links>li:nth-child(-n+3) a{
    display:block!important;min-width:0!important;width:100%!important;
    background:#414141!important;border:1px solid #626262!important;
    border-radius:5px!important;padding:10px 12px!important;
    color:#f8e8c3!important;font:600 13px/1.35 "Space Grotesk",Arial,sans-serif!important;
    text-decoration:none!important;text-align:center;box-sizing:border-box
  }
  .bde-menu-dropdown-27-153 .breakdance-dropdown-links>li:nth-child(-n+3) a:hover,
  .bde-menu-dropdown-27-153 .breakdance-dropdown-links>li:nth-child(-n+3) a:focus-visible{
    background:#555!important;outline:2px solid #e8c778;outline-offset:1px
  }
  .bde-menu-dropdown-27-153 .breakdance-dropdown-links>.pm-industry-menu-group{
    display:block!important;min-width:0!important;max-width:100%;
    padding:0!important;margin:0!important;list-style:none
  }
  .pm-industry-menu-heading{display:block;color:#e8c778;
    font:700 12px/1.45 "Space Grotesk",Arial,sans-serif;
    letter-spacing:.035em;margin:0 0 8px}
  .pm-industry-menu-group ul{list-style:none;margin:0;padding:0}
  .pm-industry-menu-group li{list-style:none;margin:0}
  .pm-industry-menu-group a{
    display:block;padding:6px 2px!important;color:#f7f2ec!important;
    text-decoration:none;font:500 12.5px/1.4 "Space Grotesk",Arial,sans-serif;
    white-space:normal!important;overflow-wrap:anywhere
  }
  .pm-industry-menu-group a:hover,.pm-industry-menu-group a:focus-visible{
    color:#e8c778!important;text-decoration:underline
  }
  @media(max-width:780px){
    .bde-menu-dropdown-27-153 .breakdance-dropdown-floater{
      right:0!important;width:min(600px,calc(100vw - 24px))!important;
      max-width:calc(100vw - 24px)!important
    }
    .bde-menu-dropdown-27-153 .breakdance-dropdown-links{
      grid-template-columns:repeat(2,minmax(0,1fr));gap:16px!important
    }
    .bde-menu-dropdown-27-153 .breakdance-dropdown-links>li:nth-child(-n+3){
      grid-row:auto!important;grid-column:auto!important
    }
  }
  @media(max-width:560px){
    .bde-menu-dropdown-27-153 .breakdance-dropdown-floater{
      left:0!important;right:auto!important;width:calc(100vw - 24px)!important;
      max-width:calc(100vw - 24px)!important
    }
    .bde-menu-dropdown-27-153 .breakdance-dropdown-body{max-height:65dvh}
    .bde-menu-dropdown-27-153 .breakdance-dropdown-links{
      display:block!important;padding:12px!important
    }
    .bde-menu-dropdown-27-153 .breakdance-dropdown-links>li:nth-child(-n+3){
      display:block!important;margin-bottom:8px!important
    }
    .bde-menu-dropdown-27-153 .breakdance-dropdown-links>.pm-industry-menu-group{
      margin:20px 0!important
    }
    .pm-industry-menu-group a{padding:10px 3px!important;font-size:14px}
  }
  </style>`;
  html = html.replace('</head>', industryMenuCss + '</head>');

  // Show the newly built accountant demo on the existing Accountant landing page.
  // It is a design demo, not a claim of client ownership.
  if (filename === 'industries/accountants/index.html') {
    const accountancyDemo = `<section class="pm-accountancy-demo" aria-labelledby="pm-accountancy-demo-title">
      <div class="pm-accountancy-demo__inner">
        <div class="pm-accountancy-demo__copy">
          <p class="pm-accountancy-demo__eyebrow">Accountancy website design / Demo project</p>
          <h2 id="pm-accountancy-demo-title">See an accountancy website in action.</h2>
          <p>Easy Cloud Accounting is a website demo showing how clear services, considered typography and straightforward enquiries can work together for an accountancy firm.</p>
          <p class="pm-accountancy-demo__note">An illustrative website concept, not a commissioned client website.</p>
          <a class="pm-accountancy-demo__button" href="https://easycloudaccounting.pages.dev/" target="_blank" rel="noopener noreferrer">Explore the Easy Cloud Accounting demo <span aria-hidden="true">↗</span></a>
        </div>
        <a class="pm-accountancy-demo__preview" href="https://easycloudaccounting.pages.dev/" target="_blank" rel="noopener noreferrer" aria-label="Open Easy Cloud Accounting website demo in a new tab">
          <span class="pm-accountancy-demo__browser"><span aria-hidden="true">● ● ●</span><span>easycloudaccounting.pages.dev</span></span>
          <span class="pm-accountancy-demo__previewbody">
            <span class="pm-accountancy-demo__monogram">EC</span>
            <span class="pm-accountancy-demo__preview-eyebrow">Website concept</span>
            <strong>Easy Cloud<br>Accounting</strong>
            <span class="pm-accountancy-demo__preview-line"></span>
            <span class="pm-accountancy-demo__preview-footer">View the complete example website ↗</span>
          </span>
        </a>
      </div>
    </section>`;
    const accountancyDemoStyles = `<style id="pm-accountancy-demo-styles">
      .pm-accountancy-demo{padding:70px 22px;background:#f2f4f0;color:#233b37}
      .pm-accountancy-demo *{box-sizing:border-box}
      .pm-accountancy-demo__inner{width:min(1100px,100%);margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
      .pm-accountancy-demo__eyebrow,.pm-accountancy-demo__preview-eyebrow{font:600 12px/1.5 "Space Grotesk",Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#527166}
      .pm-accountancy-demo h2{font:500 clamp(29px,3.5vw,48px)/1.1 "Playfair Display",Georgia,serif;color:#243e38;margin:16px 0}
      .pm-accountancy-demo__copy p:not(.pm-accountancy-demo__eyebrow){font:400 18px/1.6 "Alegreya Sans",Arial,sans-serif;max-width:520px}
      .pm-accountancy-demo__note{font-size:15px!important;color:#587067}
      .pm-accountancy-demo__button{display:inline-block;margin-top:18px;padding:13px 20px;background:#243e38;color:#fff!important;text-decoration:none;border-radius:4px;font:600 14px/1.4 "Space Grotesk",Arial,sans-serif}
      .pm-accountancy-demo__button:hover{background:#42645a}
      .pm-accountancy-demo__preview{display:block;max-width:500px;width:100%;margin:0 auto;text-decoration:none!important;box-shadow:0 18px 42px #142e2526;border-radius:8px;overflow:hidden;background:#fff}
      .pm-accountancy-demo__browser{display:flex;gap:14px;align-items:center;padding:12px 16px;background:#e9ede8;color:#66736b;font:500 12px/1.2 Arial,sans-serif}
      .pm-accountancy-demo__browser span:first-child{color:#9fa9a0;white-space:nowrap}
      .pm-accountancy-demo__previewbody{display:flex;flex-direction:column;align-items:flex-start;min-height:335px;padding:36px 44px;background:linear-gradient(145deg,#f7f8f4,#e5ede7)}
      .pm-accountancy-demo__monogram{font:600 21px/1 Georgia,serif;color:#335b51;border:1px solid #89a99c;padding:13px;letter-spacing:-.08em;margin-bottom:30px}
      .pm-accountancy-demo__previewbody strong{font:500 clamp(28px,3vw,45px)/1.12 Georgia,serif;color:#243e38;margin:8px 0 26px}
      .pm-accountancy-demo__preview-line{height:1px;width:100%;background:#a9bdb3}
      .pm-accountancy-demo__preview-footer{margin-top:18px;font:600 13px/1.4 "Space Grotesk",Arial,sans-serif;color:#335b51}
      @media(max-width:750px){.pm-accountancy-demo{padding:45px 17px}.pm-accountancy-demo__inner{grid-template-columns:1fr;gap:28px}.pm-accountancy-demo__previewbody{min-height:300px}}
    </style>`;
    html = html.replace('</head>', accountancyDemoStyles + '</head>');
    if (!html.includes('</body>')) throw new Error('Accountants document missing body');
    html = html.replace('</body>', accountancyDemo + '</body>');
  }

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
    const heroEnd = /(<section class="bde-section-35-253\b[\s\S]*?<\/section>)/i;
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


  // Industry expansion: preserve approved layouts while repairing the original
  // 25 industry cards, which were exported as inert <button> elements.
  // Every destination is an actual static route; URLs stay under /industries/.
  if (filename === 'industries/index.html') {
    const byName = new Map(Object.entries(industrySlugByName)
      .map(([name,slug]) => [name.toLowerCase(), slug]));
    let linked = 0;
    html = html.replace(/<button\s+type="button"\s+class="button-atom button-atom--(primary|secondary) bde-button__button">([\s\S]*?<span class="button-atom__text">\s*Websites for\s*([^<]*?)<\/span>[\s\S]*?)<\/button>/gi,
      (whole, variant, inner, rawName) => {
        const name = rawName.replace(/&amp;/gi,'&').replace(/\s*→\s*$/, '').trim();
        const slug = byName.get(name.toLowerCase());
        if (!slug) throw new Error('Industry hub needs a real page for ' + name);
        linked++;
        return '<a href="/industries/' + slug + '/" class="button-atom button-atom--' +
          variant + ' bde-button__button" aria-label="Websites for ' + name.replace(/&/g,'&amp;') + '">' +
          inner + '</a>';
      });
    if (linked !== 25) throw new Error('Expected 25 working industry hub links, created ' + linked);

    const esc = (text) => String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const cards = additionalIndustryPages.map(item =>
      '<a class="pm-more-industries__card" href="/industries/' + item.slug + '/" ' +
      'style="--extra-ink:' + item.colors.ink + ';--extra-bg:' + item.colors.bg + ';">' +
      '<span class="pm-more-industries__swatch" aria-hidden="true"></span>' +
      '<strong>' + esc(item.label) + '</strong><span>Explore website design <span aria-hidden="true">→</span></span>' +
      '</a>').join('');
    const extra = '<section class="pm-more-industries" aria-labelledby="pm-more-industries-title">' +
      '<div class="pm-more-industries__wrap"><p class="pm-more-industries__eyebrow">More industries, same attention to detail</p>' +
      '<h2 id="pm-more-industries-title">More businesses we can build for.</h2>' +
      '<p>From architectural practices to car detailing, each sector has its own design direction and a useful website plan. We only label work as client work when it really is.</p>' +
      '<div class="pm-more-industries__grid">' + cards + '</div></div></section>';
    const css = '<style id="pm-industry-expansion-style">' +
      '.pm-more-industries{background:#faf4ee;color:#2e2e2e;padding:72px 20px;font-family:Arial,sans-serif}' +
      '.pm-more-industries__wrap{max-width:1160px;margin:auto}.pm-more-industries h2{font-family:Georgia,serif;font-size:clamp(30px,4vw,48px);margin:8px 0 12px}' +
      '.pm-more-industries p{font-size:17px;line-height:1.6;max-width:720px}' +
      '.pm-more-industries__eyebrow{font-size:11px!important;letter-spacing:.17em;text-transform:uppercase;font-weight:700}' +
      '.pm-more-industries__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:33px}' +
      '.pm-more-industries__card{background:var(--extra-bg);color:var(--extra-ink);padding:23px;text-decoration:none;display:flex;flex-direction:column;gap:12px;min-height:145px;transition:transform .18s ease}' +
      '.pm-more-industries__card:hover{transform:translateY(-3px)}.pm-more-industries__card strong{font-size:20px}' +
      '.pm-more-industries__card>span:last-child{font-size:12px;font-weight:700}.pm-more-industries__swatch{width:45px;height:5px;background:var(--extra-ink)}' +
      '@media(max-width:800px){.pm-more-industries__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
      '@media(max-width:520px){.pm-more-industries__grid{grid-template-columns:1fr}.pm-more-industries{padding:42px 15px}}' +
      '</style>';
    html = html.replace('</head>', css + '</head>');
    html = html.replace('<footer class="pm-site-footer"', extra + '<footer class="pm-site-footer"');
  }

  // The homepage already advertises eight industries, but its titles were
  // plain text. Make them discoverable links without moving or restyling cards.
  if (filename === 'index.html') {
    const byName = new Map(Object.entries(industrySlugByName)
      .map(([name,slug]) => [name.toLowerCase(), slug]));
    let linked = 0;
    html = html.replace(/<h3 class="ee-imagebox-title bde-h3">([^<]+)<\/h3>/gi, (match,title) => {
      const slug = byName.get(title.trim().toLowerCase());
      if (!slug) return match;
      linked++;
      return '<h3 class="ee-imagebox-title bde-h3"><a class="pm-home-industry-link" href="/industries/' +
        slug + '/">' + title + '</a></h3>';
    });
    if (linked !== 8) throw new Error('Expected eight homepage industry links, found ' + linked);
    html = html.replace('</head>', '<style id="pm-home-industry-links-style">' +
      '.pm-home-industry-link{color:inherit!important;text-decoration:none!important}' +
      '.pm-home-industry-link:hover,.pm-home-industry-link:focus-visible{text-decoration:underline!important;text-underline-offset:4px}' +
      '</style></head>');
  }

  // Publish precise portfolio associations on the three legacy industry pages.
  // Charley Hayes is wellness design, NOT a verified physiotherapy/clinic client.
  const legacyIndustryExamples = {
    'industries/accountants/index.html': [
      'A tailored accountancy example is not yet in our published portfolio. In the meantime, explore our verified work rather than an invented client.',
      '/our-work/', 'Explore our portfolio'
    ],
    'industries/physiotherapists/index.html': [
      'Related wellness website design: Charley Hayes SMR. This is archived design work, not a claim that the business was a physiotherapy clinic.',
      '/our-work/charley-hayes-smr/', 'View Charley Hayes project'
    ],
    'industries/private-clinics/index.html': [
      'Related practitioner-led wellness design: Charley Hayes SMR. This is archived work, not a completed private-clinic client case study.',
      '/our-work/charley-hayes-smr/', 'View related work'
    ]
  };
  if (legacyIndustryExamples[filename]) {
    const [copy,url,label] = legacyIndustryExamples[filename];
    const note = '<section class="pm-legacy-industry-example" aria-label="Relevant example work">' +
      '<div><p>EXAMPLE WEBSITES / PORTFOLIO</p><h2>Explore a related project.</h2>' +
      '<p>' + copy + '</p><a href="' + url + '">' + label + ' <span aria-hidden="true">→</span></a></div></section>';
    const css = '<style id="pm-legacy-industry-example-css">' +
      '.pm-legacy-industry-example{background:#faf4ee;color:#2e2e2e;padding:62px 20px}' +
      '.pm-legacy-industry-example>div{max-width:1040px;margin:auto}' +
      '.pm-legacy-industry-example h2{font:500 clamp(28px,4vw,44px)/1.2 Georgia,serif;margin:15px 0}' +
      '.pm-legacy-industry-example p{font:400 18px/1.6 Arial,sans-serif;max-width:730px}' +
      '.pm-legacy-industry-example p:first-child{font-size:11px;letter-spacing:.15em;font-weight:700}' +
      '.pm-legacy-industry-example a{color:#264a40;font-weight:700;text-underline-offset:4px}' +
      '</style>';
    html=html.replace('</head>',css+'</head>');
    html=html.replace('<footer class="pm-site-footer"',note+'<footer class="pm-site-footer"');
  }

  // Clearer navigation label; all existing URLs, menu structure and styles stay.
  html = html.replace(headerPattern, header => header.replace(
    /(<span class="breakdance-dropdown-link__text">\s*)Industries(\s*<\/span>)/gi,
    '$1Websites by Industry$2'));

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

  // A small utility sign-in at the very top right, outside the menu layout.
  // The shared header feeds every legacy and native editorial page, so this is
  // the one source of truth for Prunus sign-in. UK Trades already points here.
  const clientSignIn = '<a class="pm-client-signin" href="/client-login/" aria-label="Sign in to your website client workspace">Sign in</a>';
  html = html.replace(headerPattern, header => header.replace('</header>', clientSignIn + '</header>'));
  const clientSignInStyle = '<style id="pm-client-signin-style">' +
    '.pm-client-signin{position:fixed;right:12px;top:7px;z-index:2147480000;' +
    'display:inline-flex;align-items:center;justify-content:center;' +
    'min-height:29px;padding:4px 12px;border:1px solid #d5dfdb;border-radius:20px;' +
    'background:#fffffff2;color:#273f43;text-decoration:none;' +
    'font:700 12px/1.3 Arial,Helvetica,sans-serif;box-shadow:0 2px 8px #10242510}' +
    '.pm-client-signin:hover{background:#f0f5f3;border-color:#8ca8a2}' +
    '.pm-client-signin:focus-visible{outline:3px solid #2c7489;outline-offset:2px}' +
    '@media(max-width:980px){.pm-client-signin{right:68px;top:7px;font-size:11px;min-height:27px}}' +
    '</style>';
  html = html.replace('</head>', clientSignInStyle + '</head>');
  return html;
}
