/**
 * Test the actual generated pages, not just the legacy source documents.
 * Fail when a future export reintroduces missing headings, unlabeled images
 * or duplicate metadata into the public SEO pages.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const root=path.join(process.cwd(),'dist');
const pages=[];
function visit(dir,parts=[]){
 for(const file of readdirSync(dir,{withFileTypes:true})){
  if(['wp-content','wp-includes','_astro','assets'].includes(file.name))continue;
  const full=path.join(dir,file.name);
  if(file.isDirectory())visit(full,[...parts,file.name]);
  else if(file.name==='index.html'||(file.name==='404.html'&&!parts.length)){
   pages.push({name:file.name==='404.html'?'/404.html':'/'+parts.join('/')+'/',source:readFileSync(full,'utf8')});
  }
 }
}
visit(root);
let failures=[];
const descriptions=new Map();
// Catch iOS emoji-style diagonal arrows, even when a future page injects them
// through markup or as a numeric HTML entity. Ordinary thin text arrows remain.
const emojiIconPattern = /(?:[\\u{1F300}-\\u{1FAFF}\\u2600-\\u26FF\\u2700-\\u27BF\\u2197\\u2196\\u2198\\u2199\\u2934\\u2935\\u2B05\\u2B06\\u2B07]\\uFE0F?|&#(?:x2197|8599);)/giu;
for (const {name,source} of pages) {
  if (emojiIconPattern.test(source)) failures.push(name+' contains an emoji-style icon');
  emojiIconPattern.lastIndex=0;
}

let totalImages=0;
for(const {name,source} of pages){
 const isPublic=!/^\/(?:page|author|qs|client-login)\//.test(name);
 const heading=(source.match(/<h1\b/gi)||[]).length;
 if(isPublic&&name!=='//'&&name!=='/404.html'&&heading!==1){
  failures.push(name+' expected 1 H1, found '+heading);
  console.error('HEADINGS '+name+': '+JSON.stringify(source.match(/<h1[^>]*>/gi)));
}
 const images=[...source.matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
 totalImages+=images.length;
 const missing=images.filter(tag=>!/\balt\s*=/i.test(tag)).length;
 if(missing)failures.push(name+' has '+missing+' images missing alt attribute');
 const description=(source.match(/<meta\s+name="description"\s+content="([^"]*)"/i)||[])[1];
 if(isPublic && name!=='/404.html' && description){
   const previous=descriptions.get(description);
   if(previous)failures.push('duplicate descriptions: '+previous+' and '+name);
   descriptions.set(description,name);
 }
}
// Every rendered page must carry real structured data. A homepage-only fix
// would leave legacy service URLs with no Organization/ContactPoint schema.
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday'];
function checkHours(specifications,route,label){
  if(!Array.isArray(specifications)||specifications.length!==2){
    failures.push(route+' '+label+' needs weekday and Saturday opening-hours specs');
    return;
  }
  const weekday=specifications.find(spec=>Array.isArray(spec.dayOfWeek));
  const saturday=specifications.find(spec=>spec.dayOfWeek==='Saturday');
  if(!weekday||JSON.stringify(weekday.dayOfWeek)!==JSON.stringify(weekdays) ||
     weekday.opens!=='06:00'||weekday.closes!=='15:00'){
    failures.push(route+' '+label+' must say Monday-Friday 06:00-15:00 UK');
  }
  if(!saturday||saturday.opens!=='08:00'||saturday.closes!=='13:00'){
    failures.push(route+' '+label+' must say Saturday 08:00-13:00 UK');
  }
  if(specifications.some(spec=>
    spec.dayOfWeek==='Sunday'||(Array.isArray(spec.dayOfWeek)&&spec.dayOfWeek.includes('Sunday')))){
    failures.push(route+' '+label+' incorrectly claims Sunday availability');
  }
  if(specifications.some(spec=>!spec.description?.includes('Europe/London'))){
    failures.push(route+' '+label+' has no UK time-zone context');
  }
}
for(const {name,source} of pages){
  // The noindex client-login holding page is not a public search landing page.
  if(name==='/404.html'||name==='/client-login/')continue;
  const scripts=[...source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let nodes=[];
  for(const match of scripts){
    try{
      const data=JSON.parse(match[1]);
      nodes.push(...(Array.isArray(data['@graph'])?data['@graph']:[data]));
    }catch{
      failures.push(name+' has malformed JSON-LD');
    }
  }
  const ofType=type=>nodes.filter(node=>node['@type']===type||
    (Array.isArray(node['@type'])&&node['@type'].includes(type)));
  const orgs=ofType('Organization');
  if(orgs.length!==1){failures.push(name+' needs exactly one Organisation schema node, found '+orgs.length);continue;}
  if(ofType('WebSite').length!==1)failures.push(name+' needs exactly one WebSite schema node');
  if(ofType('WebPage').length!==1)failures.push(name+' needs exactly one WebPage schema node');
  const org=orgs[0];
  if(!org.contactPoint){
    failures.push(name+' lacks a business enquiry ContactPoint');
  }else{
    if(!/closed Sunday/i.test(org.contactPoint.description||'')){
      failures.push(name+' does not clearly indicate Sunday closure');
    }
    checkHours(org.contactPoint.hoursAvailable,name,'ContactPoint');
  }
  for(const service of ofType('Service'))checkHours(service.hoursAvailable,name,'Service');
}

const homepage=pages.find(p=>p.name==='//')?.source;
if(!homepage)failures.push('home page not found');
else{
 const h1=homepage.match(/<h1 class="bde-h2 bde-dual-heading-35-625\b[\s\S]*?<\/h1>/i);
 if(!h1||!h1[0].includes('to become your best source of new business.')){
   failures.push('homepage SEO H1 missing');
   console.error('HOME DEBUG '+JSON.stringify({
     h1tags:homepage.match(/<h1[^>]*>/gi),
     dual:homepage.slice(homepage.indexOf('bde-dual-heading-35-625')-100,homepage.indexOf('bde-dual-heading-35-625')+350)
   }));
 }
 const scripts=[...homepage.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
   .map(m=>{try{return JSON.parse(m[1])}catch{return null}}).filter(Boolean);
 const org=scripts.flatMap(o=>o['@graph']||[]).find(o=>o['@type']==='Organization');
 if(!org?.sameAs?.length)failures.push('official business social profiles missing from schema');
 const service=scripts.flatMap(o=>o['@graph']||[]).find(o=>o['@type']==='Service');
 if(!Array.isArray(service?.areaServed) ||
    !service.areaServed.some(area=>area.name==='United Kingdom') ||
    !service.areaServed.some(area=>area.name==='Worldwide')){
   failures.push('UK service area missing from Service schema');
   console.error('SCHEMA DEBUG '+JSON.stringify({services:scripts.flatMap(o=>o['@graph']||[]).filter(o=>o['@type']==='Service'),types:scripts.flatMap(o=>o['@graph']||[]).map(o=>o['@type'])}));
 }
 if(!Array.isArray(org?.areaServed) ||
    !org.areaServed.some(area=>area.name==='United Kingdom') ||
    !org.areaServed.some(area=>area.name==='Worldwide'))
   failures.push('UK-first global agency coverage missing from organization schema');
 if(/Swiss Post Service|Where can I subscribe to your newsletter\?|This is a basic text element/i.test(homepage))
   failures.push('Old shop/template content remains in homepage output');
 if(/name=["']generator["'][^>]*WordPress|rel=["']EditURI["']/i.test(homepage))
   failures.push('WordPress export metadata still emitted');
 if(!homepage.includes('class="pm-skip-link"') || !homepage.includes('id="main-content"'))
   failures.push('Keyboard skip link or main target is missing');
 if(/src="\/wp-content\/uploads\/2024\/08\/Copy-of-PRUNUS-MEDIA.png"/.test(homepage))
   failures.push('full resolution 1 MB logo still used in HTML');
}
// New approved roofing case study is present on the homepage, work gallery and project detail.
for(const page of ['//','/our-work/','/our-work/residential-roofing-and-fascias/']){
 const html=pages.find(p=>p.name===page)?.source;
 if(!html){failures.push('Missing case-study route: '+page);continue;}
 if(!html.includes('pm-roofing-story__comparison'))failures.push(page+' missing roofing comparison');
 if((html.match(/class="pm-roofing-story__scroll"/g)||[]).length!==2)failures.push(page+' must have two independent screenshot scrollers');
 for(const image of ['/case-studies/roofing/before.jpg','/images/website-previews/residential-roofing-full.jpg','/case-studies/roofing/after-menu.png']){
  if(!html.includes(image))failures.push(page+' missing image path '+image);
 }
 if(!html.includes('15</strong>'))failures.push(page+' missing additional-page count');
}

// Single canonical pricing page and consistent published offers.
const pricing=pages.find(page=>page.name==='/pricing/')?.source;
if(!pricing) failures.push('Native pricing page missing');
else {
  if((pricing.match(/<h1\b/gi)||[]).length!==1) failures.push('Pricing page needs exactly one H1');
  for(const offer of ['£995','£1,795','£2,995','£99','£195','£50','Google Business Profile']) {
    if(!pricing.includes(offer)) failures.push('Pricing page missing '+offer);
  }
  if(!pricing.includes('rel="canonical" href="https://prunusmedia.com/pricing/"')) failures.push('Pricing canonical missing');
  if(!pricing.includes('href="/contact/#interest=seo"')) failures.push('SEO contact CTA missing');
}
if(pages.some(page=>page.name==='/website-design/packages/')) failures.push('Obsolete packages page is still being crawled');
const redirects=readFileSync(path.join(root,'_redirects'),'utf8');
for(const old of ['/website-design/packages/','/packages/']){
  if(!redirects.includes(old+' /pricing/ 301')) failures.push('Missing old pricing redirect: '+old);
}
for(const route of ['//','/seo-agency-uk/','/social-media-marketing-uk/']){
  const html=pages.find(page=>page.name===route)?.source||'';
  if(!html.includes('href="/pricing/"')) failures.push(route+' has no current pricing link');
  if(html.includes('href="/website-design/packages/"')) failures.push(route+' still links to old packages');
}
// One shared header must apply to native/editorial and legacy routes alike.
// A legacy export with a second Industries column must never regress again.
for(const {name,source} of pages){
  const publicRoute=!/^\/(?:page|author|qs|client-login)\//.test(name);
  if(!publicRoute || name==='/404.html') continue;
  const header=source.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)?.[0];
  if(!header){failures.push(name+' missing shared header');continue;}
  const columns=(header.match(/<div class="breakdance-dropdown-column\s*"/g)||[]).length;
  const prices=(header.match(/class="breakdance-dropdown-item prunus-pricing-dropdown-item"/g)||[]).length;
  const logos=(header.match(/<img\b[^>]*class="breakdance-image-object"/g)||[]).length;
  if(columns!==4) failures.push(name+' has '+columns+' dropdown columns; expected 4');
  if(prices!==4) failures.push(name+' has '+prices+' high-contrast Pricing items; expected 4');
  if(logos!==1) failures.push(name+' has '+logos+' header logos; expected 1');
  // The old package URL has a redirect but must not remain a clickable offer.
  if(header.includes('href="/website-design/packages/"')) failures.push(name+' still links to old packages');
  if(/href="\/(?:private-clinics|local-seo|website-design-ecommerce-web-design)\//.test(header)) {
    failures.push(name+' includes an old broken header URL');
  }
  const visibleText=source
    .replace(/<head\b[\s\S]*?<\/head>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/\s+/g,' ');
  if(/£\s*(?:125|149|249|395|450|695|750)\s*(?:\/|per\s*)?\s*month\b/i.test(visibleText)) {
    failures.push(name+' contains obsolete monthly package pricing');
  }
}
if(!homepage?.includes('class="pm-home-pricing"') ||
   !homepage?.includes('href="/pricing/">Explore our pricing')) {
   failures.push('Homepage clear-pricing invitation is missing');
}
console.log('SEO OUTPUT AUDIT: '+pages.length+' pages; '+totalImages+' images checked; '+descriptions.size+' unique public descriptions; '+failures.length+' failures');
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
