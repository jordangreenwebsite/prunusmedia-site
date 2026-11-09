
/** Regression tests for the 2026-11-09 Prunus website SEO audit fixes. */
import { readFileSync } from 'node:fs';
import { getLegacyDocument, getLegacyRoutes } from '../src/lib/exported-pages.mjs';
import { improveImages } from '../src/lib/seo-enhancements.mjs';

function assert(check,message){if(!check)throw new Error('SEO regression: '+message);}
function tags(html,pattern){return [...html.matchAll(pattern)].map(match=>match[0]);}
const homepage=readFileSync('dist/index.html','utf8');
const contact=readFileSync('dist/contact/index.html','utf8');
const content=readFileSync('dist/website-design/content-creation/index.html','utf8');
const brand=readFileSync('dist/website-design/brand-identity/index.html','utf8');

const homeH1=tags(homepage,/<h1\b[^>]*>[\s\S]*?<\/h1>/gi);
assert(homeH1.length===1,'Homepage must contain exactly one H1, got '+homeH1.length);
assert(/Websites built/.test(homeH1[0]) && /best source of new business/.test(homeH1[0]),
  'The existing approved homepage wording and animation nodes must remain in H1');
assert(tags(contact,/<h1\b/gi).length===1,'Contact page must have one H1, not two');

function description(html){return (html.match(/<meta name="description" content="([^"]+)"/i)||[])[1];}
assert(description(content)!==description(brand),'Content creation and brand identity share a meta description');
assert(/content creation/i.test(description(content)||''),'Content creation meta description is inaccurate');

const ld=(homepage.match(/<script type="application\/ld\+json" class="rank-math-schema">([\s\S]*?)<\/script>/i)||[])[1];
assert(!!ld,'Homepage rank math schema missing');
const nodes=JSON.parse(ld)['@graph'];
const org=nodes.find(x=>x['@type']==='Organization');
assert(!!org,'Org entity missing from retained SEO graph');
assert(org.url==='https://prunusmedia.com/','Org canonical URL wrong');
assert(org.contactPoint?.email==='contactprunusmedia@gmail.com','Published support contact missing');
assert(org.areaServed?.name==='United Kingdom','Genuine service area missing');
assert(Array.isArray(org.sameAs)&&org.sameAs.length===2,'Official social profile links missing');
assert(!('telephone' in org),'No verified phone; do not invent one');
assert(!('address' in org),'No published physical address; do not invent one');
const website=nodes.find(x=>x['@type']==='WebSite');
assert(!website?.potentialAction,'The dead legacy WordPress search action must not remain');

let images=0,unlabelled=0,documentCount=0,knownMeaningful=0;
for(const filename of ['index.html','404.html',...getLegacyRoutes().map(x=>x.filename)]){
  const html=getLegacyDocument(filename);
  const img=tags(html,/<img\b[^>]*>/gi);
  images+=img.length;documentCount++;
  const wrong=img.filter(tag=>!/\balt\s*=\s*["'][^"']*["']/i.test(tag));
  unlabelled+=wrong.length;
  assert(!wrong.length,filename+' contains '+wrong.length+' images without alt attributes');
}
assert(images>450,'Unexpectedly few original images covered: '+images);
assert(unlabelled===0,'Alt attribute regression across exported pages');

const headerImage=homepage.match(/<header\b[\s\S]*?<img\b[^>]*>/i)?.[0]||'';
assert(/Copy-of-PRUNUS-MEDIA-300x300\.png/.test(headerImage),'Header logo not switched to lighter asset');
assert(/sizes="\(max-width: 670px\) 90px, 110px"/.test(headerImage),'Header logo responsive sizes missing');
assert(!/\/client-login\/ https:\/\/portal/.test(readFileSync('dist/_redirects','utf8')),
  'Client portal is not deployed; do not add a live redirect');
assert(/src="\/wp-content\/uploads\/2026\/09\/Hero-image.png"/.test(homepage),
  'Homepage illustrative hero must retain the original artwork asset for visual fidelity');
const heroTag=(homepage.match(/<img\b[^>]*Hero-image\.png[^>]*>/i)||[])[0]||'';
assert(/loading="eager"/.test(heroTag)&&/fetchpriority="high"/.test(heroTag),
  'Homepage hero artwork should load with priority');
assert(/width="\d+"/.test(heroTag)&&/height="\d+"/.test(heroTag),
  'Homepage hero artwork must reserve its intrinsic aspect ratio');
assert(/srcset=/.test(homepage),'Responsive srcset must be retained');
const seoCss=readFileSync('dist/assets/prunus-styles/components.css','utf8');
assert(seoCss.includes('aspect-ratio:2000/1414'),'Reserved hero aspect ratio missing');
assert(!seoCss.includes('Prunus-main-hero-768x432.png'),
  'Keep the original approved full-resolution hero background to protect design fidelity');

console.log('SEO CHECK PASSED: '+documentCount+' exported pages, '+images+
  ' images with alt, correct homepage H1, unique meta, honest schema and responsive image resources');
