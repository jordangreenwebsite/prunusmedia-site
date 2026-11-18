import {allowedClient} from './gsc.js';
import {keywordKey} from './seo-workspace.js';
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
const all=async q=>(await q.all()).results||[];
const response=(data,status=200)=>new Response(JSON.stringify({ok:status<400,...data}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
class ProviderError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const fail=(m,s)=>{throw new ProviderError(m,s);};
const month=()=>new Date().toISOString().slice(0,7);
const rules={
 ideas:{path:'/v3/dataforseo_labs/google/keyword_ideas/live',reserve:50000,ttl:30},
 overview:{path:'/v3/dataforseo_labs/google/keyword_overview/live',reserve:50000,ttl:30},
 competitor:{path:'/v3/dataforseo_labs/google/ranked_keywords/live',reserve:50000,ttl:30},
 backlinks:{path:'/v3/backlinks/backlinks/live',reserve:60000,ttl:7},
 maps:{path:'/v3/serp/google/maps/live/advanced',reserve:30000,ttl:0},
 rank:{path:'/v3/serp/google/organic/live/advanced',reserve:20000,ttl:0}
};
export function providerConfig(env){
 const raw=String(env.DATAFORSEO_MONTHLY_BUDGET_USD??'10');
 const cap=/^\d{1,3}(\.\d{1,2})?$/.test(raw)?Math.round(Number(raw)*1e6):0;
 return {configured:!!(env.DATAFORSEO_LOGIN&&env.DATAFORSEO_PASSWORD),enabled:env.DATAFORSEO_ENABLED==='true',cap:cap<=100e6?cap:0};
}
function keyword(v){const k=clean(v,200).replace(/\s+/g,' ');if(!k||/[+:％%]|[\u0000-\u001f]/.test(k)||/[\w-]+:\S/.test(k))fail('Enter a plain search phrase without search operators or special encoding.');return k;}
function host(v){const h=clean(v,253).toLowerCase().replace(/^www\./,'');if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(h)||h.includes('..'))fail('Enter a domain only, e.g. example.co.uk.');return h;}
function location(v){const l=clean(v,180)||'United Kingdom';if(!/^[\p{L}\p{N} ,.'()\-]+$/u.test(l))fail('Use the provider’s full location name.');return l;}
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
function metrics(x){const k=x?.keyword_data||x||{};return {keyword:clean(k.keyword),volume:number(k.keyword_info?.search_volume),difficulty:number(k.keyword_properties?.keyword_difficulty),cpc:number(k.keyword_info?.cpc),intent:clean(k.search_intent_info?.main_intent,40)||null,updated_at:clean(k.keyword_info?.last_updated_time,80)||null};}
function matching(h,d){return String(h||'').toLowerCase().replace(/^www\./,'')===String(d).toLowerCase().replace(/^www\./,'');}
export function parseResults(kind,result,target){
 const items=Array.isArray(result?.items)?result.items:[];
 if(kind==='ideas'||kind==='overview')return {rows:items.slice(0,100).map(metrics).filter(x=>x.keyword)};
 if(kind==='competitor')return {rows:items.slice(0,100).map(x=>({...metrics(x),position:number(x.ranked_serp_element?.serp_item?.rank_group),url:clean(x.ranked_serp_element?.serp_item?.url,1500)})).filter(x=>x.keyword)};
 if(kind==='backlinks')return {total:number(result.total_count),rows:items.slice(0,100).map(x=>({source:clean(x.url_from,1500),target:clean(x.url_to,1500),domain:clean(x.domain_from,253),anchor:clean(x.anchor,200),rank:number(x.domain_from_rank),new:x.is_new===true,lost:x.is_lost===true,first_seen:clean(x.first_seen,80),last_seen:clean(x.last_seen,80)})).filter(x=>x.source&&x.target)};
 if(kind==='maps'){
  const rows=items.filter(x=>x.type==='maps_search'&&Number.isInteger(x.rank_group)&&x.rank_group>0&&x.rank_group<=30).sort((a,b)=>a.rank_group-b.rank_group);
  const found=rows.find(x=>target.startsWith('cid:')?String(x.cid)===target.slice(4):x.place_id===target);
  return {position:found?.rank_group??null,result_count:rows.length};
 }
 const organic=items.filter(x=>x.type==='organic'&&Number.isInteger(x.rank_group)&&x.rank_group>0&&x.rank_group<=30).sort((a,b)=>a.rank_group-b.rank_group);
 const found=organic.filter(x=>matching(x.domain,target)).sort((a,b)=>a.rank_group-b.rank_group)[0];
 return {position:found?.rank_group??null,url:found?clean(found.url,1500):null,result_count:organic.length,corrected:clean(result?.spell?.keyword,200)||null,rivals:organic.slice(0,10).map(x=>({position:x.rank_group,domain:clean(x.domain,253),url:clean(x.url,1500)}))};
}
async function usage(env){
 const rows=await env.DB.prepare('SELECT COALESCE(SUM(COALESCE(billed,reserved)),0) AS used,COALESCE(SUM(CASE WHEN billed IS NULL THEN reserved ELSE 0 END),0) AS unconfirmed, COUNT(*) AS requests FROM seo_provider_usage WHERE month=?').bind(month()).first();
 return {used:Number(rows?.used||0),unconfirmed:Number(rows?.unconfirmed||0),requests:Number(rows?.requests||0),month:month()};
}
export async function reserve(env,clientId,kind,key){
 const c=providerConfig(env);if(!c.configured||!c.enabled||c.cap<=0)fail('Paid SEO is disabled or not configured.',409);
 const amount=rules[kind].reserve,id=crypto.randomUUID(),m=month();
 // The insert and budget comparison are one SQLite write, not a race-prone read/modify/write.
 await env.DB.prepare("INSERT INTO seo_provider_usage(id,client_id,month,kind,request_key,reserved,state) SELECT ?,?,?,?,?,?,'pending' WHERE (SELECT COALESCE(SUM(COALESCE(billed,reserved)),0) FROM seo_provider_usage WHERE month=?)+?<=? AND NOT EXISTS(SELECT 1 FROM seo_provider_usage WHERE request_key=? AND created_at>datetime('now','-60 seconds')) AND NOT EXISTS(SELECT 1 FROM seo_provider_usage WHERE billed>reserved AND month=?)").bind(id,clientId,m,kind,key,amount,m,amount,c.cap,key,m).run();
 const row=await env.DB.prepare('SELECT id FROM seo_provider_usage WHERE id=?').bind(id).first();
 if(!row)fail('Budget limit, another recent request, or a provider billing discrepancy. No new call was made.',429);
 return id;
}
export async function requestProvider(env,clientId,kind,key,params,target,force=false){
 const rule=rules[kind];
 const old=await env.DB.prepare('SELECT payload,fetched_at FROM seo_provider_cache WHERE client_id=? AND kind=? AND request_key=?').bind(clientId,kind,key).first();
 if(!force&&old&&Date.now()-Date.parse(old.fetched_at.replace(' ','T')+'Z')<rule.ttl*86400000)return {...JSON.parse(old.payload),fetched_at:old.fetched_at,cached:true};
 const id=await reserve(env,clientId,kind,clientId+':'+kind+':'+key);
 let cost=null;
 try{
  const res=await fetch('https://api.dataforseo.com'+rule.path,{method:'POST',redirect:'error',headers:{authorization:'Basic '+btoa(String(env.DATAFORSEO_LOGIN)+':'+String(env.DATAFORSEO_PASSWORD)),'content-type':'application/json'},body:JSON.stringify([{...params,tag:id}]),signal:AbortSignal.timeout(25000)});
  if(!res.ok)throw Error('HTTP failure');
  const b=await res.json();
  if(typeof b.cost==='number'&&Number.isFinite(b.cost)&&b.cost>=0)cost=Math.ceil(b.cost*1e6);
  const task=b.tasks?.[0];
  const ok=b.status_code===20000&&task?.status_code===20000&&Array.isArray(task.result)&&task.result.length>0;
  await env.DB.prepare('UPDATE seo_provider_usage SET billed=?,state=? WHERE id=?').bind(cost,ok?'complete':'provider-error',id).run();
  if(!ok)throw Error('provider error');
  const payload=parseResults(kind,task.result[0],target);
  await env.DB.prepare("INSERT INTO seo_provider_cache(client_id,kind,request_key,payload,fetched_at) VALUES(?,?,?,?,datetime('now')) ON CONFLICT(client_id,kind,request_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at").bind(clientId,kind,key,JSON.stringify(payload)).run();
  return {...payload,fetched_at:new Date().toISOString(),cached:false};
 }catch{
  // Unknown charges remain reserved; never automatically refund or retry.
  await env.DB.prepare("UPDATE seo_provider_usage SET billed=COALESCE(billed,?),state=CASE WHEN state='pending' THEN 'unknown' ELSE state END WHERE id=?").bind(cost,id).run();
  fail('Provider request failed. Any unknown cost remains reserved; check the provider dashboard.',502);
 }
}
async function saveRank(env,client,t){
 const k=keyword(t.keyword),d=host(client.domain),l=location(t.location);
 const data=await requestProvider(env,client.id,'rank',JSON.stringify([k,l,t.device,d]),{keyword:k,location_name:l,language_code:'en',device:t.device,depth:30},d,true);
 if(data.corrected&&keywordKey(data.corrected)!==keywordKey(k))fail('Google corrected this phrase; no comparable rank was recorded.',409);
 if(data.result_count===0)fail('No organic results were returned; no rank was recorded.',502);
 const live=await env.DB.prepare('SELECT k.keyword FROM seo_rank_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id WHERE t.id=? AND t.client_id=?').bind(t.id,client.id).first();
 if(!live||live.keyword!==t.keyword)fail('Keyword changed; no rank was recorded.',409);
 await env.DB.prepare("INSERT INTO seo_rank_history(target_id,checked_at,keyword,domain,position,url,result_count,rivals) VALUES(?,?,?,?,?,?,?,?)").bind(t.id,new Date().toISOString(),t.keyword,d,data.position,data.url,data.result_count,JSON.stringify(data.rivals)).run();
 return data;
}
async function checkRank(env,client,t){
 const cfg=providerConfig(env);if(!cfg.configured||!cfg.enabled||!cfg.cap)fail('Paid SEO is disabled or not configured.',409);
 // Claim first to prevent concurrent/manual duplicate calls.
 const claim=await env.DB.prepare("UPDATE seo_rank_targets SET attempted_at=datetime('now'),status='running' WHERE id=? AND client_id=? AND (attempted_at IS NULL OR attempted_at<datetime('now','-2 minutes'))").bind(t.id,client.id).run();
 if((claim.meta?.changes??claim.changes??0)!==1)fail('A check was attempted recently.',429);
 try{const data=await saveRank(env,client,t);await env.DB.prepare("UPDATE seo_rank_targets SET status='ok' WHERE id=? AND client_id=?").bind(t.id,client.id).run();return data;}
 catch(e){await env.DB.prepare("UPDATE seo_rank_targets SET status='error' WHERE id=? AND client_id=?").bind(t.id,client.id).run();throw e;}
}
async function discover(env,client,force=false){
 const d=host(client.domain);
 return requestProvider(env,client.id,'backlinks',d,{target:d,limit:100,rank_scale:'one_hundred',backlinks_status_type:'all',include_subdomains:true,exclude_internal_backlinks:true},d,force);
}
async function readBody(req){if(!req.headers.get('content-type')?.startsWith('application/json'))fail('JSON required');const s=await req.text();if(s.length>40000)fail('Request too large');try{const b=JSON.parse(s);if(!b||Array.isArray(b)||typeof b!=='object')throw Error();return b;}catch{fail('Invalid JSON');}}
async function targets(env,id){return all(env.DB.prepare("SELECT t.*,k.keyword,k.target_url,(SELECT h.position FROM seo_rank_history h WHERE h.target_id=t.id AND h.keyword=k.keyword AND h.domain=lower(replace(c.domain,'www.','')) ORDER BY h.checked_at DESC LIMIT 1) AS position,(SELECT h.checked_at FROM seo_rank_history h WHERE h.target_id=t.id AND h.keyword=k.keyword AND h.domain=lower(replace(c.domain,'www.','')) ORDER BY h.checked_at DESC LIMIT 1) AS last_check FROM seo_rank_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id JOIN clients c ON c.id=t.client_id WHERE t.client_id=? ORDER BY k.keyword,t.location,t.device LIMIT 1000").bind(id));}
async function state(env,c){
 const [tracked,spend,discovery,cache]=await Promise.all([targets(env,c.id),usage(env),env.DB.prepare('SELECT enabled,status,attempted_at FROM seo_backlink_discovery WHERE client_id=?').bind(c.id).first(),all(env.DB.prepare("SELECT kind,request_key,payload,fetched_at FROM seo_provider_cache WHERE client_id=? AND kind IN ('ideas','overview','competitor','backlinks') ORDER BY fetched_at DESC LIMIT 12").bind(c.id))]);
 return {domain:host(c.domain),config:providerConfig(env),spend,tracked,discovery:discovery||{enabled:0,status:'pending'},cache:cache.map(x=>({kind:x.kind,key:x.request_key,fetched_at:x.fetched_at,...JSON.parse(x.payload)}))};
}
export async function paidSeoRoute(req,env,user,url){
 const prefix='/api/admin/seo-provider';
 if(!url.pathname.startsWith(prefix))return null;
 if(!user?.admin)return response({error:'Agency access only.'},403);
 const c=await allowedClient(env,user,clean(url.searchParams.get('client'),100));
 if(!c)return response({error:'Business not found.'},404);
 const p=url.pathname.slice(prefix.length),m=req.method;
 try{
  if(!p&&m==='GET')return response(await state(env,c));
  const match=p.match(/^\/targets\/([a-f0-9-]{36})(\/check|\/history)?$/);
  if(match){
   const t=await env.DB.prepare('SELECT t.*,k.keyword FROM seo_rank_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id WHERE t.id=? AND t.client_id=?').bind(match[1],c.id).first();
   if(!t)fail('Rank target not found.',404);
   if(m==='GET'&&match[2]==='/history'){
    const history=await all(env.DB.prepare('SELECT * FROM seo_rank_history WHERE target_id=? ORDER BY checked_at DESC LIMIT 104').bind(t.id));
    return response({history:history.map(x=>({...x,rivals:JSON.parse(x.rivals)}))});
   }
   if(m==='DELETE'&&!match[2]){await env.DB.prepare('DELETE FROM seo_rank_targets WHERE id=? AND client_id=?').bind(t.id,c.id).run();return response({});}
   if(m==='POST'&&match[2]==='/check')return response(await checkRank(env,c,t));
   if(m==='PATCH'&&!match[2]){const b=await readBody(req);await env.DB.prepare('UPDATE seo_rank_targets SET enabled=? WHERE id=? AND client_id=?').bind(b.enabled===true?1:0,t.id,c.id).run();return response({});}
  }
  if(m!=='POST')fail('Not found.',404);
  const b=await readBody(req);
  if(p==='/targets'){
   const k=await env.DB.prepare('SELECT id,keyword FROM seo_keywords WHERE id=? AND client_id=?').bind(clean(b.keyword_id,100),c.id).first();if(!k)fail('Save the keyword in Keyword Manager first.',404);
   keyword(k.keyword);const l=location(b.location),device=b.device==='mobile'?'mobile':'desktop';
   const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM seo_rank_targets WHERE client_id=?').bind(c.id).first();if(Number(count.n)>=1000)fail('Rank target limit reached.');
   await env.DB.prepare('INSERT OR IGNORE INTO seo_rank_targets(id,client_id,keyword_id,location,device,enabled) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),c.id,k.id,l,device,b.enabled===true?1:0).run();return response({},201);
  }
  if(p==='/backlink-settings'){await env.DB.prepare('INSERT INTO seo_backlink_discovery(client_id,enabled) VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET enabled=excluded.enabled').bind(c.id,b.enabled===true?1:0).run();return response({});}
  if(p==='/backlinks')return response(await discover(env,c,b.force===true));
  if(p==='/ideas'||p==='/overview'){
   const kind=p.slice(1),terms=Array.isArray(b.keywords)?b.keywords:[b.keyword];
   if(terms.length<1||terms.length>20)fail('Use 1–20 seed keywords.');
   const ks=[...new Map(terms.map(x=>{const k=keyword(x);return [keywordKey(k),k];})).values()],l=location(b.location);
   const params={keywords:ks,location_name:l,language_code:'en',include_serp_info:false};
   if(kind==='ideas')params.limit=100;
   return response(await requestProvider(env,c.id,kind,JSON.stringify([ks,l]),params,null,b.force===true));
  }
  if(p==='/competitor'){
   const d=host(b.domain),l=location(b.location);
   return response(await requestProvider(env,c.id,'competitor',JSON.stringify([d,l]),{target:d,location_name:l,language_code:'en',limit:100,filters:['ranked_serp_element.serp_item.type','=','organic']},d,b.force===true));
  }
  fail('Not found.',404);
 }catch(e){if(e instanceof ProviderError)return response({error:e.message},e.status);console.error('SEO provider route unavailable');return response({error:'Unable to complete the SEO request.'},500);}
}
export async function runPaidSeoSchedule(env){
 const c=providerConfig(env);if(!c.enabled||!c.configured||!c.cap)return;
 const due=await all(env.DB.prepare("SELECT t.*,k.keyword,c.domain FROM seo_rank_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id JOIN clients c ON c.id=t.client_id WHERE c.active=1 AND t.enabled=1 AND (t.attempted_at IS NULL OR t.attempted_at<datetime('now','-7 days')) ORDER BY COALESCE(t.attempted_at,''),t.id LIMIT 8"));
 // Parallel bounded requests; ledger reservations are atomic across clients.
 await Promise.allSettled(due.map(t=>checkRank(env,{id:t.client_id,domain:t.domain},t)));
 const links=await all(env.DB.prepare("SELECT c.id,c.domain FROM seo_backlink_discovery b JOIN clients c ON c.id=b.client_id WHERE c.active=1 AND b.enabled=1 AND (b.attempted_at IS NULL OR b.attempted_at<datetime('now','-7 days')) ORDER BY COALESCE(b.attempted_at,''),c.id LIMIT 1"));
 for(const c of links){
  const claim=await env.DB.prepare("UPDATE seo_backlink_discovery SET attempted_at=datetime('now'),status='running' WHERE client_id=? AND enabled=1 AND (attempted_at IS NULL OR attempted_at<datetime('now','-7 days'))").bind(c.id).run();if((claim.meta?.changes??claim.changes??0)!==1)continue;
  try{await discover(env,c,true);await env.DB.prepare("UPDATE seo_backlink_discovery SET status='ok' WHERE client_id=?").bind(c.id).run();}
  catch{await env.DB.prepare("UPDATE seo_backlink_discovery SET status='error' WHERE client_id=?").bind(c.id).run();}
 }
}
