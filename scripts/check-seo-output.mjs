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
 if(!org?.contactPoint?.hoursAvailable?.opens || !org?.contactPoint?.hoursAvailable?.closes)
   failures.push('UK enquiry hours missing from organization contact schema');
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
 for(const image of ['/case-studies/roofing/before.jpg','/case-studies/roofing/after.jpg','/case-studies/roofing/after-menu.png']){
  if(!html.includes(image))failures.push(page+' missing image path '+image);
 }
 if(!html.includes('15</strong>'))failures.push(page+' missing additional-page count');
}
console.log('SEO OUTPUT AUDIT: '+pages.length+' pages; '+totalImages+' images checked; '+descriptions.size+' unique public descriptions; '+failures.length+' failures');
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
