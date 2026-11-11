'use strict';
/*
 * Portal v3 screen router. Each ?view=...&client=... is a distinct, bookmarkable
 * workspace page with only one content screen shown at a time.
 * The existing authentication and server-enforced tenant boundaries remain the source
 * of authority. Navigation state never grants server permissions.
 */
const agencyViews=new Set(['dashboard','businesses','ai','team']);
const businessViews=new Set(['overview','calendar','editorial','content','change','submissions','enquiries','customers','files','insights','settings']);
const clientViews=new Set(['overview','calendar','content','change','submissions','enquiries','customers','files']);
let portalMounted=false,portalBusy=false,portalAiLoaded=false,portalGbpClient='',portalPublishingClient='';
const portalView=()=>new URL(location.href).searchParams.get('view')||'';
const portalId=()=>new URL(location.href).searchParams.get('client')||'';
function mountPortal(){
  if(portalMounted)return;
  portalMounted=true;
  const move=(id,where)=>{
    const el=$(id),slot=$(where);
    if(el&&slot)slot.append(el);
  };
  move('calendar','business-calendar-slot');
  move('seo','business-seo-slot');
  move('enquiries','business-enquiry-slot');
  move('changes','business-change-slot');
  move('editorial','editorial-slot');
  move('uploads','business-files-slot');
  move('requests-panel','business-submissions-slot');
  move('profile','business-details-slot');
  move('client-form','client-create-slot');
  move('admin-message','client-create-slot');
  move('integration-token','client-create-slot');
  move('research-queue-now','ai-research-slot');
  move('research-message','ai-research-slot');
  move('research-queue','ai-research-slot');
  move('agency-lead-areas','ai-lead-areas-slot');
  move('client-settings','business-settings-slot');
  move('notification-errors','team-alerts-slot');
  move('member-form','team-form-slot');
  move('member-message','team-form-slot');
  $('admin-panel').classList.add('portal-legacy-hidden');
  document.querySelector('.two-col').classList.add('portal-legacy-hidden');
  $('screen-dashboard').parentElement.insertBefore($('overview'),$('screen-dashboard'));
  $('overview').classList.add('portal-business-heading');
  $('client-picker').closest('.account-picker').hidden=true;
  const addButton=document.createElement('button');
  addButton.id='portal-calendar-add';
  addButton.className='secondary';
  addButton.type='button';
  addButton.textContent='+ Plan a blog';
  $('calendar').querySelector('.calendar-widget-head').append(addButton);
  addButton.addEventListener('click',()=>{
    const y=calendarState.selectedDay||new Date().toISOString().slice(0,10);
    openCalendarComposer(y);
  });
  $('calendar-day-grid').addEventListener('click',event=>{
    const day=event.target.closest('button[data-date]');
    if(day&&state.session?.admin)openCalendarComposer(day.dataset.date);
  });
  document.addEventListener('click',event=>{
    const anchor=event.target.closest('a[data-portal-route],a[data-back-businesses]');
    if(!anchor||!state.session)return;
    event.preventDefault();
    if(anchor.hasAttribute('data-back-businesses')){portalNavigate('businesses');return;}
    const view=anchor.dataset.portalRoute;
    portalNavigate(view,agencyViews.has(view)?'':state.clientId);
  });
  window.addEventListener('popstate',()=>{
    if(state.session)portalSyncFromUrl(true);
  });
  // Existing section shortcuts use #anchors. Convert them to a real page route.
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    if(!link||!state.session)return;
    const alias={
      '#overview':'overview','#calendar':'calendar','#editorial':'editorial',
      '#agency-clients':'businesses','#research-queue':'ai','#admin-panel':'team',
      '#enquiries':'enquiries','#changes':'change','#blogs':'content','#uploads':'files',
      '#requests-panel':'submissions','#profile':'overview','#seo':'insights'
    };
    if(alias[link.getAttribute('href')]){
      event.preventDefault();
      const chosen=alias[link.getAttribute('href')];
      portalNavigate(!state.session.admin&&chosen==='editorial'?'submissions':chosen);
    }
  });
  $('content-request-files').addEventListener('change',showFileNames);
  const drop=$('content-upload-drop');
  for(const type of ['dragenter','dragover']){
    drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add('drag-active');});
  }
  for(const type of ['dragleave','drop'])drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('drag-active');});
  drop.addEventListener('drop',event=>{
    if(event.dataTransfer?.files?.length){
      $('content-request-files').files=event.dataTransfer.files;
      showFileNames();
    }
  });
  $('content-request-form').addEventListener('submit',submitContentRequest);
  $('calendar-create-form').addEventListener('submit',submitCalendarIdea);
  $('calendar-new-cancel').addEventListener('click',()=>{$('calendar-new-post').hidden=true;});
  $('portal-ai-form').addEventListener('submit',saveAiSettings);
  $('publishing-settings-form').addEventListener('submit',savePublishingSettings);
  $('gbp-connect').addEventListener('click',()=>{
    if(!state.session?.admin||!state.clientId)return;
    location.assign('/api/admin/gbp/connect?client='+encodeURIComponent(state.clientId));
  });
  $('gbp-disconnect').addEventListener('click',disconnectGbp);
  $('gbp-location-save').addEventListener('click',saveGbpLocation);
}
function showFileNames(){
  const names=Array.from($('content-request-files').files||[]).map(x=>x.name);
  $('content-file-summary').textContent=names.length?names.length+' attached: '+names.join(', '):'No files attached yet.';
}
function allowedView(view,admin){
  return admin ? agencyViews.has(view)||businessViews.has(view)&&view!=='enquiries'&&view!=='change'
    :clientViews.has(view);
}
function portalSyncFromUrl(fromHistory=false){
  if(!state.session)return;
  const admin=!!state.session.admin;
  const entries=state.session.clients||[];
  let view=portalView()||(admin?'dashboard':'overview');
  let target=portalId();
  const known=entries.some(e=>e.id===target);
  if(agencyViews.has(view)&&!admin)view='overview';
  if(businessViews.has(view)&&(!known||!allowedView(view,admin))){
    view=admin?'dashboard':'overview';
  }
  if(!allowedView(view,admin))view=admin?'dashboard':'overview';
  if(businessViews.has(view)){
    const client=entries.find(x=>x.id===target)||(!admin?entries[0]:null);
    if(!client){view=admin?'dashboard':'overview';}
    else{
      if(state.clientId!==client.id){
        state.clientId=client.id;
        $('client-picker').value=client.id;
        // The permitted content is fetched by the API before it becomes visible.
        portalClearScreens();
        loadDashboard().then(()=>portalRender()).catch(()=>{});
      }
      target=client.id;
    }
  }
  if(!fromHistory){
    const url=new URL(location.href);
    url.searchParams.set('view',view);
    if(agencyViews.has(view))url.searchParams.delete('client');
    else if(target)url.searchParams.set('client',target);
    history.replaceState({},'',url);
  }
  portalRender();
}
function portalClearScreens(){
  document.querySelectorAll('.portal-screen').forEach(el=>el.hidden=true);
}
async function portalNavigate(view,requestedClient){
  if(!state.session)return;
  const admin=state.session.admin;
  const next=allowedView(view,admin)?view:(admin?'dashboard':'overview');
  const id=agencyViews.has(next)?'':requestedClient||state.clientId||state.session.clients[0]?.id;
  if(businessViews.has(next)&&!state.session.clients.some(x=>x.id===id))return;
  const url=new URL(location.href);
  url.searchParams.set('view',next);
  if(id)url.searchParams.set('client',id);else url.searchParams.delete('client');
  history.pushState({},'',url);
  showMobileMore(false);
  if(id&&state.clientId!==id){
    state.clientId=id;
    $('client-picker').value=id;
    portalClearScreens();
    await loadDashboard();
  }
  portalRender();
  window.scrollTo({top:0,behavior:'auto'});
}
function portalRender(){
  if(!state.session||!portalMounted)return;
  const admin=!!state.session.admin;
  document.body.classList.toggle('portal-admin',admin);
  document.body.classList.toggle('portal-client',!admin);
  let view=portalView()||(admin?'dashboard':'overview');
  if(!allowedView(view,admin))view=admin?'dashboard':'overview';
  if(businessViews.has(view)&&!state.clientId)view=admin?'dashboard':'overview';
  const agency=agencyViews.has(view);
  const approvalsTarget=$(admin?'editorial-slot':'client-approval-slot');
  if(approvalsTarget&&$('editorial').parentElement!==approvalsTarget)
    approvalsTarget.append($('editorial'));
  portalClearScreens();
  const page=$('screen-'+view)||$('screen-'+(admin?'dashboard':'overview'));
  page.hidden=false;
  $('overview').hidden=agency;
  $('sidebar-agency-heading').hidden=!agency;
  $('sidebar-business-heading').hidden=agency;
  $('sidebar-context').textContent=agency?'Agency':'Business';
  $('portal-calendar-add').hidden=!admin;
  $('calendar-new-post').hidden=true;
  $('business-details-slot').hidden=!admin;
  for(const item of document.querySelectorAll('[data-portal-route]')){
    const permission=item.dataset.permission;
    const context=item.dataset.context;
    const permitted=(permission==='both'||(admin&&permission==='admin')||(!admin&&permission==='client')) &&
      (context==='agency'?admin:true);
    const isCurrent=context===(agency?'agency':'business');
    item.hidden=!(permitted&&isCurrent);
    item.classList.toggle('is-active',item.dataset.portalRoute===view);
    if(item.dataset.portalRoute===view)item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
  }
  document.querySelectorAll('[data-back-businesses]').forEach(a=>{a.hidden=!admin||agency;});
  // Use a four-icon bottom navigation plus More, not a scrolled menu.
  const tabs=Array.from(document.querySelectorAll('#workspace-mobile-nav a[data-portal-route]'));
  const picks=agency?['dashboard','businesses','ai']:admin?['overview','calendar','editorial','settings']:['overview','calendar','content','submissions'];
  for(const item of tabs)item.hidden=!picks.includes(item.dataset.portalRoute);
  $('sidebar-context').textContent=agency?'Agency workspace':(state.dashboard?.client?.name||'Your business');
  const names={dashboard:'Your businesses',businesses:'All businesses',ai:'AI & MCP',team:'Team and alerts',
    overview:'Overview',calendar:'Calendar',editorial:'Blog planner',content:'Content request',
    change:'Request a change',submissions:'Submissions',enquiries:'Enquiries',customers:'Customers',files:'Photos and documents',
    insights:'Search insights',settings:'Business settings'};
  document.title=names[view]+' | Client portal';
  if(admin&&agency)renderAgencyHome();
  if(businessViews.has(view))renderBusinessHome();
  if(admin&&view==='ai'&&!portalAiLoaded)loadAiSettings();
  if(admin&&view==='settings'&&portalPublishingClient!==state.clientId)loadPublishingSettings();
  if(admin&&view==='team')renderTeamOptions();
  if(view==='calendar'&&admin){
    fillCalendarBusinessOptions();
    const selected=$('calendar-client-filter');
    if(selected.value!==state.clientId){
      selected.value=state.clientId;
      loadCompactCalendar();
    }
  }
  if(!admin){
    $('idea-form').hidden=true;
    $('editorial').querySelector('.panel-heading h2').textContent='Articles for your review';
  }else{
    $('editorial').querySelector('.panel-heading h2').textContent='Blog calendar';
  }
}
function stat(parent,label,value,helper){
  const wrap=add(parent,'div',null,'portal-stat');
  add(wrap,'span',label,'portal-stat-label');
  add(wrap,'strong',String(value),'portal-stat-number');
  if(helper)add(wrap,'small',helper);
}
function agencyCard(client){
  const card=element('button',null,'portal-business-card');
  card.type='button';
  card.setAttribute('aria-label','Open '+client.name+' workspace');
  const top=add(card,'span',null,'portal-business-card-head');
  add(top,'strong',client.name);
  add(top,'span','→','portal-card-arrow');
  add(card,'span',client.domain,'portal-business-domain');
  const meta=add(card,'span',null,'portal-business-card-stats');
  add(meta,'span',(client.blog_published||0)+' published');
  add(meta,'span',(client.blog_planned||0)+' planned');
  add(meta,'span',(client.lead_last30||0)+' enquiries (30 days)');
  card.addEventListener('click',()=>portalNavigate('overview',client.id));
  return card;
}
function renderAgencyHome(){
  if(!state.session?.admin)return;
  const clients=agencyData.clients||[];
  const metrics=$('agency-stat-cards');metrics.replaceChildren();
  stat(metrics,'Active businesses',clients.length,'Your managed websites');
  stat(metrics,'Blogs published',clients.reduce((n,c)=>n+(c.blog_published||0),0),'Across client content calendars');
  stat(metrics,'Blogs planned',clients.reduce((n,c)=>n+(c.blog_planned||0),0),'With a target publication date');
  stat(metrics,'In progress',clients.reduce((n,c)=>n+(c.blog_open||0),0),'Ideas, drafts and reviews');
  for(const id of ['agency-dashboard-cards','agency-business-list']){
    const wrap=$(id);wrap.replaceChildren();
    if(!clients.length){
      const empty=add(wrap,'p','No businesses added yet. Open Businesses to create your first client.','empty');
      continue;
    }
    for(const client of clients)wrap.append(agencyCard(client));
  }
}
function businessShortcut(parent,view,title,sub){
  const button=add(parent,'button',null,'portal-shortcut');
  button.type='button';
  add(button,'strong',title);
  add(button,'span',sub);
  button.addEventListener('click',()=>portalNavigate(view,state.clientId));
}
function renderBusinessHome(){
  if(!state.dashboard?.client||!state.session)return;
  const admin=state.session.admin,posts=editorialData.posts||[],requests=state.dashboard.requests||[];
  const stats=$('business-stat-cards');stats.replaceChildren();
  const current=(agencyData.clients||[]).find(x=>x.id===state.clientId);
  stat(stats,'Blogs published',posts.filter(p=>p.status==='published').length,'Confirmed live articles');
  stat(stats,'Blog plans',posts.filter(p=>!!p.scheduled_at&&p.status!=='published'&&p.status!=='rejected').length,'With a date in the calendar');
  stat(stats,'Open requests',requests.filter(r=>r.status!=='complete').length,'Content and website changes');
  stat(stats,admin?'Enquiries (30 days)':'New enquiries',admin?current?.lead_last30||0:(state.dashboard.leads||[]).filter(l=>l.status==='new').length,'From connected forms');
  const links=$('business-quick-links');links.replaceChildren();
  businessShortcut(links,'calendar','Calendar','See what is coming up');
  businessShortcut(links,admin?'editorial':'content',admin?'Blog planner':'Request content',admin?'Manage articles and approvals':'Ideas, words and files in one form');
  businessShortcut(links,'submissions','Submissions','Follow the progress of requests');
  businessShortcut(links,admin?'settings':'change',admin?'Business settings':'Request a change',admin?'Website and Google connections':'Ask for a website update');
  const next=$('business-next-items');next.replaceChildren();
  const items=(calendarState.posts||[]).filter(x=>x.client_id===state.clientId&&x.day>=new Date().toISOString().slice(0,10))
    .sort((a,b)=>a.day.localeCompare(b.day)).slice(0,5);
  if(!items.length)add(next,'p','Nothing dated yet. Planned blogs will appear here once scheduled.','empty');
  for(const item of items){
    const row=add(next,'div',null,'portal-next-row');
    add(row,'strong',item.title);
    add(row,'span',item.day+' · '+item.status.replaceAll('-',' '),'meta');
    row.addEventListener('click',()=>portalNavigate('calendar'));
  }
}
function renderTeamOptions(){
  const select=$('team-business-select');const prev=select.value;select.replaceChildren();
  for(const c of state.session?.clients||[]){
    const o=add(select,'option',c.name);o.value=c.id;
  }
  select.value=state.session.clients.some(c=>c.id===prev)?prev:state.clientId;
}
function fillCalendarBusinessOptions(){
  const select=$('calendar-create-business');const prev=select.value;select.replaceChildren();
  for(const c of state.session?.clients||[]){const o=add(select,'option',c.name);o.value=c.id;}
  select.value=state.session.clients.some(c=>c.id===prev)?prev:state.clientId;
}
function openCalendarComposer(day){
  if(!state.session?.admin)return;
  fillCalendarBusinessOptions();
  $('calendar-new-post').hidden=false;
  const form=$('calendar-create-form');
  form.elements.namedItem('date').value=day;
  form.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function submitCalendarIdea(event){
  event.preventDefault();
  if(!state.session?.admin)return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
  const data=Object.fromEntries(new FormData(form).entries());
  const day=data.date,time=data.time,clientId=data.client_id;
  if(!state.session.clients.some(c=>c.id===clientId))return;
  button.disabled=true;
  try{
    const date=new Date(day+'T'+time+':00Z');
    if(!Number.isFinite(date.getTime()))throw Error('Choose a valid date and time.');
    await jsonPost('/api/editorial',{client_id:clientId,title:data.title,
      audience_question:data.audience_question,scheduled_at:date.toISOString()});
    showMessage('calendar-create-message','Planned idea saved for '+day+'. It will not publish automatically.');
    form.reset();
    $('calendar-new-post').hidden=true;
    await loadCompactCalendar();
    if(state.clientId===clientId)await loadEditorial();
    await loadAgencyOverview();
  }catch(err){showMessage('calendar-create-message',err.message,true);}
  finally{button.disabled=false;}
}
async function submitContentRequest(event){
  event.preventDefault();
  if(!state.session?.clients.some(x=>x.id===state.clientId))return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
  const data=new FormData(form);
  data.set('client_id',state.clientId);
  button.disabled=true;
  try{
    const r=await api('/api/content-requests',{method:'POST',body:data});
    form.reset();showFileNames();
    showMessage('content-request-message',r.message);
    await loadDashboard();
    if(state.session.admin)await loadAgencyOverview();
  }catch(err){showMessage('content-request-message',err.message,true);}
  finally{button.disabled=false;}
}
async function loadAiSettings(){
  if(!state.session?.admin)return;
  const box=$('ai-connection-cards');
  box.replaceChildren();
  try{
    const data=await api('/api/admin/ai-settings');
    portalAiLoaded=true;
    const form=$('portal-ai-form');
    for(const key of ['mcp_enabled','expose_search','expose_editorial','expose_research'])
      form.elements.namedItem(key).checked=!!data.settings[key];
    for(const [key,label] of [['mcp_token','MCP token'],['gsc','Search Console'],['research','Source discovery'],
      ['github_pr','GitHub review PRs'],['gbp_oauth','Google Business Profile OAuth']]){
      stat(box,label,data.connections[key]?'Configured':'Not connected',
        data.connections[key]?'Credentials detected, check permissions separately':'Add credentials in protected GitHub environment');
    }
    showMessage('ai-settings-message',data.settings.mcp_enabled?'Read-only MCP is enabled.':'MCP is switched off.');
  }catch(err){showMessage('ai-settings-message',err.message,true);}
}
async function saveAiSettings(event){
  event.preventDefault();
  if(!state.session?.admin)return;
  const form=event.currentTarget,button=form.querySelector('button');
  const fields={};
  for(const key of ['mcp_enabled','expose_search','expose_editorial','expose_research'])
    fields[key]=form.elements.namedItem(key).checked;
  button.disabled=true;
  try{
    const r=await jsonPost('/api/admin/ai-settings',fields,'PATCH');
    showMessage('ai-settings-message',r.message);
  }catch(err){showMessage('ai-settings-message',err.message,true);}
  finally{button.disabled=false;}
}
async function loadPublishingSettings(){
  if(!state.session?.admin||!state.clientId)return;
  const business=state.clientId;
  try{
    const data=await api('/api/admin/clients/'+business+'/publishing');
    if(state.clientId!==business)return;
    portalPublishingClient=business;
    const form=$('publishing-settings-form');
    form.elements.namedItem('repo').value=data.publishing.repo||'';
    form.elements.namedItem('path').value=data.publishing.path||'src/content/blog/';
    form.elements.namedItem('branch').value=data.publishing.branch||'main';
    $('gbp-url-input').value=data.client.google_business_profile_url||'';
    showMessage('publishing-settings-message',data.publishing.note);
    await loadGbpStatus();
  }catch(err){showMessage('publishing-settings-message',err.message,true);}
}
async function savePublishingSettings(event){
  event.preventDefault();if(!state.session?.admin)return;
  const form=event.currentTarget,button=form.querySelector('button');
  const details=Object.fromEntries(new FormData(form).entries());
  details.gbp_url=$('gbp-url-input').value.trim();
  button.disabled=true;
  try{
    const r=await jsonPost('/api/admin/clients/'+state.clientId+'/publishing',details,'PATCH');
    showMessage('publishing-settings-message',r.message);
  }catch(err){showMessage('publishing-settings-message',err.message,true);}
  finally{button.disabled=false;}
}
async function loadGbpStatus(){
  if(!state.session?.admin||!state.clientId)return;
  const target=state.clientId;
  const info=$('gbp-status');
  info.textContent='Checking this business connection…';
  $('gbp-location-controls').hidden=true;
  try{
    const r=await api('/api/admin/gbp/status?client='+encodeURIComponent(target));
    if(state.clientId!==target)return;
    info.textContent=r.connected?'Connected to Google'+(r.title?': '+r.title:'; choose a listing below.'):r.message;
    $('gbp-connect').disabled=!r.configured;
    $('gbp-connect').textContent=r.connected?'Reconnect Google account':'Connect with Google';
    $('gbp-disconnect').hidden=!r.connected;
    if(r.connected){
      try{
        const list=await api('/api/admin/gbp/locations?client='+encodeURIComponent(target));
        const select=$('gbp-location-select');select.replaceChildren();
        for(const loc of list.locations){
          const opt=add(select,'option',loc.title+(loc.websiteUri?' · '+loc.websiteUri:''));opt.value=loc.name;
        }
        if(r.location)select.value=r.location;
        $('gbp-location-controls').hidden=!list.locations.length;
        if(list.has_more)showMessage('gbp-message','More Google locations exist than currently listed. Narrow selection in Google Business Profile first.');
      }catch(err){showMessage('gbp-message',err.message,true);}
    }
  }catch(err){info.textContent=err.message;}
}
async function saveGbpLocation(){
  if(!state.session?.admin)return;
  try{
    const r=await jsonPost('/api/admin/gbp/location?client='+encodeURIComponent(state.clientId),
      {name:$('gbp-location-select').value},'PATCH');
    showMessage('gbp-message',r.message);
    await loadGbpStatus();
  }catch(err){showMessage('gbp-message',err.message,true);}
}
async function disconnectGbp(){
  if(!state.session?.admin||!confirm('Disconnect Google Business Profile from this business?'))return;
  try{
    const r=await api('/api/admin/gbp/disconnect?client='+encodeURIComponent(state.clientId),{method:'DELETE'});
    showMessage('gbp-message',r.message);
    await loadGbpStatus();
  }catch(err){showMessage('gbp-message',err.message,true);}
}
// Called at the end of the existing session and business data loaders.
window.portalPagesReady=function(){
  mountPortal();
  // Client user has only their own business; admin opens agency dashboard first.
  if(!portalView()) {
    const url=new URL(location.href);
    url.searchParams.set('view',state.session?.admin?'dashboard':'overview');
    if(!state.session?.admin&&state.clientId)url.searchParams.set('client',state.clientId);
    history.replaceState({},'',url);
  }
  portalSyncFromUrl(false);
};
window.portalBusinessDataReady=function(){
  if(!state.session||!portalMounted)return;
  if(portalView()==='overview')renderBusinessHome();
  if(state.session.admin&&agencyViews.has(portalView()))renderAgencyHome();
};
window.portalAgencyDataReady=function(){
  if(!state.session||!portalMounted)return;
  renderAgencyHome();
  if(portalView()==='overview')renderBusinessHome();
};
mountPortal();
