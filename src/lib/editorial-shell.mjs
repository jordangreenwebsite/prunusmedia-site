/**
 * New editorial pages reuse the exact current header/footer DOM and styles.
 * Legacy pages themselves are never altered by this module.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const original = readFileSync(path.join(root, 'index.html'), 'utf8');
const headerEnd = original.indexOf('</header>');
const footerStart = original.indexOf('<section class="bde-section-26-100');
if (headerEnd === -1 || footerStart === -1 || footerStart < headerEnd) {
  throw new Error('Cannot locate the current Prunus header/footer. Inspect export before updating layout.');
}
const prefix = original.slice(0, headerEnd + '</header>'.length);
const suffix = original.slice(footerStart);

const editorialCss = String.raw`
<style id="pm-editorial-styles">
.pm-editorial{background:#FAF4EE;color:#2E2E2E;min-height:65vh;padding:160px 20px 100px}
.pm-editorial *{box-sizing:border-box}
.pm-editorial__wrap{width:min(100%,1120px);margin:0 auto}
.pm-editorial__eyebrow{font-family:"Space Grotesk",sans-serif;text-transform:uppercase;letter-spacing:.17em;font-size:13px;color:#738B79;font-weight:600}
.pm-editorial h1,.pm-editorial h2,.pm-editorial h3{font-family:"Playfair Display",Georgia,serif;color:#2E2E2E;line-height:1.16}
.pm-editorial h1{font-size:clamp(2.5rem,5vw,4.7rem);max-width:850px;margin:18px 0 22px}
.pm-editorial h2{font-size:clamp(1.65rem,3vw,2.5rem);margin:38px 0 15px}
.pm-editorial h3{font-size:clamp(1.25rem,2vw,1.6rem);margin:0 0 10px}
.pm-editorial p,.pm-editorial li{font:400 18px/1.7 "Alegreya Sans",Arial,sans-serif}
.pm-editorial__intro{max-width:760px;font-size:22px!important;color:#4b514d}
.pm-editorial__meta{font:500 14px/1.5 "Space Grotesk",sans-serif!important;color:#66746b;margin:0 0 25px}
.pm-editorial__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:23px;margin-top:42px}
.pm-editorial__card{border:1px solid #d5d9d1;border-radius:8px;background:#fffdf9;overflow:hidden;box-shadow:0 6px 26px #2e2e2e0b;display:flex;flex-direction:column}
.pm-editorial__card img{width:100%;height:205px;object-fit:cover;display:block}
.pm-editorial__card-image-empty{height:205px;background:linear-gradient(135deg,#F8DCDC,#94A998)}
.pm-editorial__card-inner{padding:25px;display:flex;flex:1;flex-direction:column}
.pm-editorial__card-inner p{font-size:16px;line-height:1.55;margin:3px 0 18px}
.pm-editorial__card-inner a{margin-top:auto}
.pm-editorial a{color:#2E2E2E;text-underline-offset:3px}
.pm-editorial a:hover{color:#58735c}
.pm-editorial__button{display:inline-block;border-radius:3px;background:#2E2E2E;color:#fff!important;text-decoration:none;padding:13px 23px;font:500 15px/1.3 "Space Grotesk",sans-serif}
.pm-editorial__button:hover{background:#56715c}
.pm-editorial__article{max-width:760px;margin:45px auto 0}
.pm-editorial__article p,.pm-editorial__article li{font-size:19px}
.pm-editorial__article ul,.pm-editorial__article ol{padding-left:26px}
.pm-editorial__article img{max-width:100%;height:auto;border-radius:5px}
.pm-editorial__article blockquote{margin:35px 0;padding:10px 22px;border-left:4px solid #94A998;background:#fffaf4}
.pm-editorial__article code{overflow-wrap:anywhere}
.pm-editorial__nav{margin:45px 0 0;display:flex;gap:20px;flex-wrap:wrap}
.pm-editorial__empty{margin-top:40px;border:1px solid #d5d9d1;padding:24px;background:#fffdf9}
@media(max-width:950px){.pm-editorial__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:650px){.pm-editorial{padding:120px 17px 70px}.pm-editorial__grid{grid-template-columns:1fr}.pm-editorial__card img,.pm-editorial__card-image-empty{height:220px}.pm-editorial__intro{font-size:19px!important}}
</style>
`;

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function jsonSafe(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
function replaceTag(html, regex, replacement) {
  if (!regex.test(html)) return html;
  return html.replace(regex, replacement);
}

export function getEditorialShell({ title, description, pathname, type = 'WebPage', image, date }) {
  const canonical = 'https://prunusmedia.com' + pathname;
  const safeTitle = esc(title + ' | Prunus Media');
  const safeDescription = esc(description);
  const safeCanonical = esc(canonical);
  let opening = prefix;
  opening = replaceTag(opening, /<title>[\s\S]*?<\/title>/i, '<title>' + safeTitle + '</title>');
  opening = replaceTag(opening, /<meta name="description" content="[^"]*">/i,
    '<meta name="description" content="' + safeDescription + '">');
  opening = replaceTag(opening, /<link rel="canonical" href="[^"]*">/i,
    '<link rel="canonical" href="' + safeCanonical + '">');
  opening = replaceTag(opening, /<meta property="og:title" content="[^"]*">/i,
    '<meta property="og:title" content="' + safeTitle + '">');
  opening = replaceTag(opening, /<meta property="og:description" content="[^"]*">/i,
    '<meta property="og:description" content="' + safeDescription + '">');
  opening = replaceTag(opening, /<meta property="og:url" content="[^"]*">/i,
    '<meta property="og:url" content="' + safeCanonical + '">');
  opening = replaceTag(opening, /<meta name="twitter:title" content="[^"]*">/i,
    '<meta name="twitter:title" content="' + safeTitle + '">');
  opening = replaceTag(opening, /<meta name="twitter:description" content="[^"]*">/i,
    '<meta name="twitter:description" content="' + safeDescription + '">');
  if (image) {
    opening = replaceTag(opening, /<meta property="og:image" content="[^"]*">/i,
      '<meta property="og:image" content="' + esc(new URL(image, canonical).href) + '">');
    opening = replaceTag(opening, /<meta name="twitter:image" content="[^"]*">/i,
      '<meta name="twitter:image" content="' + esc(new URL(image, canonical).href) + '">');
  }
  const schema = { '@context': 'https://schema.org', '@type': type,
    headline: title, name: title, description, url: canonical,
    publisher: { '@type': 'Organization', name: 'Prunus Media', url: 'https://prunusmedia.com' } };
  if (date) schema.datePublished = date;
  if (image) schema.image = new URL(image, canonical).href;
  opening = replaceTag(opening, /<script type="application\/ld\+json" class="rank-math-schema">[\s\S]*?<\/script>/i,
    '<script type="application/ld+json">' + jsonSafe(schema) + '</script>');
  opening = opening.replace('</head>', editorialCss + '\n</head>');

  // Existing global header/footer scripts are left intact; homepage-only
  // interactions are stripped on new editorial pages to avoid missing targets.
  const closing = suffix.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) => {
    return /new Breakdance(?:DualHeading|AnimatedHeading|ImageComparison|Tabs|Entrance|Faq|Sticky)\s*\(/.test(script)
      ? '' : script;
  });
  return { opening, closing };
}
