import {allowedClient,validProperty} from './gsc.js';
import {keywordKey,siteUrl} from './seo-workspace.js';
const str=(v,n=200)=>String(v??'').trim().slice(0,n);
const all=async q=>(await q.all()).results||[];
const reply=(data,status=200)=>new Response(JSON.stringify({ok:status<400,...data}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(error,status=400)=>reply({error},status);
function day(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
export function monthBounds(date=new Date()){
 const start=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)),previous=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-1,1));
 const iso=x=>x.toISOString().slice(0,10);
 return {month:iso(start).slice(0,7),start:iso(start),previousStart:iso(previous),today:iso(date)};
}
function totals(rows){
 if(!rows.length)return null;
 const clicks=rows.reduce((n,r)=>n+r.clicks,0),impressions=rows.reduce((n,r)=>n+r.impressions,0);
 return {clicks,impressions,ctr:impressions?clicks/impressions:null,position:impressions?rows.reduce((n,r)=>n+r.position*r.impressions,0)/impressions:null,days:rows.length};
}
export function monthPerformance(rows,dates){
 const current=rows.filter(r=>r.day>=dates.start&&r.day<=dates.today).sort((a,b)=>a.day.localeCompare(b.day));
 const prev=new Map(rows.filter(r=>r.day>=dates.previousStart&&r.day<dates.start).map(r=>[r.day.slice(-2),r]));
 const matched=current.filter(r=>prev.has(r.day.slice(-2)));
 return {current:totals(current),through:current.at(-1)?.day??null,first:current[0]?.day??null,
  matchedCurrent:totals(matched),matchedPrevious:totals(matched.map(r=>prev.get(r.day.slice(-2)))),
  previousMonth:dates.previousStart.slice(0,7)};
}
export function rankMovement(latest,baseline,monthStart){
 if(!latest||latest.checked_at.slice(0,10)<monthStart||!baseline||latest.checked_at<=baseline.checked_at)return {change:null,label:'Not enough checks this month'};
 if(latest.position===null&&baseline.position===null)return {change:null,label:'Not found in either sample'};
 if(latest.position===null)return {change:null,label:'No longer found in sampled results'};
 if(baseline.position===null)return {change:null,label:'Now found in sampled results'};
 const n=baseline.position-latest.position;
 return {change:n,label:n>0?'Up '+n:n<0?'Down '+Math.abs(n):'Unchanged'};
}
const sample=(row,prefix)=>row[prefix+'_at']?{checked_at:row[prefix+'_at'],position:row[prefix+'_position'],result_count:row[prefix+'_count'],url:prefix==='latest'?row.latest_url||null:undefined}:null;
async function progress(env,c,user){
 const dates=monthBounds(),domain=c.domain.toLowerCase().replace(/^www\./,'');
 const [keys,rankRows,sync,daily,updates,tasks]=await Promise.all([
  all(env.DB.prepare('SELECT k.id,k.keyword,k.keyword_key,k.service,k.location,k.target_url,s.slot AS client_slot FROM seo_keywords k LEFT JOIN seo_client_keyword_slots s ON s.client_id=k.client_id AND s.keyword_id=k.id WHERE k.client_id=? AND (?=1 OR s.slot IS NOT NULL) ORDER BY CASE WHEN ?=1 THEN 0 ELSE s.slot END,k.keyword_key LIMIT 1000').bind(c.id,user.admin?1:0,user.admin?1:0)),
  all(env.DB.prepare(`SELECT t.id,t.keyword_id,t.location,t.device,t.enabled,t.status,
    l.checked_at AS latest_at,l.position AS latest_position,l.result_count AS latest_count,l.url AS latest_url,
    b.checked_at AS baseline_at,b.position AS baseline_position,b.result_count AS baseline_count
   FROM seo_rank_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id
   LEFT JOIN seo_rank_history l ON l.target_id=t.id AND l.checked_at=(SELECT MAX(h.checked_at) FROM seo_rank_history h WHERE h.target_id=t.id AND h.keyword=k.keyword AND h.domain=?)
   LEFT JOIN seo_rank_history b ON b.target_id=t.id AND b.checked_at=COALESCE(
    (SELECT MAX(h.checked_at) FROM seo_rank_history h WHERE h.target_id=t.id AND h.keyword=k.keyword AND h.domain=? AND h.checked_at>=? AND h.checked_at<?),
    (SELECT MIN(h.checked_at) FROM seo_rank_history h WHERE h.target_id=t.id AND h.keyword=k.keyword AND h.domain=? AND h.checked_at>=?))
   WHERE t.client_id=? AND (?=1 OR EXISTS(SELECT 1 FROM seo_client_keyword_slots s WHERE s.client_id=t.client_id AND s.keyword_id=t.keyword_id)) ORDER BY k.keyword_key,t.location,t.device LIMIT 1000`).bind(domain,domain,dates.previousStart,dates.start,domain,dates.start,c.id,user.admin?1:0)),
  env.DB.prepare('SELECT property,snapshot,synced_at FROM seo_sync WHERE client_id=?').bind(c.id).first(),
  all(env.DB.prepare('SELECT day,clicks,impressions,ctr,position FROM seo_daily WHERE client_id=? AND day>=? AND day<=? ORDER BY day').bind(c.id,dates.previousStart,dates.today)),
  all(env.DB.prepare('SELECT id,title,detail,completed_on,published_at FROM seo_client_updates WHERE client_id=? AND completed_on>=? AND completed_on<=? ORDER BY completed_on DESC,published_at DESC LIMIT 100').bind(c.id,dates.start,dates.today)),
  user.admin?all(env.DB.prepare("SELECT t.task_key,t.title,t.updated_at,u.id AS update_id FROM seo_action_tasks t LEFT JOIN seo_client_updates u ON u.client_id=t.client_id AND u.source_task_key=t.task_key WHERE t.client_id=? AND t.status='done' ORDER BY t.updated_at DESC LIMIT 100").bind(c.id)):Promise.resolve([])
 ]);
 const same=sync?.property===c.gsc_property&&validProperty(c.gsc_property,c.domain);
 let snapshot=null;if(same&&sync.snapshot)try{snapshot=JSON.parse(sync.snapshot);}catch{}
 const queries=new Map((snapshot?.current||[]).map(x=>[keywordKey(x.query),x]));
 const byId=new Map();
 for(const row of rankRows){
  const latest=sample(row,'latest'),baseline=sample(row,'baseline');
  const t={id:row.id,location:row.location,device:row.device,enabled:!!row.enabled,status:row.status==='ok'?'checked':row.status==='error'?'check unavailable':row.status==='running'?'checking':'pending',latest,baseline,movement:rankMovement(latest,baseline,dates.start)};
  if(!byId.has(row.keyword_id))byId.set(row.keyword_id,[]);byId.get(row.keyword_id).push(t);
 }
 const safePage=v=>siteUrl(v,[c.domain])||null;
 const keywords=keys.map(k=>{
  const q=queries.get(k.keyword_key),targets=(byId.get(k.id)||[]).map(t=>({...t,latest:t.latest?{...t.latest,url:safePage(t.latest.url)}:null}));
  return {id:k.id,keyword:k.keyword,service:k.service,location:k.location,target_url:safePage(k.target_url),...(user.admin?{client_slot:k.client_slot??null}:{}),search_console:q?{clicks:q.clicks,impressions:q.impressions,position:q.position,ctr:q.ctr}:null,targets};
 });
 return {business:{name:c.name,domain:c.domain},month:dates.month,performance:monthPerformance(same?daily:[],dates),
  search_console_period:snapshot?{from:snapshot.from,to:snapshot.to,synced_at:sync.synced_at}:null,
  keywords,counts:{saved:keywords.length,monitored:keywords.filter(k=>k.targets.some(t=>t.enabled)).length,improved:keywords.filter(k=>k.targets.some(t=>t.movement.change>0||t.movement.label==='Now found in sampled results')).length},
  updates,client_keyword_limit:5,...(user.admin?{client_keyword_ids:keys.filter(k=>k.client_slot!==null).sort((a,b)=>a.client_slot-b.client_slot).map(k=>k.id),tasks:tasks.map(t=>({key:t.task_key,title:t.title,updated_at:t.updated_at,shared:!!t.update_id}))}:{})};
}
async function body(req){
 if(!req.headers.get('content-type')?.startsWith('application/json'))throw Error('JSON required');
 const s=await req.text();if(s.length>45000)throw Error('Request too large');
 const b=JSON.parse(s);if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Invalid JSON');return b;
}
export async function seoProgressRoute(req,env,user,url){
 const prefix='/api/seo-progress';
 if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return null;
 const c=await allowedClient(env,user,str(url.searchParams.get('client'),100));
 if(!c)return fail('Business not found.',404);
 const path=url.pathname.slice(prefix.length),method=req.method;
 if(!path&&method==='GET')return reply(await progress(env,c,user));
 if(!user.admin)return fail('Agency access only.',403);
 const update=path.match(/^\/updates\/([a-f0-9-]{36})$/);
 if(update&&method==='DELETE'){
  await env.DB.prepare('DELETE FROM seo_client_updates WHERE client_id=? AND id=?').bind(c.id,update[1]).run();return reply({});
 }
 if(method!=='POST')return fail('Not found.',404);
 let b;try{b=await body(req);}catch{return fail('Invalid or oversized request.');}
 if(path==='/client-keywords'){
  if(!Array.isArray(b.keyword_ids)||b.keyword_ids.length>5||b.keyword_ids.some(x=>typeof x!=='string'||!x.trim()||x.length>100))return fail('Choose up to five saved keywords for the client.');
  const ids=b.keyword_ids.map(x=>x.trim());
  if(new Set(ids).size!==ids.length)return fail('Choose a different keyword for each slot.');
  if(ids.length){
   const rows=await all(env.DB.prepare('SELECT id FROM seo_keywords WHERE client_id=? AND id IN ('+ids.map(()=>'?').join(',')+')').bind(c.id,...ids));
   if(rows.length!==ids.length)return fail('One or more keywords do not belong to this business.',404);
  }
  // Replace the complete selection atomically. Slot constraints enforce the five-keyword maximum even during concurrent writes.
  const changes=[env.DB.prepare('DELETE FROM seo_client_keyword_slots WHERE client_id=?').bind(c.id)];
  ids.forEach((id,i)=>changes.push(env.DB.prepare('INSERT INTO seo_client_keyword_slots(client_id,slot,keyword_id) VALUES(?,?,?)').bind(c.id,i+1,id)));
  await env.DB.batch(changes);
  return reply({selected:ids.length});
 }
 if(path==='/track'){
  const ids=Array.isArray(b.keyword_ids)?[...new Set(b.keyword_ids.map(x=>str(x,100)))]:[];
  if(!ids.length||ids.length>50)return fail('Select 1–50 saved keywords per batch.');
  const location=str(b.location,180)||'United Kingdom',device=b.device==='mobile'?'mobile':'desktop';
  if(!/^[\p{L}\p{N} ,.'()\-]+$/u.test(location))return fail('Enter the provider’s full search location.');
  const rows=await all(env.DB.prepare("SELECT id,keyword FROM seo_keywords WHERE client_id=? AND id IN ("+ids.map(()=>'?').join(',')+")").bind(c.id,...ids));
  if(rows.length!==ids.length)return fail('One or more keywords do not belong to this business.',404);
  if(rows.some(r=>/[+:％%]|[\u0000-\u001f]/.test(r.keyword)))return fail('Remove search operators and special encoding before tracking.');
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM seo_rank_targets WHERE client_id=?').bind(c.id).first();
  if(Number(count.n)+ids.length>1000)return fail('Rank target limit reached.');
  // Existing targets remain unchanged; only explicitly opted-in new targets may run paid checks.
  const q=rows.map(r=>env.DB.prepare('INSERT OR IGNORE INTO seo_rank_targets(id,client_id,keyword_id,location,device,enabled) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),c.id,r.id,location,device,b.enabled===true?1:0));
  await env.DB.batch(q);return reply({processed:rows.length},201);
 }
 if(path==='/updates'){
  const title=str(b.title,180),detail=str(b.detail,1200),on=str(b.completed_on,10),taskKey=str(b.task_key,2000)||null;
  if(title.length<4||!day(on)||on>monthBounds().today)return fail('Enter a clear completed-work title and a valid date no later than today.');
  if(b.confirm_share!==true)return fail('Confirm the wording is suitable to share with this client.');
  if(taskKey){
   const task=await env.DB.prepare("SELECT task_key FROM seo_action_tasks WHERE client_id=? AND task_key=? AND status='done'").bind(c.id,taskKey).first();
   if(!task)return fail('Only completed work from this business can be shared.',404);
   const old=await env.DB.prepare('SELECT id FROM seo_client_updates WHERE client_id=? AND source_task_key=?').bind(c.id,taskKey).first();
   if(old)return fail('This task already has a shared update.',409);
  }
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO seo_client_updates(id,client_id,title,detail,completed_on,source_task_key) VALUES(?,?,?,?,?,?)').bind(id,c.id,title,detail,on,taskKey).run();
  return reply({id},201);
 }
 return fail('Not found.',404);
}
