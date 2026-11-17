import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { quoteWebsite } from '../src/website-checkout-pricing.js';
import { verifyWebsiteStripeEvent } from '../src/website-checkout-signature.js';
test('agreed payment amounts',()=>{
  const starter=quoteWebsite('starter'), growth=quoteWebsite('growth'), seo=quoteWebsite('seo');
  assert.deepEqual([starter.today,starter.handover,starter.monthly],[7450,11350,3900]);
  assert.deepEqual([growth.today,growth.handover,growth.monthly],[12450,16350,3900]);
  assert.deepEqual([seo.today,seo.handover,seo.monthly,seo.minimumTotal],[19500,0,19500,117000]);
  assert.throws(()=>quoteWebsite('__proto__'));
});
test('genuine offer expiration and price scope',()=>{
  const offer={id:'sample',active:true,plans:['starter'],kind:'fixed',value:5000,scope:'build',start:1000,end:2000};
  assert.equal(quoteWebsite('starter',offer,999).today,7450);
  assert.equal(quoteWebsite('starter',offer,1000).today,4950);
  assert.equal(quoteWebsite('starter',offer,1999).handover,8850);
  assert.equal(quoteWebsite('starter',offer,2000).today,7450);
  assert.equal(quoteWebsite('growth',offer,1500).today,12450);
  assert.throws(()=>quoteWebsite('starter',{...offer,value:20000},1500));
  const seoOffer={...offer,plans:['seo'],scope:'first-seo-month'};
  assert.equal(quoteWebsite('seo',seoOffer,1500).minimumTotal,112000);
  assert.equal(quoteWebsite('seo',seoOffer,1500).monthly,19500);
});
test('odd pence are reconciled exactly',()=>{
  const o={id:'sample',active:true,plans:['starter'],kind:'price',value:9901,scope:'build',start:1,end:10};
  const q=quoteWebsite('starter',o,2); assert.equal(q.today+q.handover-q.hosting,9901);
});
test('webhook verifies unmodified live event and rejects tampering and stale replay',async()=>{
  const secret='whsec_unit_test_only', now=1700000000000, ts=now/1000;
  const raw=JSON.stringify({id:'evt_unit_test',type:'invoice.paid',livemode:true});
  const sig='t='+ts+',v1='+createHmac('sha256',secret).update(ts+'.'+raw).digest('hex');
  assert.equal((await verifyWebsiteStripeEvent(raw,sig,secret,now)).id,'evt_unit_test');
  await assert.rejects(()=>verifyWebsiteStripeEvent(raw+' ',sig,secret,now));
  await assert.rejects(()=>verifyWebsiteStripeEvent(raw,sig,secret,now+301000));
  await assert.rejects(()=>verifyWebsiteStripeEvent(raw,sig,secret,now-301000));
});
