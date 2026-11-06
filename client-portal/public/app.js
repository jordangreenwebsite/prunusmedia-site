'use strict';
const $ = id => document.getElementById(id);
const state = { email: '', session: null, clientId: null, dashboard: null };
function element(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) e.textContent = String(text);
  if (className) e.className = className;
  return e;
}
function add(parent, tag, text, className) { const e = element(tag,text,className); parent.append(e); return e; }
function showMessage(id, text, bad = false) {
  const e = $(id); e.textContent = text || ''; e.classList.toggle('error', bad);
}
function date(value) {
  if (!value) return '';
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});
}
async function api(path, opts = {}) {
  const response = await fetch(path,{credentials:'same-origin',...opts});
  const result = await response.json().catch(()=>({ok:false,error:'Unexpected server response.'}));
  if (!response.ok || !result.ok) throw Error(result.error || 'Request failed.');
  return result;
}
function jsonPost(path,data, method = 'POST') {
  return api(path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(data)});
}
function value(form, name) { return String(new FormData(form).get(name) || '').trim(); }
function busy(button, isBusy) {
  button.disabled = isBusy;
  if (isBusy) button.dataset.before = button.textContent;
  button.textContent = isBusy ? 'Sending…' : (button.dataset.before || button.textContent);
}
function openLogin() {
  $('login-panel').hidden = false; $('dashboard-panel').hidden = true; $('logout').hidden = true;
}
async function loadNotifications() {
  const root=$('notification-errors');root.replaceChildren();
  try {
    const result=await api('/api/admin/notifications');
    if(!result.failed.length){add(root,'p','No failed email alerts recorded.','empty');return;}
    for(const n of result.failed){
      const box=add(root,'div',null,'item');
      add(box,'strong',(n.client_name||'Prunus')+' · '+n.event);
      add(box,'p',n.error_message||'Email delivery failed');
      add(box,'span',date(n.created_at),'meta');
    }
  } catch(err) {add(root,'p','Unable to load delivery alerts.','empty');}
}
async function loadSession() {
  try {
    state.session = await api('/api/session');
    if (!state.session.clients.length) { openLogin();showMessage('login-message','Your account has no active business assigned.',true);return; }
    $('login-panel').hidden = true; $('dashboard-panel').hidden = false; $('logout').hidden = false;
    $('admin-panel').hidden = !state.session.admin;
    if(state.session.admin) await loadNotifications();
    const picker = $('client-picker'); picker.replaceChildren();
    for (const client of state.session.clients) {
      const option = element('option', client.name);
      option.value=client.id; picker.append(option);
    }
    const slug=new URL(location.href).searchParams.get('site');
    const requested=state.session.clients.find(c=>c.slug===slug);
    if (!state.clientId || !state.session.clients.some(c=>c.id===state.clientId)) state.clientId=(requested||state.session.clients[0]).id;
    picker.value=state.clientId;
    await loadDashboard();
  } catch { state.session=null;openLogin(); }
}
async function loadDashboard() {
  if (!state.clientId) return;
  try {
    const data=await api('/api/dashboard?client='+encodeURIComponent(state.clientId));
    state.dashboard=data;
    $('business-title').textContent=data.client.name;
    $('business-subtitle').textContent='Your website: '+data.client.domain;
    const back=$('back-to-website');
    // Domain comes from the authorised account record, never from a URL query string.
    const domain=String(data.client.domain||'').toLowerCase();
    const validDomain=/^(?=.{4,200}$)[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain) && !domain.includes('..');
    back.hidden=!validDomain;
    if(validDomain) back.href='https://'+domain+'/';
    renderLeads(data.leads);
    renderRequests(data.requests);
    renderProfile(data);
  } catch (e) { showMessage('change-message',e.message,true); }
}
function ukWhatsApp(phone) {
  let digits=String(phone||'').replace(/\D/g,'');
  if (digits.startsWith('0044')) digits=digits.slice(2);
  else if (/^07\d{9}$/.test(digits)) digits='44'+digits.slice(1);
  return /^447\d{9}$/.test(digits) ? digits : null;
}
function contactAction(parent, title, href, className, newWindow = false) {
  const a=add(parent,'a',title,'contact-action '+className);
  a.href=href;
  if(newWindow) {a.target='_blank';a.rel='noopener noreferrer';}
  return a;
}
function renderLeads(leads) {
  const statuses=['new','contacted','dealt-with'];
  const totals=Object.fromEntries(statuses.map(s=>[s,leads.filter(l=>l.status===s).length]));
  $('lead-count').textContent=String(leads.length);
  $('pipeline-summary').textContent=totals.new+' new · '+totals.contacted+' contacted · '+totals['dealt-with']+' dealt with';
  const filter=$('lead-filter').value;
  const shown=filter==='all'?leads:leads.filter(l=>l.status===filter);
  const root=$('lead-list'); root.replaceChildren();
  if (!shown.length) {
    add(root,'p',leads.length?'No enquiries in this stage.':'No saved enquiries yet. New submissions will appear when the website form is connected.','empty');
    return;
  }
  for (const lead of shown) {
    const box=add(root,'article',null,'item lead-card');
    const top=add(box,'div',null,'row');
    add(top,'strong',lead.full_name);
    add(top,'span',(lead.status||'new').replace(/-/g,' '),'tag');
    add(box,'div',date(lead.created_at)+' · '+(lead.service||'Website enquiry')+(lead.postcode?' · '+lead.postcode:''),'meta');
    if(lead.message) add(box,'p',lead.message);
    if(lead.source_page) add(box,'div','Page: '+lead.source_page,'meta');
    const contacts=add(box,'div',null,'contact-actions');
    const phone=String(lead.phone||'').trim();
    const phoneHref=phone.replace(/[^+\d]/g,'');
    const email=String(lead.email||'').trim();
    const wa=ukWhatsApp(phone);
    if (wa) contactAction(contacts,'WhatsApp','https://wa.me/'+wa,'whatsapp',true);
    if (/^\+?\d{9,15}$/.test(phoneHref)) contactAction(contacts,'Call','tel:'+phoneHref,'call');
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      contactAction(contacts,'Email','mailto:'+encodeURIComponent(email).replace(/%40/g,'@')+'?subject='+encodeURIComponent('Re: Your website enquiry'),'email');
    if (!contacts.children.length) add(contacts,'span','No direct contact details supplied.','meta');
    const workflow=add(box,'div',null,'lead-workflow');
    const label=add(workflow,'label','Progress');
    const select=add(label,'select');
    select.setAttribute('aria-label','Progress for '+lead.full_name);
    for(const status of statuses){
      const option=element('option',status.replace(/-/g,' '));
      option.value=status;
      select.append(option);
    }
    select.value=statuses.includes(lead.status)?lead.status:'new';
    const message=add(workflow,'span','','meta');
    select.addEventListener('change',async()=>{
      const previous=lead.status;
      select.disabled=true;
      message.textContent='Saving…';
      try {
        await jsonPost('/api/leads/'+encodeURIComponent(lead.id)+'/status',{status:select.value},'PATCH');
        lead.status=select.value;
        message.textContent='Saved';
        renderLeads(state.dashboard.leads);
      } catch(err) {
        select.value=previous;
        message.textContent=err.message;
        message.classList.add('error');
        select.disabled=false;
      }
    });
  }
}
function renderRequests(requests) {
  const root=$('request-list'); root.replaceChildren();
  if (!requests.length) { add(root,'p','No website changes or blog drafts submitted yet.','empty');return; }
  for (const item of requests) {
    const box=add(root,'article',null,'item');
    const top=add(box,'div',null,'row');
    add(top,'strong',item.title);
    add(top,'span',item.status.replace(/-/g,' '),'tag');
    add(box,'div',(item.type==='blog'?'Blog draft':'Website change')+' · '+date(item.created_at),'meta');
    if(item.page_url) add(box,'p','Page: '+item.page_url);
    if(item.body) add(box,'p',item.body.length>250?item.body.slice(0,250)+'…':item.body);
    if(item.file_name) {
      const link=add(box,'a','Download '+item.file_name+' (PDF)');
      link.href='/api/files/'+encodeURIComponent(item.id);
      link.rel='nofollow';
      link.download=item.file_name;
    }
    if(item.staff_note) add(box,'p','Prunus update: '+item.staff_note);
    if(state.session.admin) {
      const form=add(box,'form',null,'admin-update');
      const statuses=['open','working','awaiting-approval','complete'];
      const select=add(form,'select');select.setAttribute('aria-label','Request status');
      for(const status of statuses){const opt=element('option',status.replace(/-/g,' '));opt.value=status;select.append(opt);}
      select.value=item.status;
      const input=add(form,'input');input.setAttribute('aria-label','Update to client');input.placeholder='Progress note';input.maxLength=1000;input.value=item.staff_note||'';
      const button=add(form,'button','Update','secondary');button.type='submit';
      form.addEventListener('submit',async e=>{
        e.preventDefault();busy(button,true);
        try { await jsonPost('/api/admin/requests/'+item.id,{status:select.value,staff_note:input.value},'PATCH');await loadDashboard(); }
        catch(err) { alert(err.message); } finally {busy(button,false);}
      });
    }
  }
}
function renderProfile(data) {
  const root=$('profile-details'); root.replaceChildren();
  add(root,'p','Business: '+data.client.name);
  add(root,'p','Website: '+data.client.domain);
  add(root,'p','Contact email: '+data.client.contact_email);
  if (state.session.admin && data.sites.length) {
    const section=add(root,'div',null);
    add(section,'p','Site integration (admin only): '+data.sites[0].domain);
    const button=add(section,'button','Rotate site integration token','secondary');
    button.addEventListener('click',async()=>{
      if(!confirm('Rotate this token? The current website integration will stop storing leads until its secret is updated.'))return;
      button.disabled=true;
      try {
        const r=await jsonPost('/api/admin/sites/'+data.sites[0].id+'/rotate',{});
        displayToken(r.ingest_token);
      } catch(e) { alert(e.message); } finally {button.disabled=false;}
    });
  }
}
function displayToken(token) {
  const el=$('integration-token');el.hidden=false;el.replaceChildren();
  add(el,'strong','Site integration token (shown once):');
  add(el,'div',token);
  add(el,'p','Save this as PORTAL_INGEST_TOKEN in the website Cloudflare Pages secrets. Do not share it or put it in HTML. Reloading hides it.');
}
$('email-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type=submit]');
  state.email=value(form,'email').toLowerCase();
  busy(button,true);
  try {
    const data=await jsonPost('/api/auth/request-code',{email:state.email});
    $('email-form').hidden=true;$('code-form').hidden=false;
    showMessage('login-message',data.message);$('code').focus();
  } catch(err){showMessage('login-message',err.message,true);}
  finally{busy(button,false);}
});
$('code-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type=submit]');
  busy(button,true);
  try { await jsonPost('/api/auth/verify',{email:state.email,code:value(form,'code')});$('code').value='';await loadSession(); }
  catch(err){showMessage('login-message',err.message,true);}
  finally{busy(button,false);}
});
$('change-email').addEventListener('click',()=>{
  $('email-form').hidden=false;$('code-form').hidden=true;showMessage('login-message','');
});
$('logout').addEventListener('click',async()=>{
  try{await jsonPost('/api/auth/logout',{});}catch{}
  state.session=null;state.clientId=null;openLogin();showMessage('login-message','Signed out.');
});
$('client-picker').addEventListener('change',async e=>{state.clientId=e.target.value;await loadDashboard();});
$('lead-filter').addEventListener('change',()=>{if(state.dashboard)renderLeads(state.dashboard.leads);});
$('change-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button');
  busy(btn,true);
  try {
    const result=await jsonPost('/api/requests/change',{client_id:state.clientId,title:value(form,'title'),page_url:value(form,'page_url'),body:value(form,'body')});
    form.reset();showMessage('change-message',result.message);await loadDashboard();
  } catch(err){showMessage('change-message',err.message,true);}
  finally{busy(btn,false);}
});
$('blog-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button');
  const data=new FormData(form);data.set('client_id',state.clientId);
  if(!String(data.get('body')||'').trim() && (!data.get('file')||!data.get('file').size)){showMessage('blog-message','Add your complete blog text or choose a PDF.',true);return;}
  busy(btn,true);
  try {
    const result=await api('/api/requests/blog',{method:'POST',body:data});
    form.reset();showMessage('blog-message',result.message);await loadDashboard();
  } catch(err){showMessage('blog-message',err.message,true);}
  finally{busy(btn,false);}
});
$('client-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button');
  busy(btn,true);
  try{
    const data=Object.fromEntries(new FormData(form).entries());
    const result=await jsonPost('/api/admin/clients',data);
    displayToken(result.ingest_token);form.reset();
    showMessage('admin-message','Client created. Connect the secret on their website and invite the owner to sign in.');
    state.clientId=result.client_id;await loadSession();
  }catch(err){showMessage('admin-message',err.message,true);}finally{busy(btn,false);}
});
$('member-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button');
  busy(btn,true);
  try{await jsonPost('/api/admin/members',{client_id:state.clientId,email:value(form,'email')});form.reset();showMessage('member-message','Team member can now sign in using their email code.');}
  catch(err){showMessage('member-message',err.message,true);}finally{busy(btn,false);}
});
loadSession();
