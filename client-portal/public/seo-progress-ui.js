'use strict';
let seoProgressSeq=0;
const progressPath=(id,path='')=>'/api/seo-progress'+path+'?client='+encodeURIComponent(id);
async function loadSeoProgress(){
 if(!state.session||!state.clientId||portalView()!=='keywords')return;
 const id=state.clientId,admin=!!state.session.admin,seq=++seoProgressSeq,root=$('seo-progress-root');
 root.replaceChildren();add(root,'p','Loading keyword progress…','subtle');
 try{
  const data=await api(progressPath(id));
  if(seq!==seoProgressSeq||state.clientId!==id||!state.session||portalView()!=='keywords')return;
  renderSeoProgress(root,id,data,admin);
  if(admin){
   try{const a=await api('/api/admin/seo-actions?client='+encodeURIComponent(id));
    if(seq===seoProgressSeq&&state.session?.admin&&state.clientId===id&&portalView()==='keywords')renderProgressActions($('seo-progress-recommendations'),id,a);
   }catch(e){if(seq===seoProgressSeq&&$('seo-progress-recommendations'))add($('seo-progress-recommendations'),'p','Recommendations unavailable: '+e.message,'subtle');}
  }
 }catch(e){if(seq===seoProgressSeq&&state.clientId===id){root.replaceChildren();add(root,'p',e.message,'message error');}}
}
function renderSeoProgress(root,id,data,admin){
 root.replaceChildren();
 const message=add(root,'p','','message');message.setAttribute('role','status');
 const active=()=>state.session&&state.clientId===id&&portalView()==='keywords';
 const guard=()=>{if(!active())throw Error('Open the correct website again.');};
 const reload=async()=>{if(active())await loadSeoProgress();};
 function button(parent,label,fn,disabled=false){
  const b=add(parent,'button',label,'secondary');b.type='button';b.disabled=disabled;
  b.addEventListener('click',async()=>{b.disabled=true;message.textContent='Working…';message.classList.remove('error');try{guard();await fn();message.textContent='Saved.';}catch(e){message.textContent=e.message;message.classList.add('error');}finally{b.disabled=disabled;}});return b;
 }
 function submit(form,label,fn){
  const b=add(form,'button',label,'primary');b.type='submit';
  form.onsubmit=async e=>{e.preventDefault();b.disabled=true;message.textContent='Working…';message.classList.remove('error');try{guard();await fn(Object.fromEntries(new FormData(form)));message.textContent='Saved.';}catch(err){message.textContent=err.message;message.classList.add('error');}finally{b.disabled=false;}};
 }
 const formatMonth=m=>new Date(m+'-01T00:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
 const period=seoPanel(root,'Your SEO this month','Website: '+data.business.domain+' · '+formatMonth(data.month));
 const tiles=add(period,'div',null,'seo-metric-grid');
 measure(tiles,'Saved keywords',String(data.counts.saved),'Target search terms');
 measure(tiles,'Weekly monitoring',String(data.counts.monitored),'Keywords with an enabled rank target');
 measure(tiles,'Keywords improved',String(data.counts.improved),'At least one comparable rank target improved this month');
 measure(tiles,'Work updates',String(data.updates.length),'Reviewed work shared this month');
 const p=data.performance,summary=add(period,'div',null,'seo-metric-grid');
 const delta=(key)=>{
  if(!p.matchedCurrent||!p.matchedPrevious)return 'No matched prior-month days yet';
  const a=p.matchedCurrent[key],b=p.matchedPrevious[key],change=a-b;
  return (change>0?'+':'')+seoNum(change)+' vs prior month over '+p.matchedCurrent.days+' matched reported days';
 };
 measure(summary,'Google clicks',seoNum(p.current?.clicks),delta('clicks'));
 measure(summary,'Google impressions',seoNum(p.current?.impressions),delta('impressions'));
 if(p.current)add(period,'p','Search Console reported '+p.current.days+' day(s), '+p.first+' to '+p.through+'. Totals reflect reported days only. Previous-month comparisons exclude unmatched days. Google data is delayed.','subtle');
 else add(period,'p','No Search Console daily data saved for this month yet. This is not zero traffic.','subtle');
 if(p.matchedCurrent)add(period,'p','Matched-day clicks: '+seoNum(p.matchedPrevious.clicks)+' to '+seoNum(p.matchedCurrent.clicks)+'; impressions: '+seoNum(p.matchedPrevious.impressions)+' to '+seoNum(p.matchedCurrent.impressions)+'.','subtle');
 if(admin){button(period,'Open full SEO command centre',async()=>portalNavigate('insights',id));button(period,'Refresh progress',reload);}
 const tracked=seoPanel(root,'Keyword rankings','Independent Google organic checks (up to 30 results), grouped by saved keyword. Rankings depend on search location and device.');
 add(tracked,'p','Monthly movement compares the latest check this month with the last check in the previous month, or the first check this month when no prior-month baseline exists. Not found is not a numerical rank.','subtle');
 if(data.search_console_period)add(tracked,'p','Search Console keyword averages: '+data.search_console_period.from+' to '+data.search_console_period.to+' (separate from independent rankings).','subtle');
 const filter=seoField(tracked,'Filter keywords','search',{placeholder:'Keyword or location'});
 const grid=seoTable(tracked,[...(admin?['Select']:[]),'Keyword / target page','Market / device','Latest organic rank','This month','Search Console','Monitoring',...(admin?['Actions']:[])]);
 const selected=new Set();let selectCount=null;
 const rankText=x=>!x?'Not checked':x.position===null?'Not found in '+x.result_count+' returned organic results':'#'+x.position;
 function updateSelected(){if(selectCount)selectCount.textContent=selected.size+' keyword(s) selected (maximum 50 per batch).';}
 function renderRows(){
  grid.replaceChildren();const q=filter.value.toLowerCase();
  for(const k of data.keywords.filter(k=>[k.keyword,k.service,k.location,...k.targets.map(t=>t.location)].join(' ').toLowerCase().includes(q))){
   const rows=k.targets.length?k.targets:[null];let first=true;
   for(const t of rows){
    const r=add(grid,'tr');
    if(admin){const cell=add(r,'td');if(first){const cb=add(cell,'input');cb.type='checkbox';cb.checked=selected.has(k.id);cb.setAttribute('aria-label','Select '+k.keyword);cb.addEventListener('change',()=>{if(cb.checked&&selected.size>=50){cb.checked=false;message.textContent='Select at most 50 keywords.';return;}if(cb.checked)selected.add(k.id);else selected.delete(k.id);updateSelected();});}}
    const key=add(r,'td');add(key,'strong',k.keyword);if(k.target_url)add(key,'div',k.target_url,'meta');
    if(k.service||k.location)add(key,'div',[k.service,k.location].filter(Boolean).join(' / '),'meta');
    add(r,'td',t?t.location+' / '+t.device:'Not configured');
    const pos=add(r,'td');add(pos,'strong',rankText(t?.latest));if(t?.latest?.checked_at)add(pos,'div',t.latest.checked_at.slice(0,10),'meta');if(t?.latest?.url)add(pos,'div',t.latest.url,'meta');
    const movement=add(r,'td');add(movement,'strong',t?.movement.label||'Not enough checks');if(t?.baseline)add(movement,'div','Baseline: '+rankText(t.baseline)+' · '+t.baseline.checked_at.slice(0,10),'meta');
    const g=add(r,'td');if(k.search_console){add(g,'div','Avg. position '+seoNum(k.search_console.position));add(g,'small',seoNum(k.search_console.clicks)+' clicks / '+seoNum(k.search_console.impressions)+' impressions');}else add(g,'span','Not reported');
    add(r,'td',t?(t.enabled?'Weekly enabled':'Manual / paused')+' · '+t.status:'Saved only');
    if(admin){const actions=add(r,'td');if(t){button(actions,'Check now',async()=>{if(!confirm('Run a paid rank check?'))return;await jsonPost(paidPath(id,'/targets/'+t.id+'/check'),{});await reload();});button(actions,t.enabled?'Pause':'Enable weekly',async()=>{if(!t.enabled&&!confirm('Enable paid weekly rank checks, subject to the agency budget?'))return;await jsonPost(paidPath(id,'/targets/'+t.id),{enabled:!t.enabled},'PATCH');await reload();});}else add(actions,'span','Select to configure');}
    first=false;
   }
  }
  if(!grid.children.length)seoEmpty(grid,admin?8:6,'No saved keywords match yet.');
 }
 filter.addEventListener('input',renderRows);renderRows();
 if(admin){
  const manage=seoPanel(root,'Manage this website’s tracked keywords','Add a keyword, or select saved keywords above and configure independent monitoring. Adding a term does not itself make a paid request.');
  const form=add(manage,'form',null,'form-stack');
  seoField(form,'Keyword','keyword',{required:true,max:200});seoField(form,'Service','service',{max:100});seoField(form,'Target page (optional HTTPS URL)','target_url',{type:'url'});
  submit(form,'Save keyword',async b=>{await jsonPost(seoEndpoint(id,'/keywords'),b);await reload();});
  const batch=add(manage,'form',null,'form-stack');selectCount=add(batch,'p','0 keyword(s) selected (maximum 50 per batch).','subtle');
  seoField(batch,'Rank location (exact provider location)','location',{value:'United Kingdom',required:true,max:180});
  seoField(batch,'Device','device',{value:'desktop',options:[['desktop','Desktop'],['mobile','Mobile']]});
  seoField(batch,'Enable paid weekly checks for new targets','enabled',{type:'checkbox'});
  submit(batch,'Configure selected keywords',async b=>{if(!selected.size)throw Error('Select saved keywords in the ranking table first.');if(batch.elements.enabled.checked&&!confirm('Enable paid weekly checks for new targets?'))return;await jsonPost(progressPath(id,'/track'),{keyword_ids:[...selected],location:b.location,device:b.device,enabled:batch.elements.enabled.checked});await reload();});
  const rec=seoPanel(root,'What needs improving','Agency-only. Priorities reflect actual stored audit and Search Console evidence.');rec.id='seo-progress-recommendations';
 }
 const work=seoPanel(root,'SEO work completed this month','Updates shared by your website team for '+formatMonth(data.month)+'.');
 if(!data.updates.length)add(work,'p','No completed-work updates shared this month yet.','subtle');
 for(const u of data.updates){
  const item=add(work,'div',null,'portal-next-row');add(item,'strong',u.title);add(item,'span',u.completed_on,'meta');if(u.detail)add(item,'p',u.detail);
  if(admin)button(item,'Remove shared update',async()=>{if(!confirm('Remove this update from the client view?'))return;await api(progressPath(id,'/updates/'+u.id),{method:'DELETE'});await reload();});
 }
 if(admin){
  const form=add(work,'form',null,'form-stack');
  const available=(data.tasks||[]).filter(t=>!t.shared);
  const task=seoField(form,'Link to completed internal task (optional)','task_key',{value:'',options:[['','Manual update'],...available.map(t=>[t.key,t.title])]});
  const title=seoField(form,'Client-facing title','title',{required:true,max:180});
  const on=seoField(form,'Completed on','completed_on',{type:'date',required:true,value:new Date().toISOString().slice(0,10)});
  task.addEventListener('change',()=>{const t=available.find(t=>t.key===task.value);if(t){title.value=t.title;on.value=t.updated_at.slice(0,10);}});
  seoField(form,'What was improved? (optional)','detail',{type:'textarea',max:1200});
  seoField(form,'I have reviewed this update and it is suitable for this client','confirm_share',{type:'checkbox',required:true});
  submit(form,'Share completed work',async b=>{await jsonPost(progressPath(id,'/updates'),{...b,confirm_share:form.elements.confirm_share.checked});await reload();});
 }
}
function renderProgressActions(parent,id,data){
 if(!parent)return;
 const next=data.opportunities.filter(x=>x.status==='open'&&x.type!=='blog').slice(0,15);
 const table=seoTable(parent,['Priority','Suggested improvement','Evidence','Action']);
 for(const t of next){
  const r=add(table,'tr');for(const v of [t.priority,t.title,t.evidence])add(r,'td',v);
  const cell=add(r,'td'),b=add(cell,'button','Mark complete','secondary');b.type='button';
  b.addEventListener('click',async()=>{if(!state.session?.admin||state.clientId!==id||portalView()!=='keywords')return;if(!confirm('Confirm this SEO work has actually been completed?'))return;b.disabled=true;try{await jsonPost('/api/admin/seo-actions/task?client='+encodeURIComponent(id),{key:t.key,status:'done'});await loadSeoProgress();}catch(e){add(cell,'p',e.message,'message error');b.disabled=false;}});
 }
 if(!next.length)seoEmpty(table,4,'No open recommendations. Sync Search Console or run a technical audit in the SEO command centre.');
 const b=add(parent,'button','View all recommendations and audits','secondary');b.type='button';b.addEventListener('click',()=>{if(state.session?.admin&&state.clientId===id)portalNavigate('insights',id);});
}
