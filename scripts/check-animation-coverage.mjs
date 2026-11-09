
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
  if(source.includes('bde-menu-dropdown-27-153')){
    const section=out.slice(out.indexOf('class="bde-menu-dropdown-27-153'));
    const firstLink=section.match(/<ul class="breakdance-dropdown-links">[\s\S]*?<a[^>]*href="([^"]+)"/);
    if(firstLink?.[1]!=='/our-work/') throw new Error(filename+': Our Work not first in existing dropdown');
  }
  if(source.includes('bde-menu-dropdown-27-152')){
    const section=out.slice(out.indexOf('class="bde-menu-dropdown-27-152'));
    if(!section.slice(0,1600).includes('href="/blog/"')) throw new Error(filename+': Blog missing from About/Contact dropdown');
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
