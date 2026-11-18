import {publicUrl,siteUrl} from './seo-workspace.js';
const limit=800000;
const clean=(v,n=250)=>String(v??'').trim().slice(0,n);
const safePath=p=>!/(?:^|\/)(?:api|admin|wp-admin|wp-json|wp-login(?:\.php)?|login|sign-in|logout|account|cart|checkout|payment|booking|client-login|portal|mcp|auth|search|private|download|delete|unsubscribe|concept-websites)(?:\/|$)/i.test(p);
export function crawlUrl(raw,domain,from){
 try{
  const u=new URL(raw,from);u.hash='';
  const decoded=decodeURIComponent(u.pathname);
  if(u.search||/%[0-9a-f]{2}/i.test(decoded)||decoded.includes('\\')||!safePath(decoded)||!siteUrl(u.href,[domain]))return null;
  return u.href;
 }catch{return null;}
}
export function robotsPolicy(text){
 // Conservative subset: respect all applicable disallows, even where an Allow
 // exception might permit crawling. Unsupported wildcard/encoding => skip extras.
 let agents=[],rules=[],hadRule=false,delay=false;
 for(const raw of text.split(/\r?\n/)){
  const line=raw.split('#')[0].trim(),m=line.match(/^([^:]+):\s*(.*)$/);if(!m)continue;
  const k=m[1].toLowerCase(),v=m[2].trim();
  if(k==='user-agent'){if(hadRule){agents=[];hadRule=false;}agents.push(v.toLowerCase());}
  else if(['allow','disallow','crawl-delay'].includes(k)){
   hadRule=true;
   if(agents.some(x=>x==='*'||x&&'prunusseo'.includes(x))){
    if(k==='crawl-delay'&&Number(v)>0)delay=true;
    if(k==='disallow'&&v)rules.push(v);
   }
  }
 }
 return {delay,rules,allows(url){
  const path=new URL(url).pathname;
  if(delay)return false;
  return !rules.some(r=>r.includes('*')||r.includes('$')||r.includes('%')||path.startsWith(r));
 }};
}
async function boundedText(res){
 const reader=res.body?.getReader();if(!reader)return '';
 let count=0;const decoder=new TextDecoder();let text='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>limit)throw Error('Response exceeds crawl limit');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
 finally{await reader.cancel().catch(()=>{});}
}
async function retrieve(url,domain,allowed,fetcher){
 let u=crawlUrl(url,domain,url);if(!u||allowed&&!allowed(u))return {url,status:null,error:'not-permitted'};
 for(let i=0;i<2;i++){
  try{
   const res=await fetcher(u,{method:'GET',redirect:'manual',headers:{'user-agent':'PrunusSEO/1.0 (public website audit)','accept':'text/html,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.1'},signal:AbortSignal.timeout(6500)});
   const status=res.status,type=res.headers.get('content-type')||'',robots=res.headers.get('x-robots-tag')||'';
   if(status>=300&&status<400&&res.headers.get('location')){
    const next=crawlUrl(res.headers.get('location'),domain,u);await res.body?.cancel();
    if(i===0&&next&&next!==u&&(!allowed||allowed(next))){u=next;continue;}
    return {url:u,status,error:'redirect-not-followed'};
   }
   if(!res.ok){await res.body?.cancel();return {url:u,status,type,robots};}
   if(!/(?:text\/|xml|html|xhtml)/i.test(type)){await res.body?.cancel();return {url:u,status,type,robots,error:'non-text'};}
   return {url:u,status,type,robots,text:await boundedText(res)};
  }catch{return {url:u,status:null,error:'unavailable-or-over-limit'};}
 }
 return {url:u,status:null,error:'redirect-limit'};
}
export function pageIssues(page){
 const a=[];
 if(page.status===404||page.status===410)return ['Page returns HTTP '+page.status];
 if(page.status>=500)return ['Page returned server error '+page.status+'; recheck'];
 if(page.status!==200||page.error||!page.html)return [];
 if(!page.title)a.push('Missing title');else if(page.title.length>65)a.push('Review long title');
 if(!page.description)a.push('Missing meta description');else if(page.description.length>170)a.push('Review long meta description');
 if(page.h1===0)a.push('Missing H1');else if(page.h1>1)a.push('Review multiple H1 headings');
 if(!page.canonical)a.push('Missing canonical');
 if(page.canonical&&page.canonical!==page.url)a.push('Review non-self canonical');
 if(page.noindex)a.push('Review noindex directive');
 if(page.imagesWithoutAlt>0)a.push(page.imagesWithoutAlt+' image(s) missing alt attribute');
 if(!page.lang)a.push('Missing HTML language');
 if(!page.viewport)a.push('Missing mobile viewport declaration');
 return a;
}
async function analyse(raw,domain){
 const p={url:raw.url,status:raw.status,error:raw.error||null,html:false,title:'',description:'',h1:0,canonical:'',noindex:/\bnoindex\b/i.test(raw.robots||''),imagesWithoutAlt:0,lang:'',viewport:false,links:[]};
 if(raw.status!==200||!raw.text||!/(?:html|xhtml)/i.test(raw.type||'')){p.issues=pageIssues(p);return p;}
 p.html=true;
 const seen=new Set();let title='',inTitle=false;
 const rewriter=new HTMLRewriter()
 .on('html',{element(e){p.lang=clean(e.getAttribute('lang'),20);}})
 .on('title',{element(){inTitle=true;},text(t){if(inTitle&&title.length<350)title+=t.text.slice(0,350-title.length);}})
 .on('h1',{element(){p.h1++;}})
 .on('meta',{element(e){const n=(e.getAttribute('name')||'').toLowerCase();const v=e.getAttribute('content')||'';if(n==='description')p.description=clean(v,500);if(n==='viewport')p.viewport=!!v;if(['robots','googlebot'].includes(n)&&/\bnoindex\b/i.test(v))p.noindex=true;}})
 .on('link[rel]',{element(e){if((e.getAttribute('rel')||'').toLowerCase().split(/\s+/).includes('canonical')){try{p.canonical=clean(new URL(e.getAttribute('href'),p.url).href,1500);}catch{}}}})
 .on('img',{element(e){if(e.getAttribute('alt')===null)p.imagesWithoutAlt++;}})
 .on('a[href]',{element(e){if(seen.size>=80)return;const x=crawlUrl(e.getAttribute('href'),domain,p.url);if(x)seen.add(x);}});
 await rewriter.transform(new Response(raw.text,{headers:{'content-type':'text/html; charset=utf-8'}})).arrayBuffer();
 p.title=clean(title,350);p.links=[...seen];p.issues=pageIssues(p);return p;
}
export function sitemapEntries(xml,domain,base){
 const out=[];const seen=new Set();
 for(const m of xml.matchAll(/<loc(?:\s[^>]*)?>\s*([^<]{1,1500})\s*<\/loc\s*>/gi)){
  if(out.length>=400)break;
  const u=crawlUrl(m[1].trim().replace(/&amp;/g,'&'),domain,base);
  if(u&&!seen.has(u)){seen.add(u);out.push(u);}
 }
 return out;
}
export async function auditSite(domain,fetcher=fetch,now=new Date()){
 const start=publicUrl('https://'+domain+'/');
 if(!start)throw Error('Invalid registered website domain.');
 const base=new URL(start).origin;
 const robot=await retrieve(base+'/robots.txt',domain,null,fetcher);
 const policy=robot.status===200&&typeof robot.text==='string'&&!/<(?:html|!doctype html)\b/i.test(robot.text)?robotsPolicy(robot.text):null;
 const canCrawl=robot.status===404||robot.status===410||Boolean(policy);
 const allowed=u=>canCrawl&&(!policy||policy.allows(u));
 const result={domain,robots:{status:robot.status,error:robot.error||null,restrictive:!canCrawl||!!policy?.rules.length||!!policy?.delay},sitemap:{status:null,entries:0,index:false},pages:[],links:[],notes:[]};
 if(!canCrawl){result.notes.push('Robots policy could not be verified. No page crawl attempted.');return result;}
 const sitemap=await retrieve(base+'/sitemap.xml',domain,allowed,fetcher);
 let urls=sitemap.text?sitemapEntries(sitemap.text,domain,sitemap.url):[];
 result.sitemap={status:sitemap.status,entries:urls.length,index:/<sitemapindex\b/i.test(sitemap.text||''),error:sitemap.error||null};
 // At most one child sitemap; no external hosts, query strings or arbitrary redirects.
 if(result.sitemap.index&&urls.length){
  const child=await retrieve(urls[0],domain,allowed,fetcher);
  urls=child.status===200&&child.text?sitemapEntries(child.text,domain,child.url):[];
  result.sitemap.child_status=child.status;result.sitemap.entries=urls.length;
 }
 const home=await analyse(await retrieve(start,domain,allowed,fetcher),domain);
 result.pages.push(home);
 const candidates=[...new Set([...urls,...home.links])].filter(u=>u!==start&&u!==home.url&&allowed(u)&&!/\.(?:xml|jpg|jpeg|png|webp|svg|pdf|zip|css|js|ico|mp4|woff2?)$/i.test(new URL(u).pathname));
 const offset=candidates.length?Math.floor(now.getTime()/604800000)%candidates.length:0;
 const picks=[...candidates.slice(offset),...candidates.slice(0,offset)].slice(0,3);
 const pages=await Promise.all(picks.map(async u=>analyse(await retrieve(u,domain,allowed,fetcher),domain)));
 result.pages.push(...pages);
 const known=new Map(result.pages.map(p=>[p.url,p.status]));
 // Bounded link sample. Do not confuse a sitemap entry with an actual incoming link.
 const edges=new Map();
 for(const p of result.pages)for(const target of p.links){
  if(target===p.url||!allowed(target)||target===start)continue;
  if(!edges.has(target))edges.set(target,[]);
  if(!edges.get(target).includes(p.url))edges.get(target).push(p.url);
 }
 const ordered=[...edges.keys()].sort((a,b)=>Number(known.has(a))-Number(known.has(b))).slice(0,4);
 result.links=await Promise.all(ordered.map(async target=>{
  const checked=known.has(target)?{status:known.get(target)}:await retrieve(target,domain,allowed,fetcher);
  return {target,sources:edges.get(target),status:checked.status,error:checked.error||null};
 }));
 const duplicate=new Map();for(const p of result.pages)if(p.title){const k=p.title.toLowerCase();if(!duplicate.has(k))duplicate.set(k,[]);duplicate.get(k).push(p);}
 for(const same of duplicate.values())if(same.length>1)for(const p of same)p.issues.push('Review duplicate title in sampled pages');
 for(const p of result.pages)delete p.links;
 result.notes.push('Sample only: up to four HTML page candidates and four linked destinations per run. No JavaScript rendering, Core Web Vitals, or Google index verification.');
 return result;
}
