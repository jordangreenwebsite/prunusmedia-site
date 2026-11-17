import { CONCEPT_PLANS, quoteWebsite } from './website-checkout-pricing.js';
import { AGREEMENT_VERSION,planIds,isRecurringPlan,isBuildPlan,agreementFor,checkoutQuote } from './website-sales-catalogue.js';
import { verifyWebsiteStripeEvent } from './website-checkout-signature.js';
import { WEBSITE_STRIPE, websiteStripe, handoverParams, isWebsiteObject, subscriptionInvoiceMatches, recurringPrice, financedScheduleParams } from './website-sales-billing.js';
const MARKETING='https://prunusmedia.com', APP='https://portal.prunusmedia.com';
const TOKEN=/^[a-f0-9]{64}$/;
const own=(o,k)=>Object.hasOwn(o,k);
const q=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const json=(v,status=200,cors=false)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(cors?{'access-control-allow-origin':MARKETING,'vary':'Origin'}:{})}});
const fail=(message,status=400,cors=false)=>json({ok:false,error:message},status,cors);
const text=(v,max=160)=>String(v??'').trim().slice(0,max);
const id=()=>crypto.randomUUID();
const newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const credentials=env=>/^rk_live_/.test(env.STRIPE_WEBSITES_SECRET_KEY||'')&&/^whsec_/.test(env.STRIPE_WEBSITES_WEBHOOK_SECRET||'');
async function configured(env){if(!credentials(env))return false;const a=await q(env,"SELECT value FROM website_sales_settings WHERE key='enabled'").first();return a?.value==='true';}
async function verifyCatalogue(env){
 if(!credentials(env))throw Error('Website Stripe secrets are missing on the portal Worker.');
 for(const [price,amount,product] of [[WEBSITE_STRIPE.hosting,3900,'prod_prunus_website_hosting'],[WEBSITE_STRIPE.seo,19500,'prod_prunus_website_seo'],[WEBSITE_STRIPE.financed,6500,'prod_prunus_website_financed'],[WEBSITE_STRIPE.agencyHosting,9900,'prod_prunus_agency_hosting'],[WEBSITE_STRIPE.agencySeo,19500,'prod_prunus_agency_seo']]){
  const p=await websiteStripe(env,'prices/'+price);if(!p.livemode||!p.active||p.currency!=='gbp'||p.unit_amount!==amount||p.product!==product||p.recurring?.interval!=='month'||p.recurring?.interval_count!==1)throw Error('A website billing price does not match the advertised amount.');
 }
 const product=await websiteStripe(env,'products/'+WEBSITE_STRIPE.build);if(!product.active||!product.livemode||product.metadata?.integration!=='prunus_website_sales')throw Error('Website build product mismatch.');
 return true;
}
// A one-time, short-lived deployment authorisation created by the protected
// portal-production GitHub workflow. No permanent backdoor, no customer charges.
const getSetting=async(env,key)=>(await q(env,'SELECT value FROM website_sales_settings WHERE key=?',key).first())?.value;
const setSetting=(env,key,value)=>q(env,'INSERT INTO website_sales_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,String(value)).run();
async function launchCheck(request,env){
 const token=(request.headers.get('authorization')||'').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 if(!token)return fail('Not authorised',401);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
 const expected=await getSetting(env,'launch_nonce_hash'),until=Number(await getSetting(env,'launch_nonce_expires'));
 if(!expected||digest!==expected||!Number.isFinite(until)||until<Date.now())return fail('Not authorised',401);
 let d;try{d=await body(request);}catch{return fail('Invalid activation request');}
 try{
  if(d.action==='probe'){
   await verifyCatalogue(env);
   const key='website-launch-'+digest.slice(0,32);
   const probes=[];
   for(const plan of planIds()){
    const q=checkoutQuote(plan),rec=recurringPrice(plan);
    const form={mode:rec?'subscription':'payment','line_items[0][quantity]':1,success_url:MARKETING+'/buy-now/success/',cancel_url:MARKETING+'/buy-now/','automatic_tax[enabled]':false,'metadata[integration]':'prunus_website_launch_probe','metadata[launch_id]':digest,'metadata[plan]':plan};
    if(rec)form['line_items[0][price]']=rec;
    else Object.assign(form,{customer_creation:'always','payment_intent_data[setup_future_usage]':'off_session','line_items[0][price_data][currency]':'gbp','line_items[0][price_data][product]':WEBSITE_STRIPE.build,'line_items[0][price_data][unit_amount]':q.today});
    const session=await stripe(env,'checkout/sessions',form,key+'-'+plan);
    if(!/^cs_live_/.test(session.id||'')||session.livemode!==true||session.amount_total!==q.today||session.payment_status!=='unpaid')throw Error('Unpaid checkout probe mismatch: '+plan);
    probes.push(session.id);await setSetting(env,'launch_expected_'+plan,session.id);
    const expired=await stripe(env,'checkout/sessions/'+session.id+'/expire',{},key+'-expire-'+plan);
    if(expired.status!=='expired')throw Error('Could not expire unpaid checkout: '+plan);
   }
   // A future schedule with a new, uncharged diagnostic customer verifies actual
   // schedule create/update/cancel permission; no payment method or email is supplied.
   const customer=await stripe(env,'customers',{'metadata[integration]':'prunus_website_launch_probe','metadata[launch_id]':digest},key+'-customer');
   const future=Math.floor(Date.now()/1000)+30*86400;
   let schedule;
   try{
    schedule=await stripe(env,'subscription_schedules',{customer:customer.id,start_date:future,end_behavior:'release','phases[0][items][0][price]':WEBSITE_STRIPE.financed,'phases[0][iterations]':12,'phases[1][items][0][price]':WEBSITE_STRIPE.hosting,'phases[1][iterations]':1,'metadata[integration]':'prunus_website_launch_probe'},key+'-schedule');
    if(schedule.status!=='not_started')throw Error('Diagnostic schedule unexpectedly started');
    const updated=await stripe(env,'subscription_schedules/'+schedule.id,financedScheduleParams(future),key+'-schedule-update');
    if(updated.phases?.length!==2)throw Error('Schedule update did not preserve both billing phases');
   }finally{
    if(schedule?.id){const cancelled=await stripe(env,'subscription_schedules/'+schedule.id+'/cancel',{},key+'-schedule-cancel');if(cancelled.status!=='canceled')throw Error('Diagnostic schedule not cancelled');}
   }
   await setSetting(env,'launch_all_verified_key',digest);
   return json({ok:true,probe:'8_expired_unpaid_schedule_cancelled'});
  }
  if(d.action==='activate'){
   if(await getSetting(env,'launch_all_verified_key')!==digest)return fail('Awaiting live schedule validation',409);
   for(const plan of planIds()){const probe=await getSetting(env,'launch_expected_'+plan);if(!probe||await getSetting(env,'launch_seen_'+plan)!==probe)return fail('Waiting for signed expiration webhook: '+plan,409);}
   await verifyCatalogue(env);
   await setSetting(env,'enabled','true');await setSetting(env,'all_packages','true');
   await q(env,"DELETE FROM website_sales_settings WHERE key IN ('launch_nonce_hash','launch_nonce_expires')").run();
   return json({ok:true,enabled:true,plans:planIds()});
  }
  return fail('Invalid activation action');
 }catch(e){return fail(String(e.message||'Activation failed').slice(0,250),503);}
}
const PAYMENT_AGREEMENT_VERSION=AGREEMENT_VERSION;
async function enabledPlans(env){if(!(await configured(env)))return [];return await getSetting(env,'all_packages')==='true'?planIds():['starter','growth'];}
const email=v=>/^\S+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
async function body(request){
 if(!(request.headers.get('content-type')||'').startsWith('application/json'))throw Error('Expected JSON');
 const raw=await request.text(); if(raw.length>15000)throw Error('Request too large');
 const x=JSON.parse(raw);if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Invalid request');return x;
}
function previewUrl(value){
 try{const u=new URL(value);if(u.origin!=='https://uktradewebsites.co.uk'&&u.origin!==MARKETING)return null;if(!/^\/concept-websites\/[a-z0-9-]+\/$/.test(u.pathname)||u.search||u.hash||u.username||u.password)return null;return u.href;}catch{return null;}
}
async function prospect(env,token,slug){if(TOKEN.test(token||''))return await q(env,'SELECT * FROM website_sales_prospects WHERE token=? AND active=1',token).first();if(/^[a-z0-9][a-z0-9-]{0,100}$/.test(slug||''))return await q(env,'SELECT * FROM website_sales_prospects WHERE preview_url=? AND active=1','https://uktradewebsites.co.uk/concept-websites/'+slug+'/').first();return null;}
async function offers(env,p,now=Date.now()){
 const records=(await q(env,"SELECT * FROM website_sales_offers WHERE active=1 AND start_ms<=? AND end_ms>? ORDER BY created_ms DESC, id DESC",now,now).all()).results;
 return planIds().map(plan=>{
   const base=checkoutQuote(plan),row=records.find(o=>o.plan===plan&&(o.brand==='all'||o.brand===base.brand));
   const offer=row?{id:row.id,active:true,plans:[plan],kind:row.kind,value:row.value,start:row.start_ms,end:row.end_ms,scope:plan==='seo'?'first-seo-month':'build'}:null;
   return {...checkoutQuote(plan,offer,now),offer_name:row?.name||null};
 });
}
const stripe=websiteStripe;
function metadata(params,prefix,orderId){
 params[prefix+'[website_sales_order]']=orderId;params[prefix+'[integration]']='prunus_website_sales';
}
async function checkout(request,env){
 if(!(await configured(env)))return fail('Online payment is not available yet. Please call or WhatsApp us.',503,true);
 let d;try{d=await body(request);}catch{return fail('Invalid checkout request.',400,true);}
 const p=await prospect(env,d.token,d.concept),addr=text(d.email,254).toLowerCase();
 if(!p||!(await enabledPlans(env)).includes(d.plan)||!email(addr)||d.agree!==true||d.agreement_version!==PAYMENT_AGREEMENT_VERSION)return fail('Choose a package, supply your email and accept the payment terms.',400,true);
 const quote=(await offers(env,p)).find(x=>x.plan===d.plan);
 // Require the exact server-calculated quote shown at confirmation.
 if(d.today!==quote.today||d.handover!==quote.handover||d.monthly!==quote.monthly||String(d.offer_id||'')!==String(quote.offer?.id||''))return fail('Pricing changed. Refresh the quote and review it again.',409,true);
 const existing=await q(env,"SELECT * FROM website_sales_orders WHERE prospect_token=? AND status NOT IN ('expired','cancelled')",p.token).first();
 if(existing){
  // Never expose a prior customer's checkout session or create a second payable order.
  if(existing.customer_email===addr&&existing.status==='checkout_open'&&existing.session_id){
   const session=await websiteStripe(env,'checkout/sessions/'+existing.session_id);
   if(session.status==='expired')await q(env,"UPDATE website_sales_orders SET status='expired' WHERE id=? AND status='checkout_open'",existing.id).run();
   else return fail('An open checkout already exists. Please contact us to resume securely.',409,true);
  }else return fail('An order already exists for this concept. Please contact our team.',409,true);
 }
 const order=id(),now=Date.now();
 if(quote.offer&&quote.offer.end-now<1860000)return fail('This offer is ending shortly. Contact us to secure it, or refresh after expiry.',409,true);
 try{await q(env,'INSERT INTO website_sales_orders(id,prospect_token,plan,quote_json,status,customer_email,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?)',order,p.token,d.plan,JSON.stringify({...quote,agreement_version:PAYMENT_AGREEMENT_VERSION,agreement_accepted_ms:now,agreement_text:agreementFor(quote)}),'creating',addr,now,now).run();}
 catch{return fail('A checkout already exists. Please contact us.',409,true);}
 try{
   const common={mode:isRecurringPlan(d.plan)?'subscription':'payment',customer_email:addr,client_reference_id:order,success_url:MARKETING+'/buy-now/success/',cancel_url:MARKETING+'/buy-now/?ref='+p.token,expires_at:Math.floor(now/1000)+1860,'line_items[0][quantity]':1,'automatic_tax[enabled]':false};
   metadata(common,'metadata',order);
   common['metadata[agreement_version]']=PAYMENT_AGREEMENT_VERSION;
   common['custom_text[submit][message]']=isRecurringPlan(d.plan)?'Recurring monthly website services under the agreed payment terms.':'Website deposit only. The agreed handover balance and recurring hosting are payable separately.';
   if(isRecurringPlan(d.plan)){
     common['line_items[0][price]']=recurringPrice(d.plan);
     metadata(common,'subscription_data[metadata]',order);
     if(quote.today<quote.monthly){
       const coupon=await stripe(env,'coupons',{amount_off:quote.monthly-quote.today,currency:'gbp',duration:'once',name:'Website SEO introductory offer'},'website-coupon-'+order);
       common['discounts[0][coupon]']=coupon.id;
     }
   }else{
     common.customer_creation='always';common['payment_intent_data[setup_future_usage]']='off_session';
     metadata(common,'payment_intent_data[metadata]',order);
     common['line_items[0][price_data][currency]']='gbp';
     common['line_items[0][price_data][product]']=WEBSITE_STRIPE.build;
     common['line_items[0][price_data][unit_amount]']=quote.today;
   }
   const session=await stripe(env,'checkout/sessions',common,'website-checkout-'+order);
   if(!/^cs_live_/.test(session.id||'')||typeof session.url!=='string'||new URL(session.url).origin!=='https://checkout.stripe.com')throw Error('Invalid checkout response');
   await q(env,"UPDATE website_sales_orders SET session_id=?,checkout_url=?,status='checkout_open',updated_ms=? WHERE id=? AND status='creating'",session.id,session.url,Date.now(),order).run();
   return json({ok:true,url:session.url},200,true);
 }catch{
   // Network ambiguity must not create a second payable session. Owner reconciles.
   await q(env,"UPDATE website_sales_orders SET status='review_required',updated_ms=? WHERE id=? AND status='creating'",Date.now(),order).run();
   return fail('We could not open payment safely. Please contact us so we can check your order.',502,true);
 }
}
async function webhook(request,env){
 if(!env.STRIPE_WEBSITES_WEBHOOK_SECRET)return fail('Webhook not configured',503);
 let event;try{event=await verifyWebsiteStripeEvent(await request.text(),request.headers.get('stripe-signature'),env.STRIPE_WEBSITES_WEBHOOK_SECRET);}catch{return fail('Invalid signature',400);}
 const data=event.data?.object;if(!data)return fail('Invalid event',400);
 if(event.type==='checkout.session.expired'&&data.metadata?.integration==='prunus_website_launch_probe'){
  const plan=data.metadata?.plan,digest=await getSetting(env,'launch_nonce_hash');
  if(planIds().includes(plan)&&await getSetting(env,'launch_expected_'+plan)===data.id&&digest&&data.metadata?.launch_id===digest&&data.payment_status==='unpaid')await setSetting(env,'launch_seen_'+plan,data.id);
  return json({ok:true,probe:true});
 }
 await q(env,"INSERT INTO website_sales_settings(key,value) VALUES('last_verified_webhook',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(Date.now())).run();
 // Account-wide events include Certificates. Only process exact stored object IDs.
 let order=null;
 if(event.type.startsWith('checkout.session.'))order=await q(env,'SELECT * FROM website_sales_orders WHERE session_id=?',String(data.id||'')).first();
 else if(event.type.startsWith('customer.subscription.'))order=await q(env,'SELECT * FROM website_sales_orders WHERE subscription_id=?',String(data.id||'')).first();
 else if(event.type.startsWith('invoice.')){
   const sub=data.subscription||data.parent?.subscription_details?.subscription;
   if(typeof sub==='string')order=await q(env,'SELECT * FROM website_sales_orders WHERE subscription_id=?',sub).first();
 }
 if(!order&&event.type.startsWith('invoice.')){
   const m=data.parent?.subscription_details?.metadata||data.subscription_details?.metadata;
   if(m?.integration==='prunus_website_sales'&&m.website_sales_order){const pending=await q(env,'SELECT id FROM website_sales_orders WHERE id=?',m.website_sales_order).first();if(pending)return fail('Subscription not reconciled yet',503);}
 }
 if(!order){
   // A matching website session may have arrived before D1 was updated.
   if(data.metadata?.integration==='prunus_website_sales'&&data.metadata?.website_sales_order){
     const pending=await q(env,'SELECT id FROM website_sales_orders WHERE id=?',String(data.metadata.website_sales_order)).first();
     if(pending&&(event.type.startsWith('checkout.session.')||event.type.startsWith('customer.subscription.')))return fail('Order not reconciled yet',503);
   }
   return json({ok:true,ignored:true});
 }
 const existing=await q(env,'SELECT id FROM website_sales_events WHERE id=?',event.id).first();if(existing){if(order.plan==='uk-financed'&&order.subscription_id&&!order.schedule_id)await ensureFinancedSchedule(env,order);return json({ok:true,duplicate:true});}
 const quote=JSON.parse(order.quote_json), statements=[];
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&data.payment_status==='paid'){
   if(data.currency!=='gbp'||data.amount_total!==quote.today||data.client_reference_id!==order.id||data.metadata?.integration!=='prunus_website_sales'||data.metadata?.website_sales_order!==order.id)return fail('Order amount or identity mismatch',409);
   if(isRecurringPlan(order.plan)&&!data.subscription)return fail('Subscription missing',409);
   statements.push(q(env,"UPDATE website_sales_orders SET status=?,customer_id=?,subscription_id=?,first_paid_ms=COALESCE(first_paid_ms,?),updated_ms=? WHERE id=? AND status IN ('creating','checkout_open','review_required')",order.plan==='uk-financed'?'financed_active':isRecurringPlan(order.plan)?'seo_active':'deposit_paid',typeof data.customer==='string'?data.customer:null,typeof data.subscription==='string'?data.subscription:null,Date.now(),Date.now(),order.id));
 }else if(event.type==='checkout.session.expired'){
   statements.push(q(env,"UPDATE website_sales_orders SET status='expired',updated_ms=? WHERE id=? AND status='checkout_open'",Date.now(),order.id));
 }else if(event.type==='invoice.paid'&&subscriptionInvoiceMatches(data,order)&&data.status==='paid'&&data.amount_paid>0){
   statements.push(q(env,"INSERT INTO website_sales_paid_invoices(invoice_id,order_id,amount,paid_ms,billing_reason) VALUES(?,?,?,?,?) ON CONFLICT(invoice_id) DO NOTHING",data.id,order.id,data.amount_paid,Date.now(),String(data.billing_reason||'')));
   if(order.handover_invoice_id===data.id&&data.amount_paid===quote.handover)statements.push(q(env,"UPDATE website_sales_orders SET status='hosting_active',billing_issue=NULL,updated_ms=? WHERE id=? AND status IN ('handover_pending','handover_review')",Date.now(),order.id));
   else statements.push(q(env,"UPDATE website_sales_orders SET billing_issue=NULL,updated_ms=? WHERE id=? AND status NOT IN ('cancelled','expired')",Date.now(),order.id));
 }else if(event.type==='invoice.payment_failed'&&subscriptionInvoiceMatches(data,order)){
   statements.push(q(env,"UPDATE website_sales_orders SET billing_issue='Payment failed; review Stripe invoice',updated_ms=? WHERE id=?",Date.now(),order.id));
 }else if(event.type==='customer.subscription.deleted'){
   statements.push(q(env,"UPDATE website_sales_orders SET billing_issue='Subscription ended; review contractual commitment',updated_ms=? WHERE id=?",Date.now(),order.id));
 }
 statements.push(q(env,'INSERT INTO website_sales_events(id,order_id,event_type,created_ms) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING',event.id,order.id,event.type,Date.now()));
 await env.DB.batch(statements);
 if(order.plan==='uk-financed'&&['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&data.payment_status==='paid'){
  const current=await q(env,'SELECT * FROM website_sales_orders WHERE id=?',order.id).first();await ensureFinancedSchedule(env,current);
 }
 return json({ok:true});
}
export async function websiteSalesPublic(request,env,url){
 const path=url.pathname;
 if(path==='/api/stripe/websites/webhook'&&request.method==='POST')return webhook(request,env);
 if(path==='/api/website-sales/launch-check'&&request.method==='POST')return launchCheck(request,env);
 if(!path.startsWith('/api/website-sales/'))return null;
 if(request.headers.get('origin')!==MARKETING)return fail('Origin not permitted',403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':MARKETING,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Content-Type','vary':'Origin'}});
 if(path==='/api/website-sales/quote'&&request.method==='GET'){
   const p=await prospect(env,url.searchParams.get('ref'),url.searchParams.get('concept'));if(!p)return fail('This purchase link is not available. Speak to our team.',404,true);
   const plans=await enabledPlans(env),enabled=plans.length>0;
   return json({ok:true,enabled,enabled_plans:plans,prospect:{name:p.name,brand:p.brand,preview_url:p.preview_url},plans:await offers(env,p),server_time:Date.now()},200,true);
 }
 if(path==='/api/website-sales/checkout'&&request.method==='POST')return checkout(request,env);
 return fail('Not found',404,true);
}
async function ensureFinancedSchedule(env,order){
 if(!order||order.plan!=='uk-financed'||!order.subscription_id||order.schedule_id)return;
 try{
  const sub=await stripe(env,'subscriptions/'+order.subscription_id);
  if(!isWebsiteObject(sub,order)||sub.customer!==order.customer_id||sub.items?.data?.length!==1||sub.items.data[0].price.id!==WEBSITE_STRIPE.financed)throw Error('Financed subscription identity mismatch');
  const schedule=sub.schedule?await stripe(env,'subscription_schedules/'+(typeof sub.schedule==='string'?sub.schedule:sub.schedule.id)):await stripe(env,'subscription_schedules',{from_subscription:sub.id},'website-financed-schedule-'+order.id);
  if(schedule.subscription!==sub.id||!schedule.current_phase?.start_date)throw Error('Financed schedule mismatch');
  const params=financedScheduleParams(schedule.current_phase.start_date);
  if(sub.default_payment_method)params['default_settings[default_payment_method]']=typeof sub.default_payment_method==='string'?sub.default_payment_method:sub.default_payment_method.id;
  for(let i=0;i<2;i++){params['phases['+i+'][metadata][integration]']='prunus_website_sales';params['phases['+i+'][metadata][website_sales_order]']=order.id;}
  const updated=await stripe(env,'subscription_schedules/'+schedule.id,params,'website-financed-phases-'+order.id);
  if(updated.phases?.length!==2||updated.phases[1].items?.[0]?.price!==WEBSITE_STRIPE.hosting)throw Error('Financed phase verification failed');
  await q(env,"UPDATE website_sales_orders SET schedule_id=?,billing_issue=NULL,updated_ms=? WHERE id=?",updated.id,Date.now(),order.id).run();
 }catch(e){await q(env,"UPDATE website_sales_orders SET billing_issue='Financed price transition requires attention',updated_ms=? WHERE id=?",Date.now(),order.id).run();throw e;}
}
export async function repairWebsiteSales(env){
 if(!credentials(env))return;
 const rows=(await q(env,"SELECT * FROM website_sales_orders WHERE plan='uk-financed' AND subscription_id IS NOT NULL AND schedule_id IS NULL AND status='financed_active' LIMIT 20").all()).results;
 for(const row of rows){try{await ensureFinancedSchedule(env,row);}catch{console.error('Website financed billing schedule needs owner review');}}
}
async function downgradeSeo(env,id){
 const order=await q(env,'SELECT * FROM website_sales_orders WHERE id=?',id).first();
 if(!order||!['seo','pm-seo'].includes(order.plan)||!order.subscription_id)throw Error('Verified SEO subscription required');
 const min=order.plan==='seo'?6:3,paid=await q(env,"SELECT COUNT(*) AS n FROM website_sales_paid_invoices WHERE order_id=? AND billing_reason IN ('subscription_create','subscription_cycle')",order.id).first();
 if(Number(paid.n)<min)throw Error('Minimum paid months not reached');
 const sub=await stripe(env,'subscriptions/'+order.subscription_id);
 if(!isWebsiteObject(sub,order)||sub.customer!==order.customer_id||sub.items?.data?.length!==1||sub.items.data[0].price.id!==recurringPrice(order.plan)||sub.status!=='active'||sub.schedule)throw Error('SEO subscription requires manual review before changing');
 const schedule=await stripe(env,'subscription_schedules',{from_subscription:sub.id},'website-downgrade-schedule-'+order.id);
 const phase=schedule.current_phase;if(!phase?.start_date||!phase?.end_date)throw Error('Subscription period missing');
 const target=order.plan==='seo'?WEBSITE_STRIPE.hosting:WEBSITE_STRIPE.agencyHosting;
 const params={end_behavior:'release',proration_behavior:'none','phases[0][start_date]':phase.start_date,'phases[0][end_date]':phase.end_date,'phases[0][items][0][price]':recurringPrice(order.plan),'phases[0][items][0][quantity]':1,'phases[0][proration_behavior]':'none','phases[1][items][0][price]':target,'phases[1][items][0][quantity]':1,'phases[1][iterations]':1,'phases[1][proration_behavior]':'none'};
 for(let i=0;i<2;i++){params['phases['+i+'][metadata][integration]']='prunus_website_sales';params['phases['+i+'][metadata][website_sales_order]']=order.id;}
 const next=await stripe(env,'subscription_schedules/'+schedule.id,params,'website-downgrade-phases-'+order.id);
 await q(env,"UPDATE website_sales_orders SET schedule_id=?,billing_issue='SEO-to-hosting change scheduled at next billing date',updated_ms=? WHERE id=?",next.id,Date.now(),order.id).run();
 return {ok:true};
}
async function handover(env,id){
 const order=await q(env,'SELECT * FROM website_sales_orders WHERE id=?',id).first();
 if(!order||!isBuildPlan(order.plan)||!['deposit_paid','handover_pending','handover_review'].includes(order.status)||!order.customer_id||!order.session_id)throw Error('A verified deposit is required.');
 if(order.subscription_id)return {ok:true,status:order.status,invoice_url:order.invoice_url};
 const quote=JSON.parse(order.quote_json);
 // Reserve before an external charge; the same key is used on retry. Never retry an ambiguous operation after Stripe's retention window.
 if(order.status==='handover_review'||(order.status==='handover_pending'&&Date.now()-order.updated_ms>20*3600000))throw Error('Review the existing handover in Stripe before retrying.');
 const session=await stripe(env,'checkout/sessions/'+order.session_id,{'expand[0]':'payment_intent'});
 const pi=session.payment_intent;
 if(session.payment_status!=='paid'||session.customer!==order.customer_id||session.amount_total!==quote.today||!isWebsiteObject(session,order)||!isWebsiteObject(pi,order)||pi.status!=='succeeded'||pi.customer!==order.customer_id)throw Error('Stripe deposit does not match this order.');
 const lock=await q(env,"UPDATE website_sales_orders SET status='handover_pending',updated_ms=? WHERE id=? AND status='deposit_paid'",Date.now(),order.id).run();
 if(!lock.meta?.changes&&order.status==='deposit_paid')throw Error('Handover already in progress.');
 try{
  const sub=await stripe(env,'subscriptions',handoverParams(order,quote,pi.payment_method,order.customer_id),'website-handover-'+order.id);
  if(!isWebsiteObject(sub,order)||sub.customer!==order.customer_id)throw Error('Unmatched subscription');
  const invoice=sub.latest_invoice;
  if(!invoice||typeof invoice!=='object'||invoice.customer!==order.customer_id||invoice.currency!=='gbp'||invoice.amount_due!==quote.handover)throw Error('Handover invoice requires manual reconciliation');
  const paid=invoice.status==='paid'&&invoice.amount_paid===quote.handover;
  await q(env,"UPDATE website_sales_orders SET subscription_id=?,handover_invoice_id=?,invoice_url=?,status=?,billing_issue=?,updated_ms=? WHERE id=?",sub.id,invoice.id,invoice.hosted_invoice_url||null,paid?'hosting_active':'handover_pending',paid?null:'Awaiting payment or card authentication',Date.now(),order.id).run();
  return {ok:true,status:paid?'hosting_active':'handover_pending',invoice_url:invoice.hosted_invoice_url||null};
 }catch(e){await q(env,"UPDATE website_sales_orders SET status='handover_review',billing_issue='Review Stripe before retrying handover',updated_ms=? WHERE id=? AND subscription_id IS NULL",Date.now(),order.id).run();throw e;}
}
export async function websiteSalesAdmin(request,env,user,url){
 const path=url.pathname;if(!path.startsWith('/api/admin/website-sales'))return null;
 if(!user.admin)return fail('Forbidden',403);
 if(path==='/api/admin/website-sales'&&request.method==='GET'){
   const [prospects,offers,orders]=await Promise.all([
    q(env,'SELECT * FROM website_sales_prospects ORDER BY created_ms DESC LIMIT 250').all(),
    q(env,'SELECT * FROM website_sales_offers ORDER BY created_ms DESC LIMIT 100').all(),
    q(env,"SELECT o.id,o.plan,o.status,o.quote_json,o.created_ms,o.updated_ms,o.customer_email,o.invoice_url,o.billing_issue,o.schedule_id,(SELECT COUNT(*) FROM website_sales_paid_invoices i WHERE i.order_id=o.id AND i.billing_reason IN ('subscription_create','subscription_cycle')) AS paid_invoices,p.name,p.brand FROM website_sales_orders o JOIN website_sales_prospects p ON p.token=o.prospect_token ORDER BY o.created_ms DESC LIMIT 250").all()]);
   return json({ok:true,enabled:await configured(env),enabled_plans:await enabledPlans(env),prospects:prospects.results,offers:offers.results,orders:orders.results});
 }
 if(request.method!=='POST')return fail('Not found',404);
 let d;try{d=await body(request);}catch{return fail('Invalid data');}
 if(path==='/api/admin/website-sales/activate'){
   if(d.enabled===false){await q(env,"UPDATE website_sales_settings SET value='false' WHERE key='enabled'").run();return json({ok:true});}
   // Activation is owner-only, and requires signed live delivery to this actual Worker.
   if(d.enabled!==true||d.confirm_terms!==true)return fail('Confirm the approved website contract and payment terms.');
   try{await verifyCatalogue(env);}catch(e){return fail(e.message,503);}
   const seen=await q(env,"SELECT value FROM website_sales_settings WHERE key='last_verified_webhook'").first();
   if(!seen||Date.now()-Number(seen.value)>86400000)return fail('A signed live Stripe webhook must reach this Worker within the last 24 hours.',409);
   if(await getSetting(env,'all_packages')!=='true'&&!(await getSetting(env,'launch_probe_verified')))return fail('A verified live checkout probe is required.',409);
   await setSetting(env,'enabled','true');return json({ok:true,plans:['starter','growth']});
 }
 if(path==='/api/admin/website-sales/downgrade-seo'){if(d.confirm!==true)return fail('Confirm customer requested downgrade');try{return json(await downgradeSeo(env,String(d.id||'')));}catch(e){return fail(e.message,409);}}
 if(path==='/api/admin/website-sales/handover'){
   if(!credentials(env)||d.confirm!==true)return fail('Confirm the handover charge and hosting start.');
   try{return json(await handover(env,String(d.id||'')));}catch(e){return fail(e.message,409);}
 }
 if(path==='/api/admin/website-sales/prospects'){
   const name=text(d.name),brand=text(d.brand),preview=previewUrl(d.preview_url);
   if(name.length<2||!['uk-trades','prunus'].includes(brand)||!preview)return fail('Enter a business name, brand and valid concept URL.');
   const existing=await q(env,'SELECT token,brand FROM website_sales_prospects WHERE preview_url=?',preview).first();
   if(existing){if(existing.brand!==brand)return fail('Concept already registered under a different brand.',409);return json({ok:true,link:MARKETING+'/buy-now/?ref='+existing.token});}
   const token=newToken();await q(env,'INSERT INTO website_sales_prospects(token,name,brand,preview_url,created_ms) VALUES(?,?,?,?,?)',token,name,brand,preview,Date.now()).run();
   return json({ok:true,link:MARKETING+'/buy-now/?ref='+token},201);
 }
 if(path==='/api/admin/website-sales/offers'){
   const name=text(d.name),brand=text(d.brand),plan=text(d.plan),kind=text(d.kind),value=Number(d.value),start=Number(d.start),end=Number(d.end);
   if(!name||!['all','uk-trades','prunus'].includes(brand)||!own(CONCEPT_PLANS,plan)||!['fixed','percent','price'].includes(kind)||!Number.isSafeInteger(value)||value<=0||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=Math.max(start,Date.now()))return fail('Invalid offer or dates.');
   try{quoteWebsite(plan,{id:'validate',active:true,plans:[plan],kind,value,start,end,scope:plan==='seo'?'first-seo-month':'build'},start);}catch{return fail('Discount must leave a positive price no higher than standard pricing.');}
   await q(env,'INSERT INTO website_sales_offers(id,name,brand,plan,kind,value,start_ms,end_ms,created_ms) VALUES(?,?,?,?,?,?,?,?,?)',id(),name,brand,plan,kind,value,start,end,Date.now()).run();
   return json({ok:true},201);
 }
 if(path==='/api/admin/website-sales/offer-status'){
   if(typeof d.active!=='boolean'||typeof d.id!=='string')return fail('Invalid offer status');
   await q(env,'UPDATE website_sales_offers SET active=? WHERE id=?',Number(d.active),d.id).run();return json({ok:true});
 }
 if(path==='/api/admin/website-sales/prospect-status'){
   if(typeof d.active!=='boolean'||!TOKEN.test(d.token||''))return fail('Invalid prospect status');
   await q(env,'UPDATE website_sales_prospects SET active=? WHERE token=?',Number(d.active),d.token).run();return json({ok:true});
 }
 return fail('Not found',404);
}
