// Dedicated website-only live Stripe catalogue. These identifiers are public, never credentials.
export const WEBSITE_STRIPE=Object.freeze({
 build:'prod_prunus_website_build',
 hosting:'price_1UcpF802kKo99MeufOyGLBlL',
 seo:'price_1UcpFA02kKo99MeuP279C4L7',
 financed:'price_1UcpFC02kKo99MeuFtyqLlxF',
 agencyHosting:'price_1UcpFD02kKo99MeuKfKeX7z3'
});
export async function websiteStripe(env,path,params={},key=''){
 const form=new URLSearchParams();
 for(const [k,v] of Object.entries(params))if(v!==null&&v!==undefined)form.append(k,String(v));
 const write=!!key;
 const res=await fetch('https://api.stripe.com/v1/'+path+(write||!form.size?'':'?'+form.toString()),{method:write?'POST':'GET',headers:{authorization:'Bearer '+env.STRIPE_WEBSITES_SECRET_KEY,'Stripe-Version':'2025-06-30.basil',...(write?{'content-type':'application/x-www-form-urlencoded','Idempotency-Key':key}:{})},...(write?{body:form}:{})});
 const result=await res.json();if(!res.ok){const param=String(result.error?.param||'').replace(/[^a-zA-Z0-9_\[\].-]/g,'').slice(0,120);const msg=String(result.error?.message||'').replace(/(?:[a-z]{1,6}_live_|whsec_|sk_|rk_)[A-Za-z0-9_]+/g,'[redacted]').replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g,'[email]').slice(0,170);throw Error('Stripe '+res.status+' '+String(result.error?.code||result.error?.type||'request_failed')+(param?' / '+param:'')+(path==='checkout/sessions'&&params['metadata[integration]']==='prunus_website_launch_probe'?' / '+msg:''));}
 return result;
}
export function handoverParams(order,quote,pm,customer){
 if(!['starter','growth'].includes(order.plan)||!/^pm_/.test(pm||'')||!/^cus_/.test(customer||'')||!Number.isSafeInteger(quote.handover)||quote.hosting!==3900||quote.handover!==quote.build-quote.today+quote.hosting||quote.handover<=quote.hosting)throw Error('Invalid verified handover');
 return {customer,default_payment_method:pm,collection_method:'charge_automatically',payment_behavior:'allow_incomplete',
 'items[0][price]':WEBSITE_STRIPE.hosting,'items[0][quantity]':1,
 'add_invoice_items[0][price_data][currency]':'gbp','add_invoice_items[0][price_data][product]':WEBSITE_STRIPE.build,'add_invoice_items[0][price_data][unit_amount]':quote.handover-quote.hosting,
 'add_invoice_items[0][quantity]':1,'metadata[integration]':'prunus_website_sales','metadata[website_sales_order]':order.id,'expand[0]':'latest_invoice'};
}
export function isWebsiteObject(value,order){return !!value&&value.metadata?.integration==='prunus_website_sales'&&value.metadata?.website_sales_order===order.id;}
export function subscriptionInvoiceMatches(invoice,order){
 const sid=invoice.subscription||invoice.parent?.subscription_details?.subscription;return typeof sid==='string'&&sid===order.subscription_id&&invoice.customer===order.customer_id&&invoice.currency==='gbp';
}
