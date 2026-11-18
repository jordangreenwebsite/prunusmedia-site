import {allowedClient,getSeoMonthlyMetrics} from './gsc.js';
import {keywordKey,siteUrl} from './seo-workspace.js';
import {auditSite} from './seo-audit.js';
import {buildClientReport} from './seo-reporting.js';
const all=async q=>(await q.all()).results||[];
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
const json=(body,status=200)=>new Response(JSON.stringify({ok:status<400,...body}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
class InputError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const fail=(m,s)=>{throw new InputError(m,s);};
const now=()=>new Date().toISOString();
const parse=s=>{try{return JSON.parse(s);}catch{return null;}};
function pageKey(url){try{const u=new URL(url);u.hash='';return u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/$/,'')+u.search;}catch{return '';}}
export function buildOpportunities(snapshot,keywords,audit){
 const out=[],mapping=[],groups=new Map();
 const push=(type,key,priority,title,evidence,query='',page='')=>out.push({type,key,priority,title,evidence,query,page});
 for(const row of snapshot?.pairs||[]){
  const k=keywordKey(row.query),p=pageKey(row.page);if(!k||!p)continue;
  if(!groups.has(k))groups.set(k,new Map());const g=groups.get(k);
  const old=g.get(p);
  if(!old||Number(row.impressions)>Number(old.impressions))g.set(p,row);
 }
 const previous=new Map((snapshot?.previous||[]).map(r=>[keywordKey(r.query),r]));
 const keys=new Map(keywords.map(k=>[k.keyword_key,k]));
 for(const k of keywords){
  const pages=[...(groups.get(k.keyword_key)?.values()||[])].sort((a,b)=>b.impressions-a.impressions);
  const best=pages[0];
  mapping.push({id:k.id,keyword:k.keyword,target:k.target_url,observed:pages.slice(0,5),suggested:best?.page||'',mismatch:Boolean(k.target_url&&best&&pageKey(k.target_url)!==pageKey(best.page))});
  if(!k.target_url&&best)push('mapping','map:'+k.id,'medium','Review target page for '+k.keyword,'Google reported '+best.impressions+' impressions for '+best.page+'; no target page has been saved.',k.keyword,best.page);
  if(k.target_url&&best&&best.impressions>=10&&pageKey(k.target_url)!==pageKey(best.page))push('mapping','map:'+k.id,'medium','Review keyword-to-page mismatch: '+k.keyword,'Saved target '+k.target_url+' differs from the leading observed page '+best.page+' ('+best.impressions+' impressions).',k.keyword,best.page);
 }
 for(const [term,group] of groups){
  const pages=[...group.values()].sort((a,b)=>b.impressions-a.impressions),a=pages[0],b=pages[1];
  if(a&&b&&a.impressions>=10&&b.impressions>=5&&b.impressions>=a.impressions*.2)
   push('overlap','overlap:'+term,'medium','Review possible page overlap: '+a.query,a.page+' ('+a.impressions+' impressions) and '+b.page+' ('+b.impressions+'). Different pages may legitimately rank; review intent before changing anything.',a.query,a.page);
 }
 for(const r of snapshot?.current||[]){
  const k=keywordKey(r.query),prior=previous.get(k),best=[...(groups.get(k)?.values()||[])].sort((a,b)=>b.impressions-a.impressions)[0];
  if(r.impressions>=20&&r.position>=4&&r.position<=20)push('improve','improve:'+k,'medium','Improve visibility for '+r.query,r.impressions+' impressions, average position '+r.position+' in the reported 28-day period.',r.query,best?.page||keys.get(k)?.target_url||'');
  if(prior&&prior.impressions>=25&&r.impressions<=prior.impressions*.65)push('decline','decline:'+k,'high','Investigate declining impressions: '+r.query,prior.impressions+' to '+r.impressions+' impressions in comparable 28-day windows; not proof of a ranking loss.',r.query,best?.page||'');
  if(r.impressions>=10&&/^(how|what|why|when|where|can|should|does|do|is|are|which|will)\b/i.test(r.query)){
   push('blog','blog:'+k,'low','Research an answer to: '+r.query,'Search Console reported '+r.impressions+' impressions. Check existing content and search intent before drafting.',r.query,best?.page||'');
  }
 }
 for(const p of audit?.pages||[])for(const issue of p.issues||[]){
  const high=/HTTP 40|server error|noindex/i.test(issue);
  push('technical','tech:'+p.url+':'+issue.replace(/^\d+ image/,'image'),high?'high':'medium',issue,p.url,'',p.url);
 }
 for(const l of audit?.links||[])if([404,410].includes(l.status))push('broken','broken:'+l.target,'high','Repair broken internal link','HTTP '+l.status+': '+l.target+' linked from '+l.sources.join(', '),'',l.target);
 if(audit?.sitemap.status===404)push('technical','sitemap:missing','low','Review sitemap discovery','Default /sitemap.xml returned 404; the site may use another sitemap.');
 // Deduplicate stable keys, then cap the dashboard without hiding high-priority items.
 const weight={high:0,medium:1,low:2},unique=new Map();for(const x of out)if(!unique.has(x.key))unique.set(x.key,x);
 return {mapping,opportunities:[...unique.values()].sort((a,b)=>weight[a.priority]-weight[b.priority]||a.key.localeCompare(b.key)).slice(0,150),pairs_available:snapshot?.pairs_available===true,period:snapshot?{from:snapshot.from,to:snapshot.to}:null};
}
export function calendarMonth(value, today=new Date()){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return null;
 const [y,m]=value.split('-').map(Number);
 if(y<2000||y>today.getUTCFullYear())return null;
 const first=new Date(Date.UTC(y,m-1,1)),next=new Date(Date.UTC(y,m,1)),prev=new Date(Date.UTC(y,m-2,1));
 if(next.getTime()>today.getTime()-4*86400000)return null;
 const iso=d=>d.toISOString().slice(0,10);
 return {month:value,start:iso(first),end:iso(new Date(next-86400000)),priorStart:iso(prev),priorEnd:iso(new Date(first-86400000))};
}
function priorMonth(today=new Date()){return new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-1,1)).toISOString().slice(0,7);}
async function latestAudit(env,c){
 const r=await env.DB.prepare('SELECT id,checked_at,payload FROM seo_audits WHERE client_id=? AND domain=? ORDER BY checked_at DESC LIMIT 1').bind(c.id,c.domain).first();
 return r?{id:r.id,checked_at:r.checked_at,...parse(r.payload)}:null;
}
async function evidence(env,c){
 const [sync,keywords,audit,tasks]=await Promise.all([
  env.DB.prepare('SELECT property,snapshot,synced_at FROM seo_sync WHERE client_id=?').bind(c.id).first(),
  all(env.DB.prepare('SELECT id,keyword,keyword_key,target_url FROM seo_keywords WHERE client_id=? ORDER BY keyword_key LIMIT 1000').bind(c.id)),
  latestAudit(env,c),all(env.DB.prepare('SELECT * FROM seo_action_tasks WHERE client_id=? ORDER BY updated_at DESC LIMIT 500').bind(c.id))
 ]);
 const snapshot=sync?.property===c.gsc_property?parse(sync.snapshot):null;
 // Only use observed pages belonging to this business before offering a mapping.
 if(snapshot?.pairs)snapshot.pairs=snapshot.pairs.filter(r=>siteUrl(r.page,[c.domain]));
 const x=buildOpportunities(snapshot,keywords,audit);
 const statuses=new Map(tasks.map(t=>[t.task_key,t.status]));
 return {...x,opportunities:x.opportunities.map(t=>({...t,status:statuses.get(t.key)||'open'})),audit,tasks,gsc_synced_at:snapshot?sync.synced_at:null};
}
async function state(env,c){
 const [settings,ev,reports,history]=await Promise.all([
  env.DB.prepare('SELECT * FROM seo_action_settings WHERE client_id=?').bind(c.id).first(),evidence(env,c),
  all(env.DB.prepare('SELECT month,domain,property,generated_at FROM seo_monthly_reports WHERE client_id=? ORDER BY month DESC LIMIT 24').bind(c.id)),
  all(env.DB.prepare('SELECT id,checked_at FROM seo_audits WHERE client_id=? AND domain=? ORDER BY checked_at DESC LIMIT 12').bind(c.id,c.domain))
 ]);
 return {settings:settings||{audit_enabled:0,reports_enabled:0,audit_status:'pending',report_status:'pending'},...ev,reports,history,default_month:priorMonth()};
}
async function ensure(env,id){await env.DB.prepare('INSERT OR IGNORE INTO seo_action_settings(client_id) VALUES(?)').bind(id).run();}
async function auditRun(env,c,scheduled=false){
 await ensure(env,c.id);
 const claim=await env.DB.prepare("UPDATE seo_action_settings SET audit_attempted_at=datetime('now'),audit_status='running' WHERE client_id=? AND (audit_attempted_at IS NULL OR audit_attempted_at<datetime('now',?))"+(scheduled?' AND audit_enabled=1':'')).bind(c.id,scheduled?'-7 days':'-10 minutes').run();
 if((claim.meta?.changes??claim.changes??0)!==1)fail('Audit recently attempted; try again later.',429);
 try{
  const a=await auditSite(c.domain);
  const live=await env.DB.prepare('SELECT domain FROM clients WHERE id=? AND active=1').bind(c.id).first();
  if(live?.domain!==c.domain)throw Error('Domain changed');
  const id=crypto.randomUUID(),stamp=now();
  const inspected=a.pages.some(p=>p.html);
  await env.DB.batch([
   env.DB.prepare('INSERT INTO seo_audits(id,client_id,domain,checked_at,payload) VALUES(?,?,?,?,?)').bind(id,c.id,c.domain,stamp,JSON.stringify(a)),
   env.DB.prepare('UPDATE seo_action_settings SET audit_status=? WHERE client_id=?').bind(inspected?'ok':'partial',c.id)
  ]);
  return {id,checked_at:stamp,...a};
 }catch{
  await env.DB.prepare("UPDATE seo_action_settings SET audit_status='error' WHERE client_id=?").bind(c.id).run();fail('Audit unavailable; previous results retained.',502);
 }
}
async function reportRun(env,c,m,scheduled=false){
 const dates=calendarMonth(m);if(!dates)fail('Choose a completed month at least four days after month end.');
 await ensure(env,c.id);
 const claim=await env.DB.prepare("UPDATE seo_action_settings SET report_attempted_at=datetime('now'),report_attempted_month=?,report_status='running' WHERE client_id=? AND (report_attempted_month IS NULL OR report_attempted_month<>? OR report_attempted_at IS NULL OR report_attempted_at<datetime('now',?))"+(scheduled?' AND reports_enabled=1':'')).bind(m,c.id,m,scheduled?'-7 days':'-5 minutes').run();
 if((claim.meta?.changes??claim.changes??0)!==1)fail('Report recently attempted; try again later.',429);
 try{
  let performance;try{performance=await getSeoMonthlyMetrics(env,c,dates.start,dates.end,dates.priorStart,dates.priorEnd);}catch{performance={status:'unavailable',current:null,previous:null};}
  const end=new Date(Date.parse(dates.end+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const [ev,rank,outreach,posts,completed]=await Promise.all([
   evidence(env,c),
   all(env.DB.prepare("SELECT t.id,k.keyword,t.location,t.device,h.position,h.checked_at,h.url FROM seo_rank_targets t JOIN seo_keywords k ON k.id=t.keyword_id AND k.client_id=t.client_id JOIN seo_rank_history h ON h.target_id=t.id AND h.keyword=k.keyword WHERE t.client_id=? AND h.domain=? AND h.checked_at>=? AND h.checked_at<? AND h.checked_at=(SELECT MAX(z.checked_at) FROM seo_rank_history z WHERE z.target_id=t.id AND z.keyword=k.keyword AND z.domain=h.domain AND z.checked_at>=? AND z.checked_at<?) ORDER BY k.keyword,t.location,t.device LIMIT 1000").bind(c.id,c.domain.toLowerCase().replace(/^www\./,''),dates.start,end,dates.start,end)),
   all(env.DB.prepare('SELECT outreach_status,COUNT(*) AS n FROM seo_backlinks WHERE client_id=? AND created_at<? GROUP BY outreach_status').bind(c.id,end)),
   all(env.DB.prepare("SELECT title,published_url,updated_at FROM editorial_posts WHERE client_id=? AND status='published' AND updated_at>=? AND updated_at<? ORDER BY updated_at DESC LIMIT 100").bind(c.id,dates.start,end)),
   all(env.DB.prepare("SELECT title,evidence,updated_at FROM seo_action_tasks WHERE client_id=? AND status='done' AND updated_at>=? AND updated_at<? ORDER BY updated_at DESC LIMIT 150").bind(c.id,dates.start,end))
  ]);
  const live=await env.DB.prepare('SELECT domain,gsc_property FROM clients WHERE id=? AND active=1').bind(c.id).first();
  if(live?.domain!==c.domain||live?.gsc_property!==c.gsc_property)throw Error('Business changed');
  const stamp=now();
  const client_report=await buildClientReport(env,c,dates,performance,ev,stamp);
  const payload={client_report,business:c.name,domain:c.domain,...dates,generated_at:stamp,performance,rank_checks:rank,outreach_current_status:outreach,posts_updated_in_period:posts,completed_tasks:completed,
   latest_audit:ev.audit?{checked_at:ev.audit.checked_at,pages:ev.audit.pages.length,broken:ev.audit.links.filter(x=>[404,410].includes(x.status)).length,issues:ev.audit.pages.reduce((n,x)=>n+x.issues.length,0)}:null,
   priorities:ev.opportunities.filter(x=>x.status==='open'&&x.type!=='blog').slice(0,10),
   caveats:['Search Console finalised calendar-month aggregate; missing rows are not zero.','Rank results are the latest saved observation per current target in this month, not an average.','Outreach counts show current statuses of records created before month end, not historical status changes.','Published blog entries were last updated in the month; this is not a verified publication date.','Audit and priorities reflect the latest evidence at report generation, not necessarily the reporting month.','Reports require review before client delivery.']};
  await env.DB.batch([
   env.DB.prepare("INSERT INTO seo_monthly_reports(client_id,month,domain,property,generated_at,payload) VALUES(?,?,?,?,?,?) ON CONFLICT(client_id,month) DO UPDATE SET domain=excluded.domain,property=excluded.property,generated_at=excluded.generated_at,payload=excluded.payload").bind(c.id,m,c.domain,c.gsc_property||'',stamp,JSON.stringify(payload)),
   env.DB.prepare('UPDATE seo_action_settings SET report_status=? WHERE client_id=?').bind(performance.status!=='ok'||client_report.analytics.status==='unavailable'?'partial':'ok',c.id)
  ]);
  return payload;
 }catch{
  await env.DB.prepare("UPDATE seo_action_settings SET report_status='error' WHERE client_id=?").bind(c.id).run();fail('Report generation failed; previous report retained.',502);
 }
}
async function body(req){if(!req.headers.get('content-type')?.startsWith('application/json'))fail('JSON required');const v=await req.text();if(v.length>20000)fail('Request too large');try{const b=JSON.parse(v);if(!b||Array.isArray(b)||typeof b!=='object')throw Error();return b;}catch{fail('Invalid JSON');}}
export async function seoActionsRoute(req,env,user,url){
 const prefix='/api/admin/seo-actions';if(!url.pathname.startsWith(prefix))return null;
 if(!user?.admin)return json({error:'Agency access only.'},403);
 const c=await allowedClient(env,user,clean(url.searchParams.get('client'),100));if(!c)return json({error:'Business not found.'},404);
 const p=url.pathname.slice(prefix.length),m=req.method;
 try{
  if(!p&&m==='GET')return json(await state(env,c));
  if(p==='/audit'&&m==='POST')return json({audit:await auditRun(env,c)});
  const audit=p.match(/^\/audits\/([a-f0-9-]{36})$/);
  if(audit&&m==='GET'){
   const row=await env.DB.prepare('SELECT checked_at,payload FROM seo_audits WHERE id=? AND client_id=? AND domain=?').bind(audit[1],c.id,c.domain).first();
   if(!row)fail('Audit not found.',404);return json({audit:{id:audit[1],checked_at:row.checked_at,...parse(row.payload)}});
  }
  const report=p.match(/^\/reports\/(\d{4}-\d{2})$/);
  if(report&&m==='GET'){
   const row=await env.DB.prepare('SELECT payload FROM seo_monthly_reports WHERE client_id=? AND month=?').bind(c.id,report[1]).first();if(!row)fail('Report not found.',404);return json({report:parse(row.payload)});
  }
  if(m!=='POST')fail('Not found.',404);
  const b=await body(req);
  if(p==='/settings'){
   await env.DB.prepare('INSERT INTO seo_action_settings(client_id,audit_enabled,reports_enabled) VALUES(?,?,?) ON CONFLICT(client_id) DO UPDATE SET audit_enabled=excluded.audit_enabled,reports_enabled=excluded.reports_enabled').bind(c.id,b.audit_enabled===true?1:0,b.reports_enabled===true?1:0).run();return json({});
  }
  if(p==='/reports')return json({report:await reportRun(env,c,clean(b.month,7))});
  if(p==='/task'){
   const key=clean(b.key,2000),status=clean(b.status,20);
   if(!['open','done','dismissed'].includes(status))fail('Invalid task state.');
   const ev=await evidence(env,c),task=ev.opportunities.find(x=>x.key===key)||ev.tasks.find(x=>x.task_key===key);
   if(!task)fail('Evidence no longer available; refresh the action plan.',404);
   await env.DB.prepare('INSERT INTO seo_action_tasks(client_id,task_key,status,title,evidence) VALUES(?,?,?,?,?) ON CONFLICT(client_id,task_key) DO UPDATE SET status=excluded.status,title=excluded.title,evidence=excluded.evidence,updated_at=datetime(\'now\')').bind(c.id,key,status,task.title,task.evidence).run();
   return json({});
  }
  fail('Not found.',404);
 }catch(e){if(e instanceof InputError)return json({error:e.message},e.status);console.error('SEO actions request unavailable');return json({error:'Unable to complete SEO actions request.'},500);}
}
export async function runSeoActionsSchedule(env){
 const audits=await all(env.DB.prepare("SELECT c.id,c.domain,c.name,c.gsc_property FROM clients c JOIN seo_action_settings a ON c.id=a.client_id WHERE c.active=1 AND a.audit_enabled=1 AND (a.audit_attempted_at IS NULL OR a.audit_attempted_at<datetime('now','-7 days')) ORDER BY COALESCE(a.audit_attempted_at,''),c.id LIMIT 1"));
 for(const c of audits)try{await auditRun(env,c,true);}catch{}
 const m=priorMonth();if(!calendarMonth(m))return;
 const reports=await all(env.DB.prepare("SELECT c.id,c.domain,c.name,c.gsc_property FROM clients c JOIN seo_action_settings a ON c.id=a.client_id LEFT JOIN seo_monthly_reports r ON r.client_id=c.id AND r.month=? WHERE c.active=1 AND a.reports_enabled=1 AND (r.month IS NULL OR a.report_status='partial') AND (a.report_attempted_month IS NULL OR a.report_attempted_month<>? OR a.report_attempted_at<datetime('now','-7 days')) ORDER BY COALESCE(a.report_attempted_at,''),c.id LIMIT 1").bind(m,m));
 for(const c of reports)try{await reportRun(env,c,m,true);}catch{}
}
