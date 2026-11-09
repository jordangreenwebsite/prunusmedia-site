
/**
 * Exhaustive inventory/check of source Breakdance entrance markers against
 * generated, standalone Prunus reveal markers in every exported page.
 * This does not load any WordPress or Breakdance browser runtime.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { getLegacyDocument, getLegacyRoutes } from '../src/lib/exported-pages.mjs';

const pages=['index.html','404.html',...getLegacyRoutes().map(({filename})=>filename)];
const allowed = new Set(['fade','slideUp','slideDown','slideLeft','slideRight',
  'flipUp','flipDown','flipLeft','flipRight','zoomIn','zoomOut']);
const inventory=[];
let total=0;
for(const filename of pages){
  const source=readFileSync(filename,'utf8');
  const out=getLegacyDocument(filename);
  const old=[...source.matchAll(/\bdata-entrance=(["'])([a-zA-Z]+)\1/g)].map(m=>m[2]);
  const native=[...out.matchAll(/\bdata-prunus-reveal=(["'])([a-zA-Z]+)\1/g)].map(m=>m[2]);
  if(old.length!==native.length || old.some((type,i)=>type!==native[i])){
    throw new Error('Entrance parity lost on '+filename+': original='+
      old.join(',')+' | Astro='+native.join(','));
  }
  if(native.some(type=>!allowed.has(type))) throw new Error('Unsupported animation '+filename);
  if(/<[^>]+\sdata-entrance=(["'])[a-zA-Z]+\1/.test(out)){
    throw new Error('Still carrying the old Breakdance hide attribute on '+filename);
  }
  const footerLogins = [...out.matchAll(/class="[^"]*prunus-footer-login[^"]*"/g)].length;
  if(footerLogins!==1) throw new Error(filename+': expected exactly one footer Client login, got '+footerLogins);
  if(out.includes('prunus-editorial-nav-item')) throw new Error(filename+': old oversized navigation remains');
  // The original exports disagree on navigation columns and active states.
  // Enforce the approved shared four-dropdown header on EVERY legacy route.
  const header=out.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)?.[0];
  if(!header) throw new Error(filename+': shared header missing');
  const columns=(header.match(/<div class="breakdance-dropdown-column\s*"/g)||[]).length;
  if(columns!==4) throw new Error(filename+': expected four single-column dropdowns, found '+columns);
  const logos=(header.match(/<img\b[^>]*class="breakdance-image-object"/g)||[]).length;
  if(logos!==1) throw new Error(filename+': expected exactly one Prunus header logo, found '+logos);
  const pricingItems=(header.match(/class="breakdance-dropdown-item prunus-pricing-dropdown-item"/g)||[]).length;
  if(pricingItems!==4) throw new Error(filename+': expected a separate Pricing item in each dropdown');
  for(const id of ['148','149','153','152']){
    const section=header.slice(header.indexOf('class="bde-menu-dropdown-27-'+id));
    const links=section.match(/<ul class="breakdance-dropdown-links">([\s\S]*?)<\/ul>/)?.[1];
    const urls=[...(links||'').matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m=>m[1]);
    if(urls[0]!=='/pricing/') throw new Error(filename+': Pricing is not first in dropdown '+id);
    if(urls.slice(1).includes('/pricing/')) throw new Error(filename+': duplicate Pricing in dropdown '+id);
    if(id==='153' && urls[1]!=='/our-work/') throw new Error(filename+': Our Work must follow Pricing in its dropdown');
    if(id==='152' && urls[1]!=='/blog/') throw new Error(filename+': Blog must follow Pricing in About/Contact');
  }
  if(/href="\/(?:private-clinics|local-seo|website-design-ecommerce-web-design)\//.test(header)) {
    throw new Error(filename+': stale legacy route in the shared header');
  }
  const counts=Object.fromEntries([...new Set(old)].map(type=>[type,old.filter(x=>x===type).length]));
  inventory.push({route:filename,count:old.length,effects:counts});
  total+=old.length;
}
if(total<75)throw new Error('Expected numerous source animations; inventory unexpectedly small: '+total);
console.log('ENTRANCE COVERAGE: '+total+' original entrance effects across '+pages.length+' pages');
inventory.forEach(x=>console.log(x.route+' => '+x.count+' => '+JSON.stringify(x.effects)));
mkdirSync('reports',{recursive:true});
writeFileSync('reports/animation-inventory.json',JSON.stringify({total,pages:inventory},null,2)+'\n');
