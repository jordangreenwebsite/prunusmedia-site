'use strict';
let growthSeq=0;
async function loadSeoGrowth(){
 if(!state.session?.admin||!state.clientId||portalView()!=='insights')return;
 const id=state.clientId,seq=++growthSeq,root=$('seo-growth-root');
 const active=()=>state.session?.admin&&state.clientId===id&&portalView()==='insights'&&seq===growthSeq;
 const path=(p='')=>'/api/admin/seo-growth'+p+'?client='+encodeURIComponent(id);
 root.replaceChildren();add(root,'p','Loading local visibility and conversions…','subtle');
 try{
  const data=await api(path());if(!active())return;root.replaceChildren();
  const msg=add(root,'p','','message');msg.setAttribute('role','status');
  const go=async fn=>{if(!active())return;try{await fn();if(active()){msg.textContent='Done.';msg.classList.remove('error');}}catch(e){if(active()){msg.textContent=e.message;msg.classList.add('error');}}};
  const button=(p,name,fn)=>{const b=add(p,'button',name,'secondary');b.type='button';b.addEventListener('click',()=>go(async()=>{b.disabled=true;try{await fn();}finally{b.disabled=false;}}));return b;};
  const formButton=(form,name,fn)=>{const b=add(form,'button',name,'primary');b.type='submit';form.onsubmit=e=>{e.preventDefault();void go(async()=>{b.disabled=true;try{await fn(Object.fromEntries(new FormData(form)));}finally{b.disabled=false;}});};};
  const dates=()=>{const t=new Date(Date.now()-4*86400000),s=new Date(t.getTime()-27*86400000);return [s.toISOString().slice(0,10),t.toISOString().slice(0,10)];};
  const period=(panel,fn)=>{const f=add(panel,'form',null,'form-stack'),[s,t]=dates();seoField(f,'Start date','start',{type:'date',value:s,required:true});seoField(f,'End date','end',{type:'date',value:t,required:true});formButton(f,'Load performance',fn);};
  const conv=seoPanel(root,'Enquiries & conversion tracking','GA4 event counts. A phone or WhatsApp click is not proof of a completed call or conversation. Events require site instrumentation and consent. Organic attribution uses the session channel.');
  const ev=add(conv,'div');
  period(conv,async b=>{const r=await api(path('/conversions')+'&start='+encodeURIComponent(b.start)+'&end='+encodeURIComponent(b.end));if(!active())return;ev.replaceChildren();add(ev,'p','Analytics: '+r.status,'subtle');const t=seoTable(ev,['Event','All channels','Organic search']);for(const [k,l] of [['generate_lead','Successful form events'],['phone_click','Phone clicks'],['whatsapp_click','WhatsApp clicks']]){const row=add(t,'tr');for(const v of [l,seoNum(r.all?.[k]),seoNum(r.organic?.[k])])add(row,'td',v);}});
  const gbp=seoPanel(root,'Google Business Profile performance','Live data for the connected listing only. No saved API snapshots. Google API approval and an authorised account are required.');
  const gout=add(gbp,'div');
  period(gbp,async b=>{const r=await api(path('/gbp')+'&start='+encodeURIComponent(b.start)+'&end='+encodeURIComponent(b.end));if(!active())return;gout.replaceChildren();add(gout,'p','Business Profile: '+r.status||'Unavailable','subtle');const tb=seoTable(gout,['Metric','Sum of reported days','Days reported']);for(const s of r.series||[]){const v=s.values.filter(x=>x.value!==null&&Number.isFinite(Number(x.value)));const row=add(tb,'tr');for(const x of [s.metric.replaceAll('_',' ').toLowerCase(),v.length?seoNum(v.reduce((n,x)=>n+Number(x.value),0)):'Not reported',String(v.length)])add(row,'td',x);}if(!tb.children.length)seoEmpty(tb,3,'No performance metrics available. Check the Google connection in business settings.');});
  const maps=seoPanel(root,'Google Maps rank tracking','Independent location-specific Maps results, not a geographic grid. Use the exact verified Google Place ID or CID. Paid weekly checks are optional and use the shared provider budget.');
  const mf=add(maps,'form',null,'form-stack');
  seoField(mf,'Saved keyword','keyword_id',{value:'',required:true,options:[['','Select keyword'],...data.keywords.map(k=>[k.id,k.keyword])]});
  seoField(mf,'Google Place ID or cid:NUMBER','place_identity',{required:true,max:170});
  seoField(mf,'Exact search location','location',{value:'United Kingdom',required:true,max:180});
  seoField(mf,'Enable paid weekly checks','enabled',{type:'checkbox'});
  formButton(mf,'Add Maps target',async b=>{if(mf.elements.enabled.checked&&!confirm('Enable paid weekly Maps checks?'))return;await jsonPost(path('/maps'),{...b,enabled:mf.elements.enabled.checked});await loadSeoGrowth();});
  const mt=seoTable(maps,['Keyword','Market','Listing ID','Maps rank','Last checked','Monitoring','Actions']);
  for(const t of data.maps){const row=add(mt,'tr');for(const x of [t.keyword,t.location,t.place_identity,t.checked_at?(t.position??'Not found in sample'):'Not checked',t.checked_at||'—',t.enabled?'Weekly':'Manual / paused'])add(row,'td',x);const a=add(row,'td');const check=button(a,'Check now',async()=>{if(!data.paid)throw Error('Enable DataForSEO first.');if(!confirm('Run paid Maps check?'))return;await jsonPost(path('/maps/'+t.id+'/check'),{});await loadSeoGrowth();});check.disabled=!data.paid;button(a,t.enabled?'Pause':'Enable weekly',async()=>{if(!t.enabled&&!confirm('Enable weekly paid checks?'))return;await jsonPost(path('/maps/'+t.id+'/toggle'),{enabled:!t.enabled});await loadSeoGrowth();});}
  if(!mt.children.length)seoEmpty(mt,7,'No Maps targets yet.');
  const ch=seoPanel(root,'Website change history','Record completed changes, their date and optional GitHub reference. Share selected titles in monthly reports. This does not automatically import GitHub commits.');
  const cf=add(ch,'form',null,'form-stack');
  seoField(cf,'Change title','title',{required:true,max:180});seoField(cf,'Date completed','changed_on',{type:'date',required:true,value:new Date().toISOString().slice(0,10)});seoField(cf,'Internal detail','detail',{type:'textarea',max:1200});seoField(cf,'Commit or change reference','reference',{max:300});seoField(cf,'Reviewed title is suitable for the client report','shared',{type:'checkbox'});
  formButton(cf,'Record completed website change',async b=>{await jsonPost(path('/changes'),{...b,shared:cf.elements.shared.checked});await loadSeoGrowth();});
  const ct=seoTable(ch,['Date','Change','Internal detail','Reference','Report visibility']);for(const x of data.changes){const row=add(ct,'tr');for(const v of [x.changed_on,x.title,x.detail,x.reference,x.shared?'Shared':'Private'])add(row,'td',v);}if(!ct.children.length)seoEmpty(ct,5,'No changes recorded.');
 }catch(e){if(active()){root.replaceChildren();add(root,'p',e.message,'message error');}}
}
