// Source discovery for the existing per-client weekly research queue.
// Discovery uses Brave Search if configured, never claims snippets are verified
// facts, never writes unpublished client data to another tenant, never publishes.
import { allowedClient } from './gsc.js';
const json=(body,status=200)=>new Response(JSON.stringify({ok:status<400,...body}),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
const trimmed=(value,limit=300)=>String(value??'').trim().slice(0,limit);
const domainCheck=host=>/^(?!-)[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)&&!host.includes('..')&&!/(^|\.)localhost$|(^|\.)local$|(^|\.)internal$/.test(host);
export function safeResult(candidate){
  try{
    const url=new URL(trimmed(candidate?.url,700));
    if(url.protocol!=='https:'||url.username||url.password||!domainCheck(url.hostname))return null;
    const title=trimmed(candidate?.title,180);
    if(title.length<8)return null;
    return {title,url:url.href,description:trimmed(candidate.description,500),origin:url.hostname,
      status:'candidate-not-verified',checked_at:null};
  }catch{return null;}
}
function discoveryQuery(client){
  const industry=trimmed(client.industry,100).replace(/[\r\n\t"<>]/g,' ');
  const location=trimmed(client.service_area,95).replace(/[\r\n\t"<>]/g,' ');
  if(industry.length<4)return '';
  return (industry+' '+(location||'UK')+' customer guidance common questions official advice').slice(0,220);
}
async function braveDiscover(env,query){
  if(!env.BRAVE_SEARCH_API_KEY)throw Error('Brave Search API key not configured.');
  const url=new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q',query);
  url.searchParams.set('country','GB');
  url.searchParams.set('search_lang','en');
  url.searchParams.set('count','12');
  url.searchParams.set('safesearch','moderate');
  const res=await fetch(url,{headers:{'x-subscription-token':env.BRAVE_SEARCH_API_KEY,'accept':'application/json'}});
  if(!res.ok)throw Error('Source search provider failed ('+res.status+').');
  const payload=await res.json();
  const seen=new Set(),sources=[];
  for(const item of payload.web?.results||[]){
    const parsed=safeResult(item);
    if(!parsed||seen.has(parsed.url))continue;
    seen.add(parsed.url);sources.push(parsed);
    if(sources.length>=10)break;
  }
  return sources;
}
async function storeDiscovery(env,job,client){
  const query=discoveryQuery(client);
  if(!query)throw Error('Add the real industry or niche to this client before researching.');
  const sources=await braveDiscover(env,query);
  if(!sources.length)throw Error('Search returned no usable sources; try refining client industry.');
  const now=new Date().toISOString();
  await env.DB.prepare(
    "UPDATE research_jobs SET status='working',discovery_query=?,candidate_sources_json=?,discovered_at=?,updated_at=datetime('now') WHERE id=?"
  ).bind(query,JSON.stringify(sources),now,job.id).run();
  return {id:job.id,client_id:job.client_id,query,sources,discovered_at:now};
}
export async function discoverResearch(env,jobId){
  const job=await env.DB.prepare('SELECT id,client_id,status FROM research_jobs WHERE id=?').bind(jobId).first();
  if(!job)return {error:'Research task not found.',status:404};
  if(job.status==='complete')return {error:'Research is marked complete. Reopen it first before refreshing sources.',status:409};
  const client=await allowedClient(env,{admin:true,email:'agency@prunusmedia.com'},job.client_id);
  if(!client)return {error:'Client is no longer active.',status:404};
  try{return await storeDiscovery(env,job,client);}
  catch(err){
    // Fail without forging verified notes; admins can retry.
    await env.DB.prepare("UPDATE research_jobs SET status='failed',updated_at=datetime('now') WHERE id=?").bind(job.id).run();
    const msg=trimmed(err.message,200);
    return {error:msg,status:msg.includes('not configured')?503:502};
  }
}
export async function runAutomaticDiscovery(env,limit=2){
  // Turning on a separate Brave secret explicitly opts into external research.
  if(!env.DB||!env.BRAVE_SEARCH_API_KEY)return {processed:0,disabled:true};
  const jobs=(await env.DB.prepare(
    "SELECT id FROM research_jobs WHERE status='queued' ORDER BY week_start,id LIMIT ?"
  ).bind(Math.min(Math.max(1,limit),3)).all()).results;
  let done=0,failed=0;
  for(const job of jobs){
    const result=await discoverResearch(env,job.id);
    if(result.error)failed++;else done++;
  }
  return {processed:done,failed};
}
export async function researchDiscoveryRoute(request,env,user,url){
  const path=url.pathname, match=path.match(/^\/api\/admin\/research\/([a-f0-9-]{36})\/discover$/);
  if(!match||request.method!=='POST')return null;
  if(!user?.admin)return json({error:'Forbidden.'},403);
  const result=await discoverResearch(env,match[1]);
  return result.error?json({error:result.error},result.status):json(result);
}
