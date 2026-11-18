import {allowedClient,gscToken,validProperty,getSeoMonthlyMetrics,getSeoFocusMetrics} from './gsc.js';
const all=async q=>(await q.all()).results||[];
const clean=(x,n=200)=>String(x??'').trim().slice(0,n);
const json=(v,status=200)=>new Response(JSON.stringify({ok:status<400,...v}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(error,status=400)=>json({error},status);
const host=x=>String(x||'').toLowerCase().replace(/^www\./,'');
const safeHost=x=>{try{return new URL(x).hostname;}catch{return null;}};
const metricNames=['sessions','activeUsers','keyEvents'];
export function analyticsRequest(domain,dates,organic=false){
 const hostname=host(domain);
 const filters=[{filter:{fieldName:'hostName',inListFilter:{values:[hostname,'www.'+hostname],caseSensitive:false}}}];
 if(organic)filters.push({filter:{fieldName:'sessionDefaultChannelGroup',stringFilter:{matchType:'EXACT',value:'Organic Search',caseSensitive:false}}});
 return {dateRanges:[{startDate:dates.start,endDate:dates.end,name:'current'},{startDate:dates.priorStart,endDate:dates.priorEnd,name:'previous'}],metrics:metricNames.map(name=>({name})),dimensionFilter:{andGroup:{expressions:filters}},limit:10};
}
export function parseAnalytics(data){
 const headers=(data.metricHeaders||[]).map(x=>x.name),dims=(data.dimensionHeaders||[]).map(x=>x.name);
 const result={current:null,previous:null,thresholded:!!data.metadata?.subjectToThresholding,sampled:!!data.metadata?.samplingMetadatas?.length};
 for(const r of data.rows||[]){
  const key=r.dimensionValues?.[dims.indexOf('dateRange')]?.value;
  if(!['current','previous'].includes(key))continue;
  const metrics={};
  for(const name of metricNames){const raw=r.metricValues?.[headers.indexOf(name)]?.value;metrics[name]=raw!==undefined&&raw!==''&&Number.isFinite(Number(raw))?Number(raw):null;}
  result[key]=metrics;
 }
 return result;
}
async function settings(env,c){
 const s=await env.DB.prepare('SELECT domain,ga_property,brand FROM seo_reporting_settings WHERE client_id=?').bind(c.id).first();
 return {ga_property:s?.domain===c.domain?s.ga_property:'',brand:s?.brand||'auto'};
}
export async function analyticsMetrics(env,c,dates,fetcher=fetch,tokenFn=gscToken){
 const s=await settings(env,c);
 if(!s.ga_property||!env.GSC_SERVICE_ACCOUNT_JSON)return {status:'not-configured',all:null,organic:null};
 try{
  const token=await tokenFn(env,'https://www.googleapis.com/auth/analytics.readonly');
  const request=async organic=>{
   const r=await fetcher('https://analyticsdata.googleapis.com/v1beta/properties/'+s.ga_property+':runReport',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12000),body:JSON.stringify(analyticsRequest(c.domain,dates,organic))});
   if(!r.ok)throw Error('GA4 unavailable');return parseAnalytics(await r.json());
  };
  const [total,organic]=await Promise.all([request(false),request(true)]);
  return {status:'ok',all:total,organic};
 }catch{return {status:'unavailable',all:null,organic:null};}
}
function brandName(brand,c){return brand==='dual'?'Prunus Media / UK Trade Websites':brand==='uk-trades'||brand==='auto'&&c.brand==='uk-trades'?'UK Trade Websites':'Prunus Media';}
const diff=(a,b)=>typeof a==='number'&&typeof b==='number'?a-b:null;
const label=(v)=>v===null||v===undefined?'Not reported':Number(v).toLocaleString('en-GB',{maximumFractionDigits:1});
export function reportNarrative(performance,analytics,keywords,work,outreach){
 const wins=[],concerns=[],next=[];
 const compare=(name,a,b)=>{const d=diff(a,b);if(d>0)wins.push(name+' increased from '+label(b)+' to '+label(a)+'.');if(d<0)concerns.push(name+' decreased from '+label(b)+' to '+label(a)+'.');};
 compare('Google search clicks',performance.current?.clicks,performance.previous?.clicks);
 compare('Google search impressions',performance.current?.impressions,performance.previous?.impressions);
 compare('Organic search sessions',analytics.organic?.current?.sessions,analytics.organic?.previous?.sessions);
 compare('Organic search key events',analytics.organic?.current?.keyEvents,analytics.organic?.previous?.keyEvents);
 for(const k of keywords){
  compare(k.keyword+' Google impressions',k.search?.current?.impressions,k.search?.previous?.impressions);
  for(const t of k.targets){
  const d=diff(t.previous?.position,t.current?.position);
  const market=' ('+t.location+', '+t.device+')';
  if(d>0)wins.push(k.keyword+market+' improved by '+d+' organic positions.');
  if(d<0)concerns.push(k.keyword+market+' fell by '+Math.abs(d)+' organic positions.');
  if(t.previous&&t.current&&t.previous.position===null&&t.current.position!==null)wins.push(k.keyword+market+' entered the sampled results.');
  if(t.previous&&t.current&&t.previous.position!==null&&t.current.position===null)concerns.push(k.keyword+market+' was not found in the latest sampled results.');
 }
 }
 if(work.length)wins.push(work.length+' reviewed SEO work update(s) recorded for this month.');
 if(outreach.length)wins.push(outreach.length+' recorded backlink outreach contact(s) this month; this does not mean a link was secured.');
 if(!wins.length)wins.push('No measurable improvement or reviewed work was recorded in the available data.');
 if(!concerns.length)concerns.push('No decline identified in comparable observations; missing data is not evidence of improvement.');
 if(performance.status!=='ok'||!performance.current||!performance.previous)next.push('Connect or verify Search Console and establish a comparable search baseline.');
 if(analytics.status!=='ok'||!analytics.organic?.current)next.push('Verify Analytics collection and configure appropriate enquiry key events.');
 if(!keywords.length||keywords.some(k=>!k.targets.some(t=>t.current)))next.push('Confirm the five focus keywords and collect initial location-specific rank checks.');
 if(concerns.some(x=>x.includes('fell by')||x.includes('decreased')||x.includes('not found')))next.push('Investigate declining search visibility and review the affected landing pages.');
 if(outreach.length)next.push('Follow up on recorded backlink outreach and verify any acquired links.');
 else next.push('Research relevant local directories and genuine backlink opportunities; record outreach.');
 next.push('Review focus keyword landing pages, update useful content and monitor the next reporting period.');
 return {wins:wins.slice(0,15),concerns:concerns.slice(0,15),next:next.slice(0,8)};
}
export async function buildClientReport(env,c,dates,performance,ev,stamp){
 const s=await settings(env,c),domain=host(c.domain);
 const end=new Date(Date.parse(dates.end+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const [analytics,keys,rank,work,contacted,posts,leads]=await Promise.all([
  analyticsMetrics(env,c,dates),
  all(env.DB.prepare('SELECT k.id,k.keyword,s.slot FROM seo_client_keyword_slots s JOIN seo_keywords k ON k.id=s.keyword_id AND k.client_id=s.client_id WHERE s.client_id=? ORDER BY s.slot LIMIT 5').bind(c.id)),
  all(env.DB.prepare("SELECT t.keyword_id,t.location,t.device,h.position,h.checked_at FROM seo_rank_targets t JOIN seo_client_keyword_slots s ON s.client_id=t.client_id AND s.keyword_id=t.keyword_id JOIN seo_keywords k ON k.id=s.keyword_id AND k.client_id=s.client_id JOIN seo_rank_history h ON h.target_id=t.id AND h.keyword=k.keyword AND h.domain=? WHERE t.client_id=? AND h.checked_at>=? AND h.checked_at<? AND h.checked_at=(SELECT MAX(z.checked_at) FROM seo_rank_history z WHERE z.target_id=t.id AND z.keyword=k.keyword AND z.domain=h.domain AND substr(z.checked_at,1,7)=substr(h.checked_at,1,7)) ORDER BY s.slot,t.location,t.device,h.checked_at LIMIT 500").bind(domain,c.id,dates.priorStart,end)),
  all(env.DB.prepare('SELECT title,detail,completed_on FROM seo_client_updates WHERE client_id=? AND completed_on>=? AND completed_on<=? ORDER BY completed_on LIMIT 100').bind(c.id,dates.start,dates.end)),
  all(env.DB.prepare('SELECT source_url,contacted_on,outreach_status FROM seo_backlinks WHERE client_id=? AND contacted_on>=? AND contacted_on<=? ORDER BY contacted_on LIMIT 200').bind(c.id,dates.start,dates.end)),
  all(env.DB.prepare("SELECT title FROM editorial_posts WHERE client_id=? AND status='published' AND updated_at>=? AND updated_at<? ORDER BY updated_at LIMIT 100").bind(c.id,dates.start,end)),
  env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE client_id=? AND created_at>=? AND created_at<?').bind(c.id,dates.start,end).first()
 ]);
 const focus=await getSeoFocusMetrics(env,c,dates,keys.map(k=>k.keyword)).catch(()=>({current:[],previous:[]}));
 const keywords=keys.map(k=>{
  const targets=new Map();for(const h of rank.filter(x=>x.keyword_id===k.id)){
   const key=h.location+'\n'+h.device;if(!targets.has(key))targets.set(key,{location:h.location,device:h.device,current:null,previous:null});
   const t=targets.get(key),period=h.checked_at.slice(0,7)===dates.month?'current':'previous';t[period]={position:h.position,checked_at:h.checked_at};
  }
  return {keyword:k.keyword,targets:[...targets.values()].slice(0,20),search:{current:focus.current.find(x=>x.query.toLowerCase()===k.keyword.toLowerCase())||null,previous:focus.previous.find(x=>x.query.toLowerCase()===k.keyword.toLowerCase())||null}};
 });
 const outreach=contacted.map(x=>({domain:safeHost(x.source_url),date:x.contacted_on,status:x.outreach_status})).filter(x=>x.domain);
 const narrative=reportNarrative(performance,analytics,keywords,work,outreach);
 const audit=ev.audit?{date:ev.audit.checked_at,pages:ev.audit.pages.length,broken:ev.audit.links.filter(x=>[404,410].includes(x.status)).length}:null;
 return {version:1,brand:brandName(s.brand,c),business:c.name,domain:c.domain,month:dates.month,start:dates.start,end:dates.end,priorStart:dates.priorStart,priorEnd:dates.priorEnd,generated_at:stamp,performance,analytics,keywords,work,outreach,posts:posts.map(x=>x.title),recorded_enquiries:Number(leads?.n||0),audit,...narrative};
}
const escape=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const p=x=>'<p>'+escape(x)+'</p>';
const list=xs=>xs.length?'<ul>'+xs.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>':p('No entries recorded for this period.');
const metric=(title,a,b)=>'<tr><th>'+escape(title)+'</th><td>'+escape(label(a))+'</td><td>'+escape(label(b))+'</td><td>'+escape(diff(a,b)===null?'Not comparable':(diff(a,b)>0?'+':'')+label(diff(a,b)))+'</td></tr>';
const rankLabel=x=>!x?'Not checked':x.position===null?'Not found in sample':String(x.position);
export function renderReport(r){
 const color=r.brand==='UK Trade Websites'?'#12384e':'#52634c',period=new Date(r.month+'-01T00:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
 const metrics='<table><thead><tr><th>Metric</th><th>This month</th><th>Previous month</th><th>Change</th></tr></thead><tbody>'+metric('Google clicks',r.performance.current?.clicks,r.performance.previous?.clicks)+metric('Google impressions',r.performance.current?.impressions,r.performance.previous?.impressions)+metric('Website sessions',r.analytics.all?.current?.sessions,r.analytics.all?.previous?.sessions)+metric('Active users',r.analytics.all?.current?.activeUsers,r.analytics.all?.previous?.activeUsers)+metric('Organic search sessions',r.analytics.organic?.current?.sessions,r.analytics.organic?.previous?.sessions)+metric('Organic key events',r.analytics.organic?.current?.keyEvents,r.analytics.organic?.previous?.keyEvents)+'</tbody></table>';
 const ranks=r.keywords.map(k=>'<h3>'+escape(k.keyword)+'</h3>'+p('Search Console clicks: '+label(k.search?.current?.clicks)+' (previous '+label(k.search?.previous?.clicks)+'); impressions: '+label(k.search?.current?.impressions)+' (previous '+label(k.search?.previous?.impressions)+').')+ (k.targets.length?'<table><thead><tr><th>Location / device</th><th>Current</th><th>Previous</th><th>Change</th></tr></thead><tbody>'+k.targets.map(t=>'<tr><td>'+escape(t.location+' / '+t.device)+'</td><td>'+escape(rankLabel(t.current))+'</td><td>'+escape(rankLabel(t.previous))+'</td><td>'+escape(diff(t.previous?.position,t.current?.position)===null?'Not comparable':(diff(t.previous.position,t.current.position)>0?'+':'')+label(diff(t.previous.position,t.current.position))+' places')+'</td></tr>').join('')+'</tbody></table>':p('No saved checks for these reporting months.'))).join('')||p('Focus keywords have not yet been selected.');
 return '<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(r.business)+' | '+escape(period)+' SEO report</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font:14px/1.5 Arial,sans-serif;color:#222;background:#f6f2eb;margin:0}main{max-width:850px;margin:24px auto;background:white;padding:38px}header{border-top:8px solid '+color+';border-bottom:1px solid #ddd;padding:20px 0}h1,h2,h3{font-family:Georgia,serif;color:'+color+';line-height:1.2}h1{font-size:37px;margin:12px 0}h2{font-size:23px;margin:26px 0 10px}h3{font-size:17px;margin:16px 0 7px}small,.note{color:#555}.wordmarks{display:flex;gap:28px;align-items:center;flex-wrap:wrap}.prunus{font:32px Georgia,serif;color:#52634c}.prunus small{display:block;font:10px Arial,sans-serif;letter-spacing:.32em}.trades{font:bold 21px Arial,sans-serif;color:#12384e}.trades small{display:block;font:bold 11px Arial,sans-serif;letter-spacing:.12em}table{border-collapse:collapse;width:100%;font-size:12px;table-layout:fixed}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}thead{background:#f2f1ed}tr,li,h2,h3{break-inside:avoid}h2,h3{break-after:avoid}li{margin:4px 0}footer{border-top:1px solid #ddd;margin-top:24px;padding-top:12px}@media(max-width:650px){main{margin:0;padding:18px}h1{font-size:28px}}@media print{body{background:white}main{margin:0;padding:0;max-width:none}.screen{display:none}thead{display:table-header-group}}</style></head><body><main><header><div class="wordmarks">'+(r.brand==='Prunus Media / UK Trade Websites'?'<strong class="prunus">prunus <small>MEDIA</small></strong><strong class="trades">UK TRADE <small>WEBSITES</small></strong>':r.brand==='UK Trade Websites'?'<strong class="trades">UK TRADE <small>WEBSITES</small></strong>':'<strong class="prunus">prunus <small>MEDIA</small></strong>')+'</div><h1>Monthly SEO report</h1><h2>'+escape(r.business)+'</h2>'+p(r.domain+' | '+period)+'<small>Reporting period: '+escape(r.start+' to '+r.end)+'</small></header><p class="screen">Agency review copy. Use your browser Print / Save as PDF after reviewing.</p><h2>Search performance</h2>'+metrics+p('Website enquiries recorded in the portal: '+r.recorded_enquiries+' (all sources; not attributed to SEO).')+p('Search Console: '+r.performance.status+' | GA4: '+r.analytics.status)+'<h2>What worked and small wins</h2>'+list(r.wins)+'<h2>What has not worked / needs attention</h2>'+list(r.concerns)+'<h2>Your five focus keywords</h2>'+ranks+'<h2>Work completed</h2>'+list(r.work.map(x=>x.completed_on+' | '+x.title+(x.detail?' — '+x.detail:'')))+'<h2>Published blog records</h2>'+list(r.posts)+'<h2>Backlink outreach</h2>'+list(r.outreach.map(x=>x.date+' | '+x.domain+' | current status: '+x.status))+'<h2>Technical checks</h2>'+p(r.audit?'Latest sample: '+r.audit.date+' | '+r.audit.pages+' page candidates | '+r.audit.broken+' confirmed broken sampled links.':'No saved technical audit.')+'<h2>What we plan to do next</h2>'+list(r.next)+'<footer><small>Search Console and Analytics are different measurement systems. GA4 is hostname-filtered; key events depend on configured tracking and may not be leads. Rank checks use sampled organic results, not Maps. Missing data is not zero. Blog records reflect published entries last updated in the month; outreach dates are recorded contact dates with current status, not a complete event history. The technical sample may have been taken after the report period. Recommendations are not guarantees of ranking gains. '+escape(r.analytics.all?.thresholded||r.analytics.organic?.thresholded?'GA4 may apply privacy thresholding. ':'')+escape(r.analytics.all?.sampled||r.analytics.organic?.sampled?'GA4 results may be sampled. ':'')+'Generated '+escape(r.generated_at.slice(0,10))+'.</small></footer></main></body></html>';
}
export async function reportingRoute(req,env,user,url){
 const prefix='/api/admin/seo-reporting';if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return null;
 if(!user?.admin)return fail('Agency access only.',403);
 const c=await allowedClient(env,user,clean(url.searchParams.get('client'),100));if(!c)return fail('Business not found.',404);
 const path=url.pathname.slice(prefix.length),m=req.method;
 if(!path&&m==='GET'){const s=await settings(env,c);let email=null;try{const v=JSON.parse(env.GSC_SERVICE_ACCOUNT_JSON||'null');if(v?.type==='service_account')email=v.client_email||null;}catch{}return json({...s,domain:c.domain,gsc_property:c.gsc_property,service_account_email:email,dataforseo_configured:!!(env.DATAFORSEO_LOGIN&&env.DATAFORSEO_PASSWORD),dataforseo_enabled:env.DATAFORSEO_ENABLED==='true'});}
 if(path==='/print'&&m==='GET'){
  const month=clean(url.searchParams.get('month'),7);if(!/^\d{4}-\d{2}$/.test(month))return fail('Invalid month.');
  const rec=await env.DB.prepare('SELECT payload FROM seo_monthly_reports WHERE client_id=? AND month=?').bind(c.id,month).first();
  let r;try{r=JSON.parse(rec?.payload||'null')?.client_report;}catch{}
  if(!r)return fail('Generate a new branded report first.',404);
  return new Response(renderReport(r),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",'referrer-policy':'no-referrer'}});
 }
 if(m!=='POST')return fail('Not found.',404);
 if(path==='/test-dataforseo'){
  if(!env.DATAFORSEO_LOGIN||!env.DATAFORSEO_PASSWORD)return fail('Add the Cloudflare DataForSEO secrets first.',409);
  try{
   const r=await fetch('https://api.dataforseo.com/v3/appendix/user_data',{headers:{authorization:'Basic '+btoa(env.DATAFORSEO_LOGIN+':'+env.DATAFORSEO_PASSWORD)},redirect:'error',signal:AbortSignal.timeout(12000)});
   if(!r.ok)throw Error();const x=await r.json(),t=x.tasks?.[0];if(x.status_code!==20000||t?.status_code!==20000)throw Error();
   const balance=t.result?.[0]?.money?.balance;return json({connected:true,balance:typeof balance==='number'?balance:null});
  }catch{return fail('DataForSEO authentication check failed.',502);}
 }
 if(path==='/test-google'){
  const today=new Date(),end=new Date(today.getTime()-4*86400000),start=new Date(end.getTime()-6*86400000),priorEnd=new Date(start.getTime()-86400000),priorStart=new Date(priorEnd.getTime()-6*86400000),d=x=>x.toISOString().slice(0,10);
  const dates={start:d(start),end:d(end),priorStart:d(priorStart),priorEnd:d(priorEnd)};
  const [g,a]=await Promise.all([getSeoMonthlyMetrics(env,c,dates.start,dates.end,dates.priorStart,dates.priorEnd).catch(()=>({status:'unavailable'})),analyticsMetrics(env,c,dates)]);
  return json({search_console:g.status,analytics:a.status,analytics_has_rows:!!a.all?.current});
 }
 if(path!=='')return fail('Not found.',404);
 try{
  const raw=await req.text();if(raw.length>8000)throw Error();const b=JSON.parse(raw);const ga=clean(b.ga_property,20),brand=clean(b.brand,20)||'auto';
  if(ga&&!/^\d{1,15}$/.test(ga)||!['auto','prunus','uk-trades','dual'].includes(brand))return fail('Use a numeric GA4 property ID and valid report brand.');
  if(ga&&b.confirm_property!==true)return fail('Confirm this Analytics property belongs to the registered website.');
  await env.DB.prepare('INSERT INTO seo_reporting_settings(client_id,domain,ga_property,brand) VALUES(?,?,?,?) ON CONFLICT(client_id) DO UPDATE SET domain=excluded.domain,ga_property=excluded.ga_property,brand=excluded.brand').bind(c.id,c.domain,ga,brand).run();return json({});
 }catch{return fail('Invalid settings.');}
}
