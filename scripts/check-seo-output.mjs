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
 const h1=homepage.match(/<h1 class="bde-dual-heading-35-625\b[\s\S]*?<\/h1>/i);
 if(!h1||!h1[0].includes('UK businesses more enquiries')){
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
 if(service?.areaServed?.name!=='United Kingdom'){
   failures.push('UK service area missing from Service schema');
   console.error('SCHEMA DEBUG '+JSON.stringify({services:scripts.flatMap(o=>o['@graph']||[]).filter(o=>o['@type']==='Service'),types:scripts.flatMap(o=>o['@graph']||[]).map(o=>o['@type'])}));
 }
 if(/src="\/wp-content\/uploads\/2024\/08\/Copy-of-PRUNUS-MEDIA.png"/.test(homepage))
   failures.push('full resolution 1 MB logo still used in HTML');
}
console.log('SEO OUTPUT AUDIT: '+pages.length+' pages; '+totalImages+' images checked; '+descriptions.size+' unique public descriptions; '+failures.length+' failures');
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
