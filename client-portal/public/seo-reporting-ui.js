'use strict';
let reportingSeq=0;
async function loadReportingConnections(){
 if(!state.session?.admin||!state.clientId||portalView()!=='settings')return;
 const id=state.clientId,seq=++reportingSeq,root=$('seo-reporting-connection-root'),path='/api/admin/seo-reporting';
 const endpoint=(s='')=>path+s+'?client='+encodeURIComponent(id);
 const active=()=>state.session?.admin&&state.clientId===id&&portalView()==='settings'&&seq===reportingSeq;
 root.replaceChildren();add(root,'p','Loading SEO integrations…','subtle');
 try{
  const d=await api(endpoint());if(!active())return;root.replaceChildren();
  const panel=seoPanel(root,'SEO reporting connections','Connect once per business. Credentials remain in Cloudflare.');
  add(panel,'p','Google service account: '+(d.service_account_email||'Not configured'),'subtle');
  add(panel,'p','Search Console property: '+(d.gsc_property||'Set the property in existing business settings below'),'subtle');
  add(panel,'p','DataForSEO: '+(d.dataforseo_configured?(d.dataforseo_enabled?'Credentials set; paid requests enabled':'Credentials set; paid requests disabled'):'Not configured'),'subtle');
  const form=add(panel,'form',null,'form-stack');
  seoField(form,'GA4 numeric property ID (not G- measurement ID)','ga_property',{value:d.ga_property,max:15});
  seoField(form,'Report branding','brand',{value:d.brand,options:[['auto','Use business brand'],['prunus','Prunus Media'],['uk-trades','UK Trade Websites'],['dual','Dual branded']]});
  seoField(form,'I confirm the Analytics property belongs to '+d.domain,'confirm_property',{type:'checkbox'});
  const msg=add(panel,'p','','message');msg.setAttribute('role','status');
  const save=add(form,'button','Save reporting settings','primary');save.type='submit';
  form.onsubmit=async e=>{e.preventDefault();if(!active())return;save.disabled=true;try{await jsonPost(endpoint(),{...Object.fromEntries(new FormData(form)),confirm_property:form.elements.confirm_property.checked});msg.textContent='Saved.';msg.classList.remove('error');}catch(e){msg.textContent=e.message;msg.classList.add('error');}finally{save.disabled=false;}};
  for(const [name,route] of [['Test Google connections','/test-google'],['Test DataForSEO (free authentication check)','/test-dataforseo']]){
   const b=add(panel,'button',name,'secondary');b.type='button';b.addEventListener('click',async()=>{if(!active())return;b.disabled=true;try{const r=await jsonPost(endpoint(route),{});msg.textContent=route==='/test-google'?'Search Console: '+r.search_console+'; Analytics: '+r.analytics+(r.analytics==='ok'&&!r.analytics_has_rows?' (no matching hostname rows yet)':''):'DataForSEO connected. Balance: '+(r.balance===null?'Not reported':'$'+r.balance.toFixed(2));msg.classList.remove('error');}catch(e){msg.textContent=e.message;msg.classList.add('error');}finally{b.disabled=false;}});
  }
 }catch(e){if(active()){root.replaceChildren();add(root,'p',e.message,'message error');}}
}
