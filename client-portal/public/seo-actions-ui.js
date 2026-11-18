'use strict';
let actionsSeq=0;
const actionsPath=(id,p='')=>'/api/admin/seo-actions'+p+'?client='+encodeURIComponent(id);
async function loadSeoActions(){
 if(!state.session?.admin||!state.clientId||portalView()!=='insights')return;
 const id=state.clientId,seq=++actionsSeq,root=$('seo-actions-root');
 root.replaceChildren();add(root,'p','Loading audits, SEO actions and reports…','subtle');
 try{
  const [data,free]=await Promise.all([api(actionsPath(id)),api(seoEndpoint(id))]);
  if(seq!==actionsSeq||state.clientId!==id||!state.session?.admin||portalView()!=='insights')return;
  renderSeoActions(root,id,data,free.keywords||[]);
 }catch(e){if(seq===actionsSeq&&state.clientId===id){root.replaceChildren();add(root,'p',e.message,'message error');}}
}
function renderSeoActions(root,id,data,keywords){
 root.replaceChildren();
 const msg=add(root,'p','','message');msg.setAttribute('role','status');
 const active=()=>state.session?.admin&&state.clientId===id&&portalView()==='insights';
 const guard=()=>{if(!active())throw Error('Open the correct business.');};
 const send=async(p,b={})=>{guard();return jsonPost(actionsPath(id,p),b);};
 const refresh=async()=>{if(active())await loadSeoActions();};
 function button(parent,label,fn,disabled=false){
  const b=add(parent,'button',label,'secondary');b.type='button';b.disabled=disabled;
  b.addEventListener('click',async()=>{b.disabled=true;msg.textContent='Working…';msg.classList.remove('error');try{guard();await fn();msg.textContent='Done.';}catch(e){msg.textContent=e.message;msg.classList.add('error');}finally{b.disabled=disabled;}});
  return b;
 }
 function submit(form,label,fn){
  const b=add(form,'button',label,'primary');b.type='submit';
  form.onsubmit=async e=>{e.preventDefault();b.disabled=true;msg.textContent='Working…';msg.classList.remove('error');try{guard();await fn();msg.textContent='Saved.';}catch(e){msg.textContent=e.message;msg.classList.add('error');}finally{b.disabled=false;}};
 }
 const top=seoPanel(root,'SEO action centre','Evidence-based recommendations, public-site technical checks and monthly reports. No automatic website edits or publishing.');
 const config=add(top,'form',null,'form-stack');
 seoField(config,'Enable weekly technical audit samples','audit_enabled',{type:'checkbox',value:!!data.settings.audit_enabled});
 seoField(config,'Generate monthly report drafts automatically','reports_enabled',{type:'checkbox',value:!!data.settings.reports_enabled});
 submit(config,'Save automation settings',async()=>{await send('/settings',{audit_enabled:config.elements.audit_enabled.checked,reports_enabled:config.elements.reports_enabled.checked});await refresh();});
 button(top,'Refresh action centre',refresh);
 const audit=seoPanel(root,'Technical SEO audit','Public HTML only; homepage plus up to three page candidates and four internal linked destinations. A sample is not a full site crawl or PageSpeed audit.');
 add(audit,'p','Latest attempt: '+(data.settings.audit_attempted_at||'Not yet attempted')+' · '+data.settings.audit_status,'subtle');
 const auditOutput=add(audit,'div');
 const showAudit=a=>{
  auditOutput.replaceChildren();
  if(!a){add(auditOutput,'p','No audit saved. Run the first check.','subtle');return;}
  add(auditOutput,'p','Checked '+a.checked_at+' · '+a.domain,'subtle');
  const metric=add(auditOutput,'div',null,'seo-metric-grid');
  measure(metric,'Page candidates',String(a.pages.length),'Sample only');
  measure(metric,'Broken links',String(a.links.filter(x=>[404,410].includes(x.status)).length),'HTTP 404/410 in sampled destinations');
  measure(metric,'Page flags',String(a.pages.reduce((n,x)=>n+x.issues.length,0)),'Review each flag');
  add(auditOutput,'p','robots.txt: '+(a.robots.status??'Unavailable')+' · Default sitemap: '+(a.sitemap.status??'Unavailable')+' · Sitemap URL sample: '+a.sitemap.entries,'subtle');
  for(const n of a.notes||[])add(auditOutput,'p',n,'subtle');
  const tb=seoTable(auditOutput,['Page','HTTP','Title','Description','H1','Canonical','Review flags']);
  for(const p of a.pages){const r=add(tb,'tr');for(const x of [p.url,p.status??'Unverified',p.title||'—',p.description||'—',p.html?p.h1:'—',p.canonical||'—',p.error||p.issues.join('; ')||(p.html?'No sampled flags':'Not analysed')])add(r,'td',x);}
  if(!tb.children.length)seoEmpty(tb,7,'No pages could be assessed.');
  const links=seoTable(auditOutput,['Linked destination','HTTP / status','Incoming sampled pages']);
  for(const l of a.links){const r=add(links,'tr');for(const x of [l.target,(l.status??'Unverified')+(l.error?' · '+l.error:''),l.sources.join(', ')])add(r,'td',x);}
  if(!links.children.length)seoEmpty(links,3,'No linked destinations sampled.');
 };
 showAudit(data.audit);
 button(audit,'Run technical audit',async()=>{await send('/audit');await refresh();});
 if(data.history.length){
  const form=add(audit,'form',null,'form-stack');
  seoField(form,'Previous audit','audit_id',{value:data.history[0].id,options:data.history.map(x=>[x.id,x.checked_at])});
  submit(form,'View saved audit',async()=>{const r=await api(actionsPath(id,'/audits/'+form.elements.audit_id.value));if(active())showAudit(r.audit);});
 }
 const map=seoPanel(root,'Keyword-to-page mapping','Observed pages come from Search Console query/page rows. Missing rows do not establish that a page is unindexed or has no ranking.');
 add(map,'p',data.period?'Evidence: '+data.period.from+' to '+data.period.to+' · Query/page data '+(data.pairs_available?'available (bounded sample)':'not yet available'):'Sync Search Console to collect query/page evidence.','subtle');
 add(map,'p','Use the suggested page only after checking its intent. The saved target is an internal planning record, not a live change.','subtle');
 const filter=seoField(map,'Find tracked keyword','filter',{placeholder:'Search keywords'});
 const mt=seoTable(map,['Keyword','Saved page','Observed pages / impressions','Suggestion','Action']);
 function renderMapping(){
  mt.replaceChildren();const q=filter.value.toLowerCase();
  for(const m of data.mapping.filter(m=>m.keyword.toLowerCase().includes(q))){
   const r=add(mt,'tr');for(const val of [m.keyword,m.target||'Not assigned',m.observed.map(x=>x.page+' · '+x.impressions).join(' | ')||'Not reported',m.suggested?(m.mismatch?'Review mismatch: ':'')+m.suggested:'No evidence-based suggestion'])add(r,'td',val);
   const a=add(r,'td'),k=keywords.find(x=>x.id===m.id);
   button(a,'Use suggested page',async()=>{if(!confirm('Set this as the internal target page?'))return;await jsonPost(seoEndpoint(id,'/keywords/'+m.id),{keyword:k.keyword,service:k.service,location:k.location,target_url:m.suggested},'PATCH');await loadSeoWorkspace(true);await refresh();},!k||!m.suggested||m.suggested===m.target);
  }
  if(!mt.children.length)seoEmpty(mt,5,'No saved keywords match.');
 }
 filter.addEventListener('input',renderMapping);renderMapping();
 const work=seoPanel(root,'Prioritised recommendations','Review and record your SEO work. Recommendations are rules-based, not guarantees of ranking improvements.');
 const status=seoField(work,'Show','status',{value:'open',options:[['open','Open'],['done','Completed'],['dismissed','Dismissed'],['all','All']]});
 const tasks=seoTable(work,['Priority','Recommended work','Evidence','Status','Action']);
 async function change(key,stateValue){await send('/task',{key,status:stateValue});await refresh();}
 const current=new Map(data.opportunities.filter(x=>x.type!=='blog').map(x=>[x.key,x]));
 for(const t of data.tasks)if(!current.has(t.task_key))current.set(t.task_key,{key:t.task_key,priority:'Archived evidence',title:t.title,evidence:t.evidence,status:t.status});
 function renderTasks(){
  tasks.replaceChildren();
  for(const t of [...current.values()].filter(t=>status.value==='all'||status.value===t.status)){
   const r=add(tasks,'tr');for(const x of [t.priority,t.title,t.evidence,t.status])add(r,'td',x);
   const a=add(r,'td');
   if(t.status!=='done')button(a,'Mark complete',()=>change(t.key,'done'));
   if(t.status==='open')button(a,'Dismiss',()=>change(t.key,'dismissed'));else button(a,'Reopen',()=>change(t.key,'open'));
  }if(!tasks.children.length)seoEmpty(tasks,5,'No recommendations in this view. Add tracked keywords and sync Search Console or run a site audit.');
 }
 status.addEventListener('change',renderTasks);renderTasks();
 const blog=seoPanel(root,'Keyword-driven blog planning','Informational queries observed in Search Console. Nothing is drafted, approved, scheduled or published automatically.');
 const bt=seoTable(blog,['Question / keyword','Search evidence','Observed page','Plan']);
 for(const t of data.opportunities.filter(x=>x.type==='blog')){
  const r=add(bt,'tr');for(const x of [t.query,t.evidence,t.page||'Not reported'])add(r,'td',x);
  const a=add(r,'td');
  button(a,'Add to blog planner',async()=>{
   if(!confirm('Create a research idea in this business’s existing blog planner?'))return;
   await jsonPost('/api/editorial',{client_id:id,title:t.query.slice(0,180),audience_question:t.query.slice(0,500),target_query:t.query.slice(0,180),brief:'SEO research candidate. '+t.evidence+' Evidence period: '+(data.period?.from||'unknown')+' to '+(data.period?.to||'unknown')+'. Review existing pages, search intent, sources and actual business services. Do not publish until reviewed.'});
  });
 }
 if(!bt.children.length)seoEmpty(bt,4,'No informational query opportunities in the current evidence sample.');
 const report=seoPanel(root,'Monthly SEO reports','Generate an agency-only draft for a completed calendar month. Search Console data is measured; missing figures are explicitly labelled. Review before sending to clients.');
 add(report,'p','Automatic report status: '+data.settings.report_status,'subtle');
 const f=add(report,'form',null,'form-stack');
 seoField(f,'Reporting month (YYYY-MM)','month',{value:data.default_month,required:true,max:7,placeholder:'2026-10'});
 const output=add(report,'div');
 function makeText(r){
  const out=[r.business+' | SEO report | '+r.month,'Website: '+r.domain,'Generated: '+r.generated_at,'Period: '+r.start+' to '+r.end,'','SEARCH PERFORMANCE (Google Search Console)','Status: '+r.performance.status];
  for(const [label,key] of [['Clicks','clicks'],['Impressions','impressions'],['CTR','ctr'],['Average position','position']]){
   const fmt=x=>x===undefined||x===null?'Not reported':key==='ctr'?(x*100).toFixed(2)+'%':seoNum(x);
   out.push(label+': '+fmt(r.performance.current?.[key])+' | Previous month: '+fmt(r.performance.previous?.[key]));
  }
  out.push('','INDEPENDENT RANK CHECKS (latest saved observation per target)');
  for(const t of r.rank_checks)out.push(t.keyword+' | '+t.location+' / '+t.device+' | '+(t.position??'Not found in returned results')+' | '+t.checked_at);
  if(!r.rank_checks.length)out.push('No saved checks for this period.');
  out.push('','OUTREACH RECORDS (current status)');
  for(const x of r.outreach_current_status)out.push(x.outreach_status+': '+x.n);
  if(!r.outreach_current_status.length)out.push('No matching saved records.');
  out.push('','PUBLISHED BLOG ENTRIES LAST UPDATED IN PERIOD');
  for(const x of r.posts_updated_in_period)out.push(x.title+' | '+(x.published_url||'URL not recorded'));
  if(!r.posts_updated_in_period.length)out.push('No matching entries.');
  out.push('','COMPLETED SEO ACTIONS');
  for(const x of r.completed_tasks)out.push(x.title+' | '+x.updated_at);
  if(!r.completed_tasks.length)out.push('No completed actions recorded.');
  out.push('','LATEST TECHNICAL AUDIT',r.latest_audit?'Checked '+r.latest_audit.checked_at+' | page candidates '+r.latest_audit.pages+' | sampled broken links '+r.latest_audit.broken+' | flags '+r.latest_audit.issues:'No saved audit.');
  out.push('','NEXT PRIORITIES');for(const t of r.priorities)out.push(t.priority.toUpperCase()+': '+t.title+' | '+t.evidence);
  if(!r.priorities.length)out.push('No open priority recommendations recorded.');
  out.push('','METHOD & LIMITATIONS',...r.caveats);return out.join('\n');
 }
 function showReport(r){
  output.replaceChildren();add(output,'h3',r.business+' · '+r.month+' SEO report');
  const text=makeText(r),preview=add(output,'textarea');preview.value=text;preview.readOnly=true;preview.rows=16;preview.setAttribute('aria-label','Editable report copy source');
  button(output,'Copy report',async()=>{await navigator.clipboard.writeText(text);});
  button(output,'Download report (.txt)',async()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='seo-report-'+r.month+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 }
 submit(f,'Generate report draft',async()=>{const r=await send('/reports',{month:f.elements.month.value});if(active())showReport(r.report);});
 if(data.reports.length){
  const saved=add(report,'form',null,'form-stack');
  seoField(saved,'Saved reporting month','saved_month',{value:data.reports[0].month,options:data.reports.map(x=>[x.month,x.month+' · '+x.domain])});
  submit(saved,'Open saved report',async()=>{const r=await api(actionsPath(id,'/reports/'+saved.elements.saved_month.value));if(active())showReport(r.report);});
 }
}
