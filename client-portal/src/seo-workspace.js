import {allowedClient,validProperty,getSeoWorkspaceMetrics} from './gsc.js';
const reply=(data,status=200)=>new Response(JSON.stringify({ok:status<400,...data}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(error,status=400)=>reply({error},status);
const clean=(v,n)=>String(v??'').trim().slice(0,n);
const all=async(q)=>(await q.all()).results||[];
const statuses=new Set(['prospect','contacted','follow-up','secured','declined']);
const day=v=>{const t=clean(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(t)&&!isNaN(Date.parse(t))&&new Date(t).toISOString().slice(0,10)===t?t:'';};
export function keywordKey(v){return clean(v,200).replace(/\s+/g,' ').toLowerCase();}
export function publicUrl(value){
  try{
    const u=new URL(String(value??'').trim());
    // Only public HTTPS hostname URLs, default port, no credentials or fragments.
    const h=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.href.length>1500||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(h)||h.includes('..')||
      /(?:^|\.)(?:localhost|local|internal|intranet|home|lan|test|invalid|example|onion)$/.test(h))return null;
    return u.href;
  }catch{return null;}
}
export function siteUrl(value,domains){
  const v=publicUrl(value);if(!v)return null;
  const h=new URL(v).hostname.replace(/^www\./,'');
  return domains.some(d=>String(d).toLowerCase().replace(/^www\./,'')===h)?v:null;
}
function matchLink(href,source,target){
  try{const a=new URL(href,source),b=new URL(target);a.hash='';b.hash='';
    return ['https:','http:'].includes(a.protocol)&&a.hostname.replace(/^www\./,'')===b.hostname.replace(/^www\./,'')&&
      a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')&&a.search===b.search;
  }catch{return false;}
}
export {matchLink};
async function body(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('JSON required');
  const v=await request.text();if(new TextEncoder().encode(v).length>80000)throw Error('Request too large');
  const b=JSON.parse(v);if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Invalid request');return b;
}
async function record(env,user,clientId,event,id){
  await env.DB.prepare('INSERT INTO audit_log(id,actor_email,event,client_id,resource_id) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),user.email,event,clientId,id||null).run();
}
async function domainsFor(env,client){
  const found=await all(env.DB.prepare('SELECT domain FROM sites WHERE client_id=? AND active=1').bind(client.id));
  return [client.domain,...found.map(x=>x.domain)];
}
async function workspace(env,client){
  const id=client.id;
  const [keywords,links,sync,daily]=await Promise.all([
    all(env.DB.prepare('SELECT * FROM seo_keywords WHERE client_id=? ORDER BY keyword_key LIMIT 1000').bind(id)),
    all(env.DB.prepare('SELECT * FROM seo_backlinks WHERE client_id=? ORDER BY created_at DESC,id LIMIT 500').bind(id)),
    env.DB.prepare('SELECT * FROM seo_sync WHERE client_id=?').bind(id).first(),
    all(env.DB.prepare('SELECT * FROM seo_daily WHERE client_id=? ORDER BY day DESC LIMIT 365').bind(id))
  ]);
  const same=sync?.property===client.gsc_property;
  let snapshot=null;if(same&&sync?.snapshot)try{snapshot=JSON.parse(sync.snapshot);}catch{}
  return {keywords,links,daily:same?daily.reverse():[],snapshot,
    sync:{status:same?sync?.status||'pending':'pending',attempted_at:same?sync?.attempted_at||null:null,synced_at:same?sync?.synced_at||null:null},
    configured:Boolean(env.GSC_SERVICE_ACCOUNT_JSON&&validProperty(client.gsc_property,client.domain))};
}
export async function syncSeoClient(env,client){
  const id=client.id, property=client.gsc_property||'';
  if(!env.GSC_SERVICE_ACCOUNT_JSON||!validProperty(property,client.domain))return 'not-configured';
  const old=await env.DB.prepare('SELECT property FROM seo_sync WHERE client_id=?').bind(id).first();
  if(old&&old.property!==property){
    await env.DB.batch([env.DB.prepare('DELETE FROM seo_daily WHERE client_id=?').bind(id),env.DB.prepare('DELETE FROM seo_sync WHERE client_id=?').bind(id)]);
  }
  await env.DB.prepare("INSERT INTO seo_sync(client_id,property,attempted_at,status) VALUES(?,?,datetime('now'),'running') ON CONFLICT(client_id) DO UPDATE SET attempted_at=datetime('now'),status='running'").bind(id,property).run();
  try{
    const data=await getSeoWorkspaceMetrics(env,client);
    if(!data)throw Error('not configured');
    // Discard if the business property was changed during the network request.
    const current=await env.DB.prepare('SELECT gsc_property FROM clients WHERE id=? AND active=1').bind(id).first();
    if(current?.gsc_property!==property)return 'changed';
    const stmts=[];
    // Use <= 90 bound parameters per statement (D1 limit is 100).
    for(let i=0;i<data.daily.length;i+=15){
      const rows=data.daily.slice(i,i+15);
      stmts.push(env.DB.prepare('INSERT INTO seo_daily(client_id,day,clicks,impressions,ctr,position) VALUES '+rows.map(()=>'(?,?,?,?,?,?)').join(',')+' ON CONFLICT(client_id,day) DO UPDATE SET clicks=excluded.clicks,impressions=excluded.impressions,ctr=excluded.ctr,position=excluded.position')
        .bind(...rows.flatMap(row=>[id,row.day,row.clicks,row.impressions,row.ctr,row.position])));
    }
    const {daily,...snapshot}=data;
    stmts.push(env.DB.prepare("UPDATE seo_sync SET snapshot=?,synced_at=datetime('now'),status='ok' WHERE client_id=? AND property=?").bind(JSON.stringify(snapshot),id,property));
    await env.DB.batch(stmts);
    return 'ok';
  }catch{
    await env.DB.prepare("UPDATE seo_sync SET status='error' WHERE client_id=? AND property=?").bind(id,property).run();
    return 'error';
  }
}
async function checkBacklink(env,row){
  let result='unverified',rel='';
  try{
    const source=publicUrl(row.source_url);
    if(!source||new URL(source).search)throw Error('unsafe source');
    // No redirects, cookies, credentials or internal service bindings. Bounded public HTML only.
    const res=await fetch(source,{redirect:'manual',headers:{accept:'text/html','user-agent':'PrunusSEO/1.0 (link verification)'},signal:AbortSignal.timeout(8000)});
    if(res.status===404||res.status===410){result='page-missing';await res.body?.cancel();}
    else if(!res.ok||!res.headers.get('content-type')?.toLowerCase().includes('text/html')){await res.body?.cancel();}
    else{
      const reader=res.body?.getReader();if(!reader)throw Error('missing body');
      let bytes=0;const chunks=[];
      try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1000000)throw Error('large page');chunks.push(value);}}
      finally{await reader.cancel().catch(()=>{});}
      const html=await new Blob(chunks).text();let found=false;const relations=new Set();
      const transformed=new HTMLRewriter().on('a[href]',{element(el){
        if(matchLink(el.getAttribute('href'),source,row.target_url)){found=true;for(const t of (el.getAttribute('rel')||'').toLowerCase().split(/\s+/))if(['nofollow','sponsored','ugc'].includes(t))relations.add(t);}
      }}).transform(new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}}));
      await transformed.arrayBuffer();
      result=found?'found':'not-seen';rel=[...relations].join(' ');
    }
  }catch{}
  await env.DB.prepare("UPDATE seo_backlinks SET check_status=?,link_rel=?,checked_at=datetime('now') WHERE id=? AND client_id=? AND source_url=? AND target_url=?").bind(result,rel,row.id,row.client_id,row.source_url,row.target_url).run();
  return result;
}
export async function runSeoSchedule(env){
  if(env.GSC_SERVICE_ACCOUNT_JSON){
    const clients=await all(env.DB.prepare("SELECT c.id,c.domain,c.gsc_property FROM clients c LEFT JOIN seo_sync s ON s.client_id=c.id WHERE c.active=1 AND COALESCE(c.gsc_property,'')<>'' AND (s.attempted_at IS NULL OR s.property<>c.gsc_property OR s.attempted_at<datetime('now','-23 hours')) ORDER BY COALESCE(s.attempted_at,'') LIMIT 2"));
    for(const client of clients)await syncSeoClient(env,client);
  }
  // Opt-in only. Limit external requests; oldest due links first.
  const links=await all(env.DB.prepare("SELECT b.* FROM seo_backlinks b JOIN clients c ON c.id=b.client_id WHERE c.active=1 AND b.monitor=1 AND (b.checked_at IS NULL OR b.checked_at<datetime('now','-7 days')) ORDER BY COALESCE(b.checked_at,'') LIMIT 2"));
  for(const link of links)await checkBacklink(env,link);
}
export async function seoWorkspaceRoute(request,env,user,url){
  if(!url.pathname.startsWith('/api/admin/seo-workspace'))return null;
  if(!user?.admin)return fail('Agency access only.',403);
  const client=await allowedClient(env,user,clean(url.searchParams.get('client'),100));
  if(!client)return fail('Business not found.',404);
  const path=url.pathname.slice('/api/admin/seo-workspace'.length),method=request.method,id=client.id;
  if(path===''&&method==='GET')return reply(await workspace(env,client));
  if(path==='/sync'&&method==='POST'){
    const status=await syncSeoClient(env,client);
    return status==='ok'?reply(await workspace(env,client)):fail(status==='not-configured'?'Connect the existing Search Console property and service account first.':'Search Console sync failed; existing results are retained.',status==='not-configured'?409:502);
  }
  const item=path.match(/^\/(keywords|backlinks)\/([a-f0-9-]{36})(\/check)?$/);
  if(item&&method==='DELETE'&&!item[3]){
    const table=item[1]==='keywords'?'seo_keywords':'seo_backlinks';
    await env.DB.prepare('DELETE FROM '+table+' WHERE id=? AND client_id=?').bind(item[2],id).run();
    await record(env,user,id,'seo.delete.'+item[1],item[2]);return reply({});
  }
  if(item&&item[1]==='backlinks'&&item[3]&&method==='POST'){
    const row=await env.DB.prepare('SELECT * FROM seo_backlinks WHERE id=? AND client_id=?').bind(item[2],id).first();
    if(!row)return fail('Link not found.',404);
    if(row.checked_at&&Date.now()-Date.parse(row.checked_at.replace(' ','T')+'Z')<60000)return fail('Please allow one minute between checks.',429);
    return reply({status:await checkBacklink(env,row)});
  }
  if(!['POST','PATCH'].includes(method))return fail('Not found.',404);
  let data;try{data=await body(request);}catch{return fail('Invalid or oversized request.');}
  const domains=await domainsFor(env,client);
  if(path==='/keywords'&&method==='POST'){
    const input=Array.isArray(data.keywords)?data.keywords:[data];if(input.length>200)return fail('Import up to 200 keywords at a time.');
    const existing=await env.DB.prepare('SELECT COUNT(*) AS n FROM seo_keywords WHERE client_id=?').bind(id).first();
    if(Number(existing.n)+input.length>1000)return fail('The first version supports 1,000 keywords per business.');
    const rows=[];
    for(const x of input){
      const k=clean(typeof x==='string'?x:x?.keyword,200).replace(/\s+/g,' ');if(!k)continue;
      const raw=clean(x?.target_url,1500),target=raw?siteUrl(raw,domains):'';
      if(raw&&!target)return fail('Target page must belong to this business.');
      rows.push(env.DB.prepare('INSERT OR IGNORE INTO seo_keywords(id,client_id,keyword,keyword_key,service,location,target_url) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,k,keywordKey(k),clean(x?.service,100),clean(x?.location,100),target));
    }
    // D1 batches are transactional in chunks; no paid calls.
    for(let i=0;i<rows.length;i+=50)await env.DB.batch(rows.slice(i,i+50));
    await record(env,user,id,'seo.keywords.import');return reply({processed:rows.length},201);
  }
  if(item&&item[1]==='keywords'&&method==='PATCH'&&!item[3]){
    const k=clean(data.keyword,200).replace(/\s+/g,' '),raw=clean(data.target_url,1500),target=raw?siteUrl(raw,domains):'';
    if(!k||raw&&!target)return fail('Enter a keyword and a valid business target page.');
    const row=await env.DB.prepare('SELECT id FROM seo_keywords WHERE id=? AND client_id=?').bind(item[2],id).first();
    if(!row)return fail('Keyword not found.',404);
    const dup=await env.DB.prepare('SELECT id FROM seo_keywords WHERE client_id=? AND keyword_key=? AND id<>?').bind(id,keywordKey(k),item[2]).first();
    if(dup)return fail('Keyword already exists.',409);
    await env.DB.prepare('UPDATE seo_keywords SET keyword=?,keyword_key=?,service=?,location=?,target_url=? WHERE id=? AND client_id=?').bind(k,keywordKey(k),clean(data.service,100),clean(data.location,100),target,item[2],id).run();
    await record(env,user,id,'seo.keyword.update',item[2]);return reply({});
  }
  if((path==='/backlinks'&&method==='POST')||(item&&item[1]==='backlinks'&&!item[3]&&method==='PATCH')){
    const source=publicUrl(data.source_url),target=siteUrl(data.target_url,domains);
    if(!source||!target||new URL(source).search)return fail('Use public HTTPS source pages without query parameters and a target on this business.');
    const status=clean(data.outreach_status,30)||'prospect';
    if(!statuses.has(status))return fail('Invalid outreach status.');
    const contacted=day(data.contacted_on),follow=day(data.follow_up_on);
    if(data.contacted_on&&!contacted||data.follow_up_on&&!follow)return fail('Invalid date.');
    const values=[source,target,clean(data.contact,200),status,contacted,follow,clean(data.notes,2000),data.monitor===true?1:0];
    const existing=await env.DB.prepare('SELECT id FROM seo_backlinks WHERE client_id=? AND source_url=? AND target_url=?').bind(id,source,target).first();
    if(existing&&existing.id!==item?.[2])return fail('This link is already saved.',409);
    let rid=item?.[2]||crypto.randomUUID();
    if(item){
      const row=await env.DB.prepare('SELECT source_url,target_url FROM seo_backlinks WHERE id=? AND client_id=?').bind(rid,id).first();
      if(!row)return fail('Link not found.',404);
      const changed=row.source_url!==source||row.target_url!==target;
      await env.DB.prepare("UPDATE seo_backlinks SET source_url=?,target_url=?,contact=?,outreach_status=?,contacted_on=?,follow_up_on=?,notes=?,monitor=?,check_status=CASE WHEN ? THEN 'unchecked' ELSE check_status END,checked_at=CASE WHEN ? THEN NULL ELSE checked_at END,link_rel=CASE WHEN ? THEN '' ELSE link_rel END WHERE id=? AND client_id=?").bind(...values,+changed,+changed,+changed,rid,id).run();
    }else{
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM seo_backlinks WHERE client_id=?').bind(id).first();if(Number(count.n)>=500)return fail('The first version supports 500 links per business.');
      await env.DB.prepare('INSERT INTO seo_backlinks(id,client_id,source_url,target_url,contact,outreach_status,contacted_on,follow_up_on,notes,monitor) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(rid,id,...values).run();
    }
    await record(env,user,id,'seo.backlink.save',rid);return reply({id:rid},item?200:201);
  }
  return fail('Not found.',404);
}
