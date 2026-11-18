'use strict';
let seoWorkRequest=0,seoWorkClient='',seoWorkData=null;
const seoEndpoint=(id,path='')=>'/api/admin/seo-workspace'+path+'?client='+encodeURIComponent(id);
function seoField(form,label,name,opts={}){
  const wrap=add(form,'label',label);
  const field=add(wrap,opts.options?'select':opts.type==='textarea'?'textarea':'input');
  field.name=name;
  if(opts.options){for(const [v,t] of opts.options){const o=add(field,'option',t);o.value=v;}}
  else if(opts.type!=='textarea')field.type=opts.type||'text';
  if(opts.max)field.maxLength=opts.max;
  if(opts.required)field.required=true;
  if(opts.placeholder)field.placeholder=opts.placeholder;
  if(opts.type==='checkbox')field.checked=!!opts.value;else field.value=opts.value??'';
  return field;
}
function seoButton(parent,label,fn,css='secondary'){
  const b=add(parent,'button',label,css);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){if(state.clientId===seoWorkClient&&$('seo-work-message'))showMessage('seo-work-message',e.message,true);}finally{b.disabled=false;}});return b;
}
function seoPanel(root,title,desc){
  const panel=add(root,'section',null,'panel');
  add(panel,'h2',title);if(desc)add(panel,'p',desc,'subtle');return panel;
}
function seoTable(root,columns){
  const scroll=add(root,'div',null,'seo-table-wrap'),table=add(scroll,'table',null,'seo-query-table');
  const head=add(add(table,'thead'),'tr');for(const label of columns)add(head,'th',label);
  return add(table,'tbody');
}
function seoEmpty(body,n,message){const td=add(add(body,'tr'),'td',message);td.colSpan=n;}
function seoNum(x){return x===undefined||x===null?'Not reported':Number(x).toLocaleString('en-GB',{maximumFractionDigits:1});}
function seoSubmit(form,fn){
  const b=add(form,'button','Save','primary');b.type='submit';
  form.onsubmit=async e=>{e.preventDefault();b.disabled=true;try{await fn();}catch(err){if($('seo-work-message'))showMessage('seo-work-message',err.message,true);}finally{b.disabled=false;}};
}
async function loadSeoWorkspace(force=false){
  if(!state.session?.admin||!state.clientId||portalView()!=='insights')return;
  const id=state.clientId,root=$('seo-workspace-root'),requestId=++seoWorkRequest;
  if(!force&&seoWorkClient===id&&seoWorkData){renderSeoWorkspace(root,id,seoWorkData);return;}
  seoWorkClient=id;seoWorkData=null;root.replaceChildren();add(root,'p','Loading SEO workspace…','subtle');
  try{
    const data=await api(seoEndpoint(id));
    if(requestId!==seoWorkRequest||state.clientId!==id||!state.session?.admin)return;
    seoWorkData=data;renderSeoWorkspace(root,id,data);
  }catch(e){if(requestId===seoWorkRequest&&state.clientId===id){root.replaceChildren();add(root,'p',e.message,'message error');seoButton(root,'Retry',()=>loadSeoWorkspace(true));}}
}
function renderSeoWorkspace(root,id,data){
  root.replaceChildren();
  const msg=add(root,'p','','message');msg.id='seo-work-message';msg.setAttribute('role','status');
  const active=()=>state.session?.admin&&state.clientId===id&&portalView()==='insights';
  const refresh=async()=>{if(active()){await loadSeoWorkspace(true);if(typeof loadPaidSeo==='function')void loadPaidSeo();if(typeof loadSeoActions==='function')void loadSeoActions();}};
  const send=async(path,payload,method='POST')=>{if(!active())throw Error('Reopen the correct business.');await jsonPost(seoEndpoint(id,path),payload,method);await refresh();};
  const remove=async(path)=>{if(!active()||!confirm('Remove this saved record?'))return;await api(seoEndpoint(id,path),{method:'DELETE'});await refresh();};
  const history=seoPanel(root,'Search performance history','Finalised Google Search Console measurements, not live rankings or estimated search volume.');
  if(!data.configured)add(history,'p','Connect your existing Search Console property and service account in Business settings.','message');
  else add(history,'p','Last successful sync: '+(data.sync.synced_at||'Not yet synced')+' · Status: '+data.sync.status,'subtle');
  seoButton(history,'Sync Search Console',()=>send('/sync',{})).disabled=!data.configured;
  const days=seoTable(history,['Date','Clicks','Impressions','CTR','Avg. position']);
  for(const r of [...data.daily].reverse()) {const row=add(days,'tr');for(const x of [r.day,seoNum(r.clicks),seoNum(r.impressions),(r.ctr*100).toFixed(1)+'%',seoNum(r.position)])add(row,'td',x);}
  if(!data.daily.length)seoEmpty(days,5,'No daily measurements saved yet.');
  const current=new Map((data.snapshot?.current||[]).map(r=>[r.query.trim().replace(/\s+/g,' ').toLowerCase(),r]));
  const previous=new Map((data.snapshot?.previous||[]).map(r=>[r.query.trim().replace(/\s+/g,' ').toLowerCase(),r]));
  const keywords=seoPanel(root,'Keyword manager','Add one keyword or import up to 200 at a time. A missing Search Console query is not proof of no ranking.');
  const edit=add(keywords,'form',null,'form-stack');edit.hidden=true;
  const create=add(keywords,'form',null,'form-stack');
  for(const [l,n,o] of [['Keyword','keyword',{required:true,max:200}],['Service','service',{max:100}],['Location','location',{max:100}],['Target page (HTTPS)','target_url',{type:'url',max:1500}]])seoField(create,l,n,o);
  seoSubmit(create,()=>send('/keywords',Object.fromEntries(new FormData(create))));
  const bulk=add(keywords,'form',null,'form-stack');
  const area=seoField(bulk,'Bulk keywords (one per line or first CSV column)','keywords',{type:'textarea',max:60000});
  const file=seoField(bulk,'Choose CSV or text file','file',{type:'file'});file.accept='.csv,.txt,text/csv,text/plain';
  file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;if(f.size>60000){file.value='';showMessage('seo-work-message','Choose a file under 60 KB.',true);return;}area.value=await f.text();});
  function parseBulk(text){return text.replace(/^\uFEFF/,'').split(/\r?\n/).map(line=>{const m=line.match(/^"((?:[^"]|"")*)"(?:,|$)/);return (m?m[1].replace(/""/g,'"'):line.split(',')[0]).trim();}).filter((x,i)=>x&&!(i===0&&/^(keyword|query|search term)$/i.test(x)));}
  seoSubmit(bulk,()=>send('/keywords',{keywords:parseBulk(area.value)}));
  const filter=seoField(keywords,'Filter saved keywords','filter',{placeholder:'Keyword, service or location'});
  const table=seoTable(keywords,['Keyword','Service / location','Target page','Clicks / impressions','Avg. position','Actions']);
  function renderSaved(){
    table.replaceChildren();const q=filter.value.toLowerCase();
    for(const k of data.keywords.filter(k=>[k.keyword,k.service,k.location,k.target_url].join(' ').toLowerCase().includes(q))){
      const row=add(table,'tr'),measured=current.get(k.keyword_key);
      for(const x of [k.keyword,[k.service,k.location].filter(Boolean).join(' / ')||'—',k.target_url||'—',measured?seoNum(measured.clicks)+' / '+seoNum(measured.impressions):'Not reported',measured?seoNum(measured.position):'Not reported'])add(row,'td',x);
      const actions=add(row,'td');seoButton(actions,'Edit',async()=>{edit.replaceChildren();edit.hidden=false;
        for(const [l,n] of [['Keyword','keyword'],['Service','service'],['Location','location'],['Target page','target_url']])seoField(edit,l,n,{value:k[n],required:n==='keyword',type:n==='target_url'?'url':'text'});
        seoSubmit(edit,()=>send('/keywords/'+k.id,Object.fromEntries(new FormData(edit)),'PATCH'));seoButton(edit,'Cancel',async()=>{edit.hidden=true;});edit.scrollIntoView({block:'nearest'});
      });seoButton(actions,'Remove',()=>remove('/keywords/'+k.id));
    }if(!table.children.length)seoEmpty(table,6,'No matching saved keywords.');
  }filter.addEventListener('input',renderSaved);renderSaved();
  const discovery=seoPanel(root,'Discovered search queries','Up to 500 reported queries per 28-day period. Change is shown only where Google reported both periods.');
  if(data.snapshot)add(discovery,'p',data.snapshot.from+' to '+data.snapshot.to+' · Prior: '+data.snapshot.previousFrom+' to '+data.snapshot.previousTo,'subtle');
  const qbody=seoTable(discovery,['Search query','Clicks','Impressions','Impression change','Avg. position','Save']);
  for(const q of data.snapshot?.current||[]){
    const r=add(qbody,'tr'),prior=previous.get(q.query.trim().replace(/\s+/g,' ').toLowerCase()),delta=prior?q.impressions-prior.impressions:null;
    for(const x of [q.query,seoNum(q.clicks),seoNum(q.impressions),delta===null?'Not reported':(delta>0?'+':'')+seoNum(delta),seoNum(q.position)])add(r,'td',x);
    const cell=add(r,'td');if(data.keywords.some(k=>k.keyword_key===q.query.trim().replace(/\s+/g,' ').toLowerCase()))add(cell,'span','Saved');else seoButton(cell,'Save',()=>send('/keywords',{keyword:q.query}));
  }
  if(!qbody.children.length)seoEmpty(qbody,6,'Sync Search Console to discover existing queries.');
  const links=seoPanel(root,'Backlinks & outreach','Record link prospects and confirmed links. Optional weekly checks look for a direct link on public HTML; blocked, redirected or large pages cannot be verified.');
  const linkForm=add(links,'form',null,'form-stack');
  const makeLinkForm=(row={})=>{
    linkForm.replaceChildren();
    for(const [l,n,o] of [['Source page','source_url',{type:'url',required:true}],['Your target page','target_url',{type:'url',required:true}],['Outreach contact','contact',{max:200}],['Outreach status','outreach_status',{options:[['prospect','Prospect'],['contacted','Contacted'],['follow-up','Follow up'],['secured','Secured'],['declined','Declined']]}],['Contacted on','contacted_on',{type:'date'}],['Follow up on','follow_up_on',{type:'date'}],['Notes','notes',{type:'textarea',max:2000}],['Enable automatic public-page checks','monitor',{type:'checkbox'}]])seoField(linkForm,l,n,{...o,value:n==='monitor'?!!row.monitor:(row[n]||'')});
    if(!row.id)linkForm.elements.outreach_status.value='prospect';
    seoSubmit(linkForm,()=>send(row.id?'/backlinks/'+row.id:'/backlinks',{...Object.fromEntries(new FormData(linkForm)),monitor:linkForm.elements.monitor.checked},row.id?'PATCH':'POST'));
    if(row.id)seoButton(linkForm,'Cancel edit',async()=>makeLinkForm());
  };makeLinkForm();
  const linkBody=seoTable(links,['Source / target','Outreach','Follow up','Verification','Actions']);
  for(const l of data.links){
    const r=add(linkBody,'tr'),urls=add(r,'td');
    add(urls,'div',l.source_url);add(urls,'small',l.target_url);
    const outreach=add(r,'td');add(outreach,'div',l.outreach_status);if(l.contact)add(outreach,'small',l.contact);
    add(r,'td',l.follow_up_on||'—');
    const check=add(r,'td');add(check,'div',l.check_status.replaceAll('-',' '));if(l.checked_at)add(check,'small',l.checked_at+' UTC');if(l.link_rel)add(check,'div','Rel: '+l.link_rel);if(l.monitor)add(check,'small','Monitoring enabled');
    const actions=add(r,'td');seoButton(actions,'Edit',async()=>{makeLinkForm(l);linkForm.scrollIntoView({block:'nearest'});});seoButton(actions,'Check',()=>send('/backlinks/'+l.id+'/check',{}));seoButton(actions,'Remove',()=>remove('/backlinks/'+l.id));
  }
  if(!linkBody.children.length)seoEmpty(linkBody,5,'No backlinks or outreach prospects saved.');
}
