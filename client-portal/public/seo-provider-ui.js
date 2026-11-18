'use strict';
let paidSeq=0;
const paidPath=(id,p='')=>'/api/admin/seo-provider'+p+'?client='+encodeURIComponent(id);
const dollars=n=>'$'+(Number(n||0)/1000000).toFixed(3);
async function loadPaidSeo(){
 if(!state.session?.admin||!state.clientId||portalView()!=='insights')return;
 const id=state.clientId,seq=++paidSeq,root=$('seo-provider-root');
 root.replaceChildren();add(root,'p','Loading keyword research and rank tracking…','subtle');
 try{
  const [data,free]=await Promise.all([api(paidPath(id)),api(seoEndpoint(id))]);
  if(seq!==paidSeq||state.clientId!==id||!state.session?.admin||portalView()!=='insights')return;
  renderPaidSeo(root,id,data,free.keywords||[]);
 }catch(e){if(seq===paidSeq&&state.clientId===id){root.replaceChildren();add(root,'p',e.message,'message error');}}
}
function renderPaidSeo(root,id,data,keywords){
 root.replaceChildren();
 const msg=add(root,'p','','message');msg.setAttribute('role','status');
 const active=()=>state.session?.admin&&state.clientId===id&&portalView()==='insights';
 const spendOk=data.config.configured&&data.config.enabled&&data.config.cap>0;
 const guard=()=>{if(!active())throw Error('Open the correct business first.');};
 const paidCall=async(p,b,method='POST')=>{guard();return jsonPost(paidPath(id,p),b,method);};
 function action(parent,label,fn,disabled=false){
  const b=add(parent,'button',label,'secondary');b.type='button';b.disabled=disabled;
  b.addEventListener('click',async()=>{b.disabled=true;msg.textContent='Working…';msg.classList.remove('error');try{guard();await fn();msg.textContent='Done.';}catch(e){msg.textContent=e.message;msg.classList.add('error');}finally{b.disabled=disabled;}});
  return b;
 }
 function submit(form,label,fn,disabled=false){
  const b=add(form,'button',label,'primary');b.type='submit';b.disabled=disabled;
  form.onsubmit=async e=>{e.preventDefault();b.disabled=true;msg.textContent='Working…';msg.classList.remove('error');try{guard();await fn(Object.fromEntries(new FormData(form)));msg.textContent='Done.';}catch(e){msg.textContent=e.message;msg.classList.add('error');}finally{b.disabled=disabled;}};
 }
 const top=seoPanel(root,'Research & rank tracking','DataForSEO · on-demand data and optional weekly checks. Research estimates are not Search Console measurements.');
 const metrics=add(top,'div',null,'seo-metric-grid');
 measure(metrics,'Monthly budget',dollars(data.config.cap),'USD · agency-wide');
 measure(metrics,'Used / reserved',dollars(data.spend.used),data.spend.month+' UTC');
 measure(metrics,'Unconfirmed cost',dollars(data.spend.unconfirmed),'Included in used / reserved');
 add(top,'p',spendOk?'Paid requests enabled. Only opted-in monitoring runs automatically.':'Paid requests disabled. Add the Cloudflare secrets and enable the integration when ready.','message');
 action(top,'Refresh usage & saved results',loadPaidSeo);
 const research=seoPanel(root,'Keyword Explorer','UK-wide estimates by default. Data freshness and availability vary. Keyword difficulty is the provider’s estimate, not a guarantee.');
 const form=add(research,'form',null,'form-stack');
 seoField(form,'Seed keywords (one per line; up to 20)','seeds',{type:'textarea',required:true});
 seoField(form,'Market (full provider location)','location',{value:'United Kingdom'});
 seoField(form,'Research mode','mode',{value:'ideas',options:[['ideas','Related keyword ideas'],['overview','Exact keyword metrics']]});
 const results=add(research,'div');
 function renderKeywordRows(parent,rows,competitor=false){
  parent.replaceChildren();const body=seoTable(parent,competitor?['Keyword','Volume','Difficulty','Intent','Position','Ranking page','Save']:['Keyword','Volume','Difficulty','Intent','CPC (USD)','Save']);
  for(const r of rows||[]){
   const tr=add(body,'tr'),values=[r.keyword,seoNum(r.volume),seoNum(r.difficulty),r.intent||'Not reported',...(competitor?[seoNum(r.position),r.url||'—']:[seoNum(r.cpc)])];
   for(const x of values)add(tr,'td',x);
   const cell=add(tr,'td');action(cell,'Save keyword',async()=>{await jsonPost(seoEndpoint(id,'/keywords'),{keyword:r.keyword});await loadSeoWorkspace(true);});
  }
  if(!body.children.length)seoEmpty(body,competitor?7:6,'No rows returned.');
 }
 submit(form,'Research keywords',async b=>{const r=await paidCall('/'+b.mode,{keywords:b.seeds.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),location:b.location});renderKeywordRows(results,r.rows);add(results,'p',(r.cached?'Cached · ':'Fetched · ')+r.fetched_at,'subtle');},!spendOk);
 const comp=seoPanel(root,'Competitor Explorer','Find organic keyword rankings for a domain from the provider’s index (up to 100 rows, not a live rank check).');
 const cform=add(comp,'form',null,'form-stack');
 seoField(cform,'Competitor domain','domain',{required:true,placeholder:'example.co.uk'});
 seoField(cform,'Market','location',{value:'United Kingdom'});
 const cres=add(comp,'div');
 submit(cform,'Research competitor',async b=>{const r=await paidCall('/competitor',b);renderKeywordRows(cres,r.rows,true);add(cres,'p',(r.cached?'Cached · ':'Fetched · ')+r.fetched_at,'subtle');},!spendOk);
 const rank=seoPanel(root,'Independent rank tracker','Google organic results, up to 30 positions. Location and device are fixed for each target. Not Google Maps or Search Console averages. Weekly checks are opt-in and subject to budget and capacity.');
 const rf=add(rank,'form',null,'form-stack');
 seoField(rf,'Saved keyword','keyword_id',{required:true,options:[['','Select a saved keyword'],...keywords.map(k=>[k.id,k.keyword])]});
 seoField(rf,'Search location (exact provider name)','location',{value:'United Kingdom',required:true,placeholder:'Swindon,England,United Kingdom'});
 seoField(rf,'Device','device',{value:'desktop',options:[['desktop','Desktop'],['mobile','Mobile']]});
 seoField(rf,'Enable weekly checks','enabled',{type:'checkbox'});
 submit(rf,'Add rank target',async b=>{await paidCall('/targets',{...b,enabled:rf.elements.enabled.checked});await loadPaidSeo();});
 const rt=seoTable(rank,['Keyword','Location / device','Organic position','Last checked','Schedule','Actions']);
 const history=add(rank,'div');
 for(const t of data.tracked){
  const tr=add(rt,'tr');
  for(const x of [t.keyword,t.location+' / '+t.device,t.last_check?(t.position??'Not found in returned results'):'Not checked',t.last_check||'—',t.enabled?'Weekly · '+t.status:'Manual · '+t.status])add(tr,'td',x);
  const a=add(tr,'td');
  action(a,'Check now',async()=>{if(!confirm('Run a paid rank check?'))return;await paidCall('/targets/'+t.id+'/check',{});await loadPaidSeo();},!spendOk);
  action(a,t.enabled?'Pause':'Enable',async()=>{await paidCall('/targets/'+t.id,{enabled:!t.enabled},'PATCH');await loadPaidSeo();});
  action(a,'History',async()=>{const r=await api(paidPath(id,'/targets/'+t.id+'/history'));history.replaceChildren();add(history,'h3',t.keyword+' · '+t.location+' · '+t.device);const table=seoTable(history,['Checked','Position','Ranking URL','Results checked','Top competitors']);for(const x of r.history){const row=add(table,'tr');for(const val of [x.checked_at,x.position??'Not found',x.url||'—',x.result_count,x.rivals.map(v=>v.position+'. '+v.domain).join(', ')])add(row,'td',val);}if(!table.children.length)seoEmpty(table,5,'No rank checks saved.');});
  action(a,'Remove',async()=>{if(!confirm('Remove target and its history?'))return;await api(paidPath(id,'/targets/'+t.id),{method:'DELETE'});await loadPaidSeo();});
 }
 if(!rt.children.length)seoEmpty(rt,6,'No independent rank targets saved.');
 const back=seoPanel(root,'Backlink discovery','A capped provider index sample (up to 100). New/lost labels come from the provider; absence from this sample does not mean a link was lost.');
 const cache=data.cache.find(x=>x.kind==='backlinks'&&x.key===data.domain),br=add(back,'div');
 function backlinkRows(r){br.replaceChildren();add(br,'p','Provider total: '+seoNum(r.total)+' · Sample fetched: '+r.fetched_at,'subtle');const body=seoTable(br,['Source','Target','Domain rank /100','Provider status','Outreach record']);for(const x of r.rows||[]){const row=add(body,'tr');for(const s of [x.source,x.target,seoNum(x.rank),x.lost?'Reported lost':x.new?'Reported new':'Reported'])add(row,'td',s);const cell=add(row,'td');action(cell,'Save',()=>jsonPost(seoEndpoint(id,'/backlinks'),{source_url:x.source,target_url:x.target,outreach_status:'prospect',monitor:false,notes:'Discovered by DataForSEO; not independently verified.'}));}if(!body.children.length)seoEmpty(body,5,'No backlink rows returned.');}
 if(cache)backlinkRows(cache);
 action(back,'Discover backlinks',async()=>{backlinkRows(await paidCall('/backlinks',{}));},!spendOk);
 action(back,'Refresh from provider (paid)',async()=>{if(confirm('Request a new paid backlink sample?'))backlinkRows(await paidCall('/backlinks',{force:true}));},!spendOk);
 action(back,data.discovery.enabled?'Pause weekly discovery':'Enable weekly discovery',async()=>{await paidCall('/backlink-settings',{enabled:!data.discovery.enabled});await loadPaidSeo();});
 const recent=seoPanel(root,'Saved research','Recent cached research is available without paying again.');
 for(const r of data.cache.filter(r=>r.kind!=='backlinks')){
  action(recent,r.kind+' · '+r.key+' · '+r.fetched_at,async()=>{let box=recent.querySelector('.saved-research-results');if(!box)box=add(recent,'div',null,'saved-research-results');renderKeywordRows(box,r.rows,r.kind==='competitor');});
 }
}
