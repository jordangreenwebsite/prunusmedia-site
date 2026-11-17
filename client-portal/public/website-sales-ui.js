'use strict';
(function(){
 const get=id=>document.getElementById(id);
 const add=(parent,tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);parent.append(e);return e;};
 const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n/100);
 const fmt=n=>new Date(n).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'})+' UK';
 const endpoint='/api/admin/website-sales';
 async function request(path='',data){
  const r=await fetch(endpoint+path,data===undefined?{credentials:'same-origin'}:{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Request failed.');return j;
 }
 function status(message){get('sales-state').textContent=message;}
 function item(parent,title,detail){const e=add(parent,'article');e.className='website-sales-item';add(e,'strong',title);add(e,'p',detail);return e;}
 function action(box,label,fn){const b=add(box,'button',label);b.type='button';b.className='secondary';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){status(e.message);}finally{b.disabled=false;}});return b;}
 window.loadWebsiteSales=async function(){
  try{
   const j=await request();status(j.enabled?'Live deposits enabled for Starter and Trade Growth. Other packages: contact to arrange. Onboarding is handled manually.':'Payments disabled pending configuration and verification.');
   get('sales-prospect-count').textContent=j.prospects.length;
   get('sales-paid-count').textContent=j.orders.filter(o=>['deposit_paid','seo_active','hosting_active','handover_pending'].includes(o.status)).length;
   const now=Date.now();get('sales-offer-count').textContent=j.offers.filter(o=>o.active&&o.start_ms<=now&&now<o.end_ms).length;
   const prospects=get('sales-prospects'),offers=get('sales-offers'),orders=get('sales-orders');
   for(const x of [prospects,offers,orders])x.replaceChildren();
   for(const p of j.prospects){
    const box=item(prospects,p.name,p.brand+' · '+(p.active?'Active':'Paused'));
    const url='https://prunusmedia.com/buy-now/?ref='+p.token;
    const link=add(box,'a','Open checkout preview');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    action(box,'Copy link',async()=>{await navigator.clipboard.writeText(url);status('Link copied.');});
    action(box,p.active?'Pause':'Resume',async()=>{await request('/prospect-status',{token:p.token,active:!p.active});await window.loadWebsiteSales();});
   }
   for(const o of j.offers){
    const state=!o.active?'Paused':now<o.start_ms?'Scheduled':now>=o.end_ms?'Expired':'Active';
    const detail=o.plan+' · '+(o.kind==='percent'?o.value+'% off':money(o.value)+(o.kind==='fixed'?' off':' price'))+' · '+state;
    const box=item(offers,o.name,detail);add(box,'p',fmt(o.start_ms)+' to '+fmt(o.end_ms));
    action(box,o.active?'Pause':'Resume',async()=>{await request('/offer-status',{id:o.id,active:!o.active});await window.loadWebsiteSales();});
   }
   for(const o of j.orders){const quote=JSON.parse(o.quote_json);const box=item(orders,o.name,o.plan+' · '+o.status.replaceAll('_',' ')+' · '+money(quote.today)+' initial · '+money(quote.handover)+' handover · '+money(quote.monthly)+'/month');
    if(o.customer_email){const contact=add(box,'a',o.customer_email);contact.href='mailto:'+o.customer_email;}
    if(o.billing_issue)add(box,'p',o.billing_issue);
    if(o.plan==='seo')add(box,'p',String(o.paid_invoices||0)+' verified subscription invoices');
    if(o.status==='deposit_paid')action(box,'Complete handover',async()=>{if(!window.confirm('Charge '+money(quote.handover)+' now and start '+money(quote.monthly)+'/month hosting?'))return;await request('/handover',{id:o.id,confirm:true});await window.loadWebsiteSales();});
    if(o.invoice_url){try{const url=new URL(o.invoice_url);if(url.protocol==='https:'&&url.hostname==='invoice.stripe.com'){const a=add(box,'a','Open Stripe invoice');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';}}catch{}}
   }
   if(!j.prospects.length)add(prospects,'p','No concepts registered yet.');
   if(!j.offers.length)add(offers,'p','No offers created yet.');
   if(!j.orders.length)add(orders,'p','No orders recorded yet.');
  }catch(e){status(e.message);}
 };
 function bind(formId,fn){const form=get(formId);if(!form)return;form.addEventListener('submit',async e=>{
  e.preventDefault();const button=form.querySelector('button[type=submit],button');button.disabled=true;
  try{await fn(Object.fromEntries(new FormData(form)));form.reset();await window.loadWebsiteSales();}
  catch(e){status(e.message);}finally{button.disabled=false;}
 });}
 bind('sales-prospect-form',async d=>{
  const result=await request('/prospects',d),p=get('sales-link');p.replaceChildren();const a=add(p,'a','Open or copy your new purchase link');a.href=result.link;a.target='_blank';a.rel='noopener noreferrer';
 });
 bind('sales-offer-form',async d=>{
  if(d.kind==='percent'&&!Number.isInteger(Number(d.value)))throw Error('Use a whole percentage.');
  await request('/offers',{...d,value:d.kind==='percent'?Number(d.value):Math.round(Number(d.value)*100),start:new Date(d.start).getTime(),end:new Date(d.end).getTime()});
 });
})();
