import {allowedClient,listMatchingProperties,validProperty,gscToken} from './gsc.js';
import {gbpDailyPerformance} from './gbp.js';
import {providerConfig,requestProvider} from './seo-provider.js';
const clean=(x,n=200)=>String(x??'').trim().slice(0,n),all=async q=>(await q.all()).results||[];
const reply=(data,status=200)=>new Response(JSON.stringify({ok:status<400,...data}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(error,status=400)=>reply({error},status);
const identity=x=>/^(?:cid:[0-9]{1,25}|[A-Za-z0-9_-]{10,160})$/.test(x);
const day=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const host=x=>String(x).toLowerCase().replace(/^www\./,'');
const eventNames=['generate_lead','phone_click','whatsapp_click'];
export function eventRequest(c,dates,organic){
 const filters=[{filter:{fieldName:'hostName',inListFilter:{values:[host(c.domain),'www.'+host(c.domain)],caseSensitive:false}}},{filter:{fieldName:'eventName',inListFilter:{values:eventNames,caseSensitive:true}}}];
 if(organic)filters.push({filter:{fieldName:'sessionDefaultChannelGroup',stringFilter:{matchType:'EXACT',value:'Organic Search'}}});
 return {dateRanges:[{startDate:dates.start,endDate:dates.end}],dimensions:[{name:'eventName'}],metrics:[{name:'eventCount'}],dimensionFilter:{andGroup:{expressions:filters}},limit:10};
}
export function parseEvents(data){
 const values={};for(const x of data.rows||[]){const k=x.dimensionValues?.[0]?.value,v=x.metricValues?.[0]?.value;if(eventNames.includes(k)&&v!==undefined&&Number.isFinite(Number(v)))values[k]=Number(v);}
 return values;
}
export async function conversionMetrics(env,c,dates,property,fetcher=fetch,tokenFn=gscToken){
 if(!property||!/^\d{1,15}$/.test(property)||!env.GSC_SERVICE_ACCOUNT_JSON)return {status:'not-configured',all:null,organic:null};
 try{
  const token=await tokenFn(env,'https://www.googleapis.com/auth/analytics.readonly');
  const read=async organic=>{const r=await fetcher('https://analyticsdata.googleapis.com/v1beta/properties/'+property+':runReport',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(eventRequest(c,dates,organic))});if(!r.ok)throw Error();return parseEvents(await r.json());};
  const [total,organic]=await Promise.all([read(false),read(true)]);return {status:'ok',all:total,organic};
 }catch{return {status:'unavailable',all:null,organic:null};}
}
async function checkMap(env,c,t,scheduled=false){
 const cfg=providerConfig(env);if(!cfg.enabled||!cfg.configured||!cfg.cap)throw Error('Paid SEO is disabled or not configured.');
 if(!identity(t.place_identity)||!t.keyword||/[+:％%]|[\u0000-\u001f]/.test(t.keyword))throw Error('Invalid Maps target.');
 const claim=await env.DB.prepare("UPDATE seo_maps_targets SET attempted_at=datetime('now'),status='running' WHERE id=? AND client_id=? AND (attempted_at IS NULL OR attempted_at<datetime('now',?))"+(scheduled?' AND enabled=1':'')).bind(t.id,c.id,scheduled?'-7 days':'-2 minutes').run();
 if((claim.meta?.changes??claim.changes??0)!==1)throw Error('A check was recently attempted.');
 try{
  const r=await requestProvider(env,c.id,'maps',JSON.stringify([t.keyword,t.location,t.place_identity]),{keyword:t.keyword,location_name:t.location,language_code:'en',device:'desktop',depth:30},t.place_identity,true);
  if(!r.result_count)throw Error('No Maps results');
  const live=await env.DB.prepare('SELECT k.keyword FROM seo_maps_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id WHERE t.client_id=? AND t.id=?').bind(c.id,t.id).first();
  if(live?.keyword!==t.keyword)throw Error('Target changed');
  await env.DB.batch([env.DB.prepare('INSERT INTO seo_maps_checks(target_id,checked_at,keyword,domain,position,result_count) VALUES(?,?,?,?,?,?)').bind(t.id,new Date().toISOString(),t.keyword,c.domain,r.position,r.result_count),env.DB.prepare("UPDATE seo_maps_targets SET status='ok' WHERE id=? AND client_id=?").bind(t.id,c.id)]);
  return r;
 }catch(e){await env.DB.prepare("UPDATE seo_maps_targets SET status='error' WHERE id=? AND client_id=?").bind(t.id,c.id).run();throw e;}
}
export async function runMapsSchedule(env){
 const cfg=providerConfig(env);if(!cfg.enabled||!cfg.configured||!cfg.cap)return;
 const rows=await all(env.DB.prepare("SELECT t.*,k.keyword,c.domain FROM seo_maps_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id JOIN clients c ON c.id=t.client_id WHERE c.active=1 AND t.enabled=1 AND (t.attempted_at IS NULL OR t.attempted_at<datetime('now','-7 days')) ORDER BY COALESCE(t.attempted_at,''),t.id LIMIT 2"));
 await Promise.allSettled(rows.map(t=>checkMap(env,{id:t.client_id,domain:t.domain},t,true)));
}
export async function reportGrowth(env,c,dates,ids,property){
 const [events,maps,changes]=await Promise.all([
  conversionMetrics(env,c,dates,property),
  all(env.DB.prepare("SELECT k.keyword,t.location,h.position,h.checked_at FROM seo_maps_targets t JOIN seo_client_keyword_slots s ON s.client_id=t.client_id AND s.keyword_id=t.keyword_id JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id JOIN seo_maps_checks h ON h.target_id=t.id AND h.keyword=k.keyword AND h.domain=? WHERE t.client_id=? AND substr(h.checked_at,1,10) BETWEEN ? AND ? AND h.checked_at=(SELECT MAX(z.checked_at) FROM seo_maps_checks z WHERE z.target_id=t.id AND z.keyword=k.keyword AND z.domain=h.domain AND substr(z.checked_at,1,10) BETWEEN ? AND ?) ORDER BY s.slot,t.location LIMIT 100").bind(c.domain,c.id,dates.start,dates.end,dates.start,dates.end)),
  all(env.DB.prepare('SELECT title,changed_on FROM seo_website_changes WHERE client_id=? AND shared=1 AND changed_on BETWEEN ? AND ? ORDER BY changed_on LIMIT 100').bind(c.id,dates.start,dates.end))
 ]);
 return {events,maps,changes};
}
export async function growthRoute(req,env,user,url){
 const prefix='/api/admin/seo-growth';if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return null;
 if(!user?.admin)return fail('Agency access only.',403);
 const c=await allowedClient(env,user,clean(url.searchParams.get('client'),100));if(!c)return fail('Business not found.',404);
 const path=url.pathname.slice(prefix.length),m=req.method;
 try{
  if(path==='/properties'&&m==='GET')return reply({properties:await listMatchingProperties(env,c)});
  if(path==='/gbp'&&m==='GET'){const start=clean(url.searchParams.get('start'),10),end=clean(url.searchParams.get('end'),10);if(!day(start)||!day(end)||start>end||Date.parse(end)-Date.parse(start)>31*86400000)return fail('Choose up to 32 days.');return reply(await gbpDailyPerformance(env,c.id,start,end));}
  if(!path&&m==='GET'){
   const [maps,changes,keywords]=await Promise.all([
    all(env.DB.prepare("SELECT t.*,k.keyword,h.position,h.result_count,h.checked_at FROM seo_maps_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id LEFT JOIN seo_maps_checks h ON h.target_id=t.id AND h.checked_at=(SELECT MAX(z.checked_at) FROM seo_maps_checks z WHERE z.target_id=t.id AND z.keyword=k.keyword AND z.domain=?) WHERE t.client_id=? ORDER BY k.keyword,t.location LIMIT 200").bind(c.domain,c.id)),
    all(env.DB.prepare('SELECT * FROM seo_website_changes WHERE client_id=? ORDER BY changed_on DESC LIMIT 200').bind(c.id)),
    all(env.DB.prepare('SELECT id,keyword FROM seo_keywords WHERE client_id=? ORDER BY keyword_key LIMIT 1000').bind(c.id))
   ]);return reply({maps,changes,keywords,paid:providerConfig(env).enabled&&providerConfig(env).configured});
  }
  if(m!=='POST')return fail('Not found.',404);
  if(!req.headers.get('content-type')?.startsWith('application/json'))return fail('JSON required.');
  const raw=await req.text();if(raw.length>12000)return fail('Request too large.');let b;try{b=JSON.parse(raw);}catch{return fail('Invalid JSON.');}if(!b||Array.isArray(b)||typeof b!=='object')return fail('Invalid JSON.');
  if(path==='/properties'){
   const p=clean(b.property,250);if(!validProperty(p,c.domain))return fail('Property does not match this domain.');
   const options=await listMatchingProperties(env,c);if(!options.some(x=>x.property===p))return fail('Property not authorised.',403);
   await env.DB.prepare('UPDATE clients SET gsc_property=? WHERE id=? AND active=1').bind(p,c.id).run();return reply({});
  }
  if(path==='/maps'){
   const p=clean(b.place_identity,170),l=clean(b.location,180),kid=clean(b.keyword_id,100);
   if(!identity(p)||!l||!/^[\p{L}\p{N} ,.'()\-]+$/u.test(l))return fail('Enter a verified Place ID or cid:NUMBER and exact provider search location.');
   const k=await env.DB.prepare('SELECT id,keyword FROM seo_keywords WHERE id=? AND client_id=?').bind(kid,c.id).first();if(!k)return fail('Keyword not found.',404);
   if(/[+:％%]|[\u0000-\u001f]/.test(k.keyword))return fail('Plain search keywords only.');
   const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM seo_maps_targets WHERE client_id=?').bind(c.id).first();if(Number(count.n)>=200)return fail('Maps target limit reached.');
   await env.DB.prepare('INSERT OR IGNORE INTO seo_maps_targets(id,client_id,keyword_id,place_identity,location,enabled) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),c.id,k.id,p,l,b.enabled===true?1:0).run();return reply({},201);
  }
  const match=path.match(/^\/maps\/([a-f0-9-]{36})\/(check|toggle)$/);
  if(match){
   const t=await env.DB.prepare('SELECT t.*,k.keyword FROM seo_maps_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id WHERE t.id=? AND t.client_id=?').bind(match[1],c.id).first();if(!t)return fail('Target not found.',404);
   if(match[2]==='toggle'){await env.DB.prepare('UPDATE seo_maps_targets SET enabled=? WHERE id=? AND client_id=?').bind(b.enabled===true?1:0,t.id,c.id).run();return reply({});}
   return reply(await checkMap(env,c,t));
  }
  if(path==='/changes'){
   const title=clean(b.title,180),date=clean(b.changed_on,10);
   if(title.length<4||!day(date)||date>new Date().toISOString().slice(0,10))return fail('Enter completed work and a valid date.');
   const shared=b.shared===true;
   await env.DB.prepare('INSERT INTO seo_website_changes(id,client_id,title,changed_on,detail,reference,shared) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),c.id,title,date,clean(b.detail,1200),clean(b.reference,300),shared?1:0).run();return reply({},201);
  }
  return fail('Not found.',404);
 }catch(e){return fail(e?.status===429?'Budget or recent request limit reached.':'Connection or request unavailable; check configuration.',e?.status===429?429:502);}
}
