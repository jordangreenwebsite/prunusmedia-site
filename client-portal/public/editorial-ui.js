'use strict';
// Additive UI for the shared portal's editorial calendar and private files.
// Reuses the existing authenticated api(), state, date() and DOM-safe element() helpers.
let editorialData = {posts:[],config:null};
let agencyData = {clients:[],lead_areas:[],research_queue:[]};
function labelField(form,title,tag='input',value='',opts={}) {
  const label=add(form,'label',title), input=add(label,tag);
  input.name=opts.name||'';
  if (tag==='input')input.type=opts.type||'text';
  if (tag==='textarea')input.rows=opts.rows||3;
  input.value=value||'';
  if(opts.placeholder)input.placeholder=opts.placeholder;
  if(opts.maxLength)input.maxLength=opts.maxLength;
  if(opts.required)input.required=true;
  return input;
}
function aLink(parent,text,href) {
  const link=add(parent,'a',text);
  link.href=href;
  link.target='_blank';
  link.rel='noopener noreferrer';
  return link;
}
const stageName=s=>({idea:'Idea',research:'Research',draft:'Draft','internal-review':'Editorial check','client-review':'Client approval',approved:'Approved',scheduled:'Scheduled',published:'Published',rejected:'Needs revision'}[s]||s);
function parseSourceLines(text) {
  const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
  if(lines.length>12)throw Error('Use no more than 12 source links.');
  return lines.map(line=>{
    const parts=line.split('|').map(s=>s.trim());
    if(parts.length!==3)throw Error('Enter sources as Title | https://example.org/page | YYYY-MM-DD, one per line.');
    return {title:parts[0],url:parts[1],checked_at:parts[2]};
  });
}
function sourceLines(text) {
  try{return JSON.parse(text||'[]').map(s=>s.title+' | '+s.url+' | '+s.checked_at).join('\n');}
  catch{return '';}
}
function renderEditorial(posts) {
  $('editorial-count').textContent=posts.length+' article'+(posts.length===1?'':'s');
  const filtered=$('editorial-filter').value;
  const displayPosts=state.session?.admin?posts:posts.filter(p=>['client-review','approved','scheduled','published'].includes(p.status));
  const visible=filtered==='all'?displayPosts:displayPosts.filter(p=>p.status===filtered);
  const root=$('editorial-list');root.replaceChildren();
  if(!visible.length){add(root,'p',posts.length?'Nothing in this stage yet.':'No blog ideas yet. Add the first useful customer question above.','empty');return;}
  for(const post of visible) {
    const box=add(root,'article',null,'item blog-item');
    const header=add(box,'div',null,'row');
    add(header,'strong',post.title);
    add(header,'span',stageName(post.status),'tag');
    add(box,'p',post.audience_question||'','blog-question');
    add(box,'div','Added '+date(post.created_at)+' · Suggested by '+post.suggested_by,'meta');
    if(post.scheduled_at)add(box,'p','Planned: '+date(post.scheduled_at),'meta');
    if(post.published_url)aLink(box,'Read published article',post.published_url);
    if(post.target_query)add(box,'p','Target question: '+post.target_query,'meta');
    if(post.review_note)add(box,'p','Editorial feedback: '+post.review_note);
    if(!state.session.admin && post.status==='client-review') {
      const article=add(box,'details',null,'draft-preview');
      add(article,'summary','Read article for approval');
      add(article,'p',post.draft||'Draft is not available.','draft-copy');
      const note=labelField(box,'Comments or corrections','textarea','',{name:'note',rows:2,placeholder:'What would you like changed?'});
      const actions=add(box,'div',null,'editorial-actions');
      const approve=add(actions,'button','Approve article','primary');approve.type='button';
      const revise=add(actions,'button','Request changes','secondary');revise.type='button';
      const result=add(box,'p','','message');
      async function decision(value) {
        approve.disabled=revise.disabled=true;
        try {
          await jsonPost('/api/editorial/'+post.id+'/decision',{approve:value,note:note.value});
          result.textContent=value?'Thank you. Article approved.':'Changes requested. Prunus will review your comments.';
          await loadEditorial();
        } catch(e){result.textContent=e.message;result.classList.add('error');}
        finally{approve.disabled=revise.disabled=false;}
      }
      approve.addEventListener('click',()=>decision(true));
      revise.addEventListener('click',()=>decision(false));
    }
    if(state.session.admin) {
      const toggle=add(box,'details',null,'editorial-edit');
      add(toggle,'summary','Edit research, draft and schedule');
      const form=add(toggle,'form',null,'form-stack');
      const statusLabel=add(form,'label','Editorial stage');
      const stage=add(statusLabel,'select');stage.name='status';
      for(const s of ['idea','research','draft','internal-review','client-review','approved','scheduled','published','rejected']) {
        const option=element('option',stageName(s));option.value=s;stage.append(option);
      }
      stage.value=post.status;
      labelField(form,'Target search question','input',post.target_query,{name:'target_query',maxLength:180});
      labelField(form,'Research brief and article outline','textarea',post.brief,{name:'brief',rows:5,maxLength:12000});
      labelField(form,'Article draft (plain text or Markdown)','textarea',post.draft,{name:'draft',rows:10,maxLength:70000});
      labelField(form,'Verified references: Title | HTTPS URL | YYYY-MM-DD','textarea',sourceLines(post.sources_json),{name:'sources',rows:4});
      labelField(form,'Evidence and facts checked','textarea',post.evidence_note,{name:'evidence_note',rows:3,maxLength:12000});
      labelField(form,'Client or internal review notes','textarea',post.review_note,{name:'review_note',rows:2,maxLength:2000});
      const schedule=labelField(form,'Planned publication time','input',post.scheduled_at?post.scheduled_at.slice(0,16):'',{name:'scheduled_at',type:'datetime-local'});
      labelField(form,'Verified public URL (only after deployment)','input',post.published_url||'',{name:'published_url',type:'url',maxLength:700});
      add(form,'p','Scheduling does not publish. A checked site pull request and verified live URL are required.','subtle');
      const button=add(form,'button','Save editorial changes','secondary');button.type='submit';
      const message=add(form,'p','','message');
      form.addEventListener('submit',async event=>{
        event.preventDefault();busy(button,true);
        try{
          const data=Object.fromEntries(new FormData(form).entries());
          data.sources=parseSourceLines(data.sources||'');
          if(data.scheduled_at)data.scheduled_at=new Date(schedule.value).toISOString();
          else data.scheduled_at='';
          const res=await jsonPost('/api/admin/editorial/'+post.id,data,'PATCH');
          message.textContent=res.message||'Saved';
          await loadEditorial();
          await loadAgencyOverview();
        }catch(e){message.textContent=e.message;message.classList.add('error');}
        finally{busy(button,false);}
      });
      renderGitHubPrControl(box,post);
    }
  }
}
async function loadEditorial() {
  if(!state.clientId)return;
  const data=await api('/api/editorial?client='+encodeURIComponent(state.clientId));
  editorialData=data;
  $('idea-form').hidden=!state.session.admin && !data.config.allow_client_ideas;
  renderEditorial(data.posts);
  const form=$('settings-form');
  $('client-settings').hidden=!state.session.admin;
  if(state.session.admin){
    const fields=form.elements;
    fields.namedItem('brand').value=data.config.brand;
    fields.namedItem('industry').value=data.config.industry||'';
    fields.namedItem('service_area').value=data.config.service_area||'';
    fields.namedItem('voice_notes').value=data.config.voice_notes||'';
    fields.namedItem('search_console_url').value=data.config.search_console_url||'';
    fields.namedItem('gsc_property').value=data.config.gsc_property||'';
    fields.namedItem('requires_blog_approval').checked=!!data.config.requires_blog_approval;
    fields.namedItem('allow_client_ideas').checked=!!data.config.allow_client_ideas;
    fields.namedItem('allow_client_uploads').checked=!!data.config.allow_client_uploads;
  }
  // Keep the dashboard's dated plan current after editorial edits and approvals.
  await loadCompactCalendar();
}
async function loadUploads() {
  if(!state.clientId)return;
  const results=await api('/api/uploads?client='+encodeURIComponent(state.clientId));
  $('upload-form').hidden=!state.session.admin && !editorialData.config?.allow_client_uploads;
  const root=$('upload-list');root.replaceChildren();
  if(!results.entries.length){add(root,'p','No files uploaded yet.','empty');return;}
  for (const item of results.entries){
    const box=add(root,'div',null,'item');
    const link=add(box,'a',item.file_name);
    link.href='/api/uploads/'+item.id;
    link.download=item.file_name;
    add(box,'div',Math.ceil(item.file_size/1024)+' KB · '+date(item.created_at)+' · '+item.uploaded_by,'meta');
    if(item.notes)add(box,'p',item.notes);
  }
}
async function loadExtended() {
  await Promise.all([loadEditorial(),loadUploads()]);
}
function selectAgencyClient(clientId) {
  state.clientId=clientId;
  $('client-picker').value=clientId;
  loadDashboard();
  location.hash='#editorial';
}
function renderAgencyOverview() {
  const grid=$('agency-clients');grid.replaceChildren();
  if(!agencyData.clients.length)add(grid,'p','No website clients added yet.','empty');
  for(const client of agencyData.clients){
    const card=add(grid,'div',null,'agency-client');
    add(card,'strong',client.name);
    add(card,'div',client.domain,'meta');
    if(client.contact_email)add(card,'div','Owner: '+client.contact_email,'meta');
    const stats=add(card,'div',null,'agency-stats');
    add(stats,'span',client.lead_last30+' leads (30 days)');
    add(stats,'span',client.blog_open+' active blogs');
    add(stats,'span',client.awaiting_approval+' needing approval');
    add(stats,'span',client.uploads+' files');
    const actions=add(card,'div',null,'editorial-actions');
    const choose=add(actions,'button','Open workspace','secondary');
    choose.type='button';choose.addEventListener('click',()=>selectAgencyClient(client.id));
    if(client.search_console_url)aLink(actions,'Open Search Console',client.search_console_url);
  }
  const locations=$('agency-lead-areas');locations.replaceChildren();
  const selected=agencyData.lead_areas.filter(e=>!state.clientId||e.client_id===state.clientId).slice(0,60);
  if(!selected.length)add(locations,'p','No postcode-area activity saved for this website yet.','empty');
  for(const item of selected){
    const line=add(locations,'div',null,'stat-line');
    add(line,'span',item.day+' · '+item.area);
    add(line,'strong',item.count+' '+(item.count===1?'enquiry':'enquiries'));
  }
  const queue=$('research-queue');queue.replaceChildren();
  if(!agencyData.research_queue.length)add(queue,'p','No research tasks waiting.','empty');
  for(const job of agencyData.research_queue){
    const wrap=add(queue,'div',null,'item');
    add(wrap,'strong',job.client_name);
    add(wrap,'span','Week of '+job.week_start+' · '+job.status,'meta');
    if(job.discovery_query)add(wrap,'p','Search: '+job.discovery_query,'meta');
    let candidates=[];
    try{candidates=JSON.parse(job.candidate_sources_json||'[]');}catch{}
    if(candidates.length){
      add(wrap,'p','Source candidates (not verified). Open the original pages, check facts and confirm they apply to the client.','subtle');
      const refs=add(wrap,'div',null,'source-candidates');
      for(const source of candidates.slice(0,10)){
        try {
          const url=new URL(source.url);
          if(url.protocol!=='https:')continue;
          const link=add(refs,'a',source.title||source.url,'source-candidate');
          link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
          add(refs,'small',url.hostname+' · Candidate only. Not fact-checked.');
        }catch{}
      }
    }
    const discover=add(wrap,'button',candidates.length?'Refresh source candidates':'Find source candidates','secondary');
    discover.type='button';
    const discoverMessage=add(wrap,'p','','message');
    discover.addEventListener('click',async()=>{
      discover.disabled=true;
      discoverMessage.classList.remove('error');
      try{
        const r=await jsonPost('/api/admin/research/'+job.id+'/discover',{});
        discoverMessage.textContent=r.sources.length+' source candidates found. Check each page before marking the research complete.';
        await loadAgencyOverview();
      }catch(err){discoverMessage.textContent=err.message;discoverMessage.classList.add('error');}
      finally{discover.disabled=false;}
    });

    const form=add(wrap,'form',null,'form-stack');
    const text=labelField(form,'Source links and research notes','textarea',job.research_note,{name:'research_note',rows:2,maxLength:4000});
    const label=add(form,'label','Research stage'),select=add(label,'select');
    select.name='status';
    for(const s of ['queued','working','complete','failed']){const opt=element('option',s);opt.value=s;select.append(opt);}
    select.value=job.status;
    const btn=add(form,'button','Update research task','secondary');btn.type='submit';
    const message=add(form,'p','','message');
    form.addEventListener('submit',async e=>{
      e.preventDefault();busy(btn,true);
      try{await jsonPost('/api/admin/research/'+job.id,{status:select.value,research_note:text.value},'PATCH');await loadAgencyOverview();}
      catch(err){message.textContent=err.message;message.classList.add('error');}
      finally{busy(btn,false);}
    });
  }
}
async function loadAgencyOverview() {
  if(!state.session?.admin)return;
  try{
    agencyData=await api('/api/admin/overview');
    renderAgencyOverview();
    if(window.portalAgencyDataReady)window.portalAgencyDataReady();
    await loadCompactCalendar();
  }catch(e){showMessage('research-message','Admin overview unavailable: '+e.message,true);}
}
$('idea-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button');
  busy(btn,true);
  try {
    const data=Object.fromEntries(new FormData(form).entries());
    await jsonPost('/api/editorial',{client_id:state.clientId,...data});
    form.reset();showMessage('idea-message','Idea added to the editorial calendar.');
    await loadEditorial();
    if(state.session.admin)await loadAgencyOverview();
  }catch(err){showMessage('idea-message',err.message,true);}
  finally{busy(btn,false);}
});
$('editorial-filter').addEventListener('change',()=>renderEditorial(editorialData.posts));
$('upload-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button');
  const data=new FormData(form);data.set('client_id',state.clientId);
  busy(btn,true);
  try{
    const result=await api('/api/uploads',{method:'POST',body:data});
    form.reset();showMessage('upload-message',result.message);
    await loadUploads();if(state.session.admin)await loadAgencyOverview();
  }catch(err){showMessage('upload-message',err.message,true);}
  finally{busy(btn,false);}
});
$('settings-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button');
  const data=Object.fromEntries(new FormData(form).entries());
  for(const key of ['requires_blog_approval','allow_client_ideas','allow_client_uploads'])data[key]=form.elements.namedItem(key).checked;
  busy(btn,true);
  try{
    const res=await jsonPost('/api/admin/clients/'+state.clientId+'/settings',data,'PATCH');
    showMessage('settings-message',res.message);await loadEditorial();await loadAgencyOverview();
  }catch(err){showMessage('settings-message',err.message,true);}
  finally{busy(btn,false);}
});
$('research-queue-now').addEventListener('click',async e=>{
  const button=e.currentTarget;busy(button,true);
  try{const r=await jsonPost('/api/admin/research/queue',{});showMessage('research-message',r.queued+' new tasks queued for this week.');await loadAgencyOverview();}
  catch(err){showMessage('research-message',err.message,true);}
  finally{busy(button,false);}
});
