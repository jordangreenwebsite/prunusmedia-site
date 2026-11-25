import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMarketingPlan,marketingCalendar} from '../src/marketing-calendar.js';
const owner={admin:true,email:'owner@example.test'},env={CONTENT360_OWNER_EMAIL:owner.email,BLOG_SCHEDULE_READ_TOKEN:'test-secret'};
const item={id:'test-post',brand:'uk-trade-websites',platform:'facebook',planned_date:'2026-12-01',title:'<script>test</script>',copy:'Useful copy',evidence:'Verified evidence',creative:'Brief',source_key:'test',status:'held',hold_reason:'Permission needed'};
const plan=items=>({version:2,week_of:'2026-11-30',prepared_on:'2026-11-25',items});
test('validates brand, date, duplicate IDs, held reason and Google photo-only policy',()=>{
 assert.equal(validateMarketingPlan(plan([item])).items.length,1);
 for(const x of [{...item,brand:'greenwebsite'},{...item,brand:'__proto__'},{...item,platform:'constructor'},{...item,planned_date:'2026-12-07'},{...item,hold_reason:''},{...item,platform:'google-photos'}])assert.throws(()=>validateMarketingPlan(plan([x])));
 assert.throws(()=>validateMarketingPlan(plan([item,item])));
 assert.equal(validateMarketingPlan(plan([{...item,platform:'google-photos',copy:''}])).items[0].copy,'');
});
test('owner-only calendar, safe fetch, escaped content, filters and no publishing',async()=>{
 let calls=0;const fetcher=async(url,opts)=>{calls++;assert.equal(url,'https://api.github.com/repos/jordangreenwebsite/business-os/contents/growth/marketing-plan.json?ref=main');assert.equal(opts.redirect,'manual');return new Response(JSON.stringify(plan([item,{...item,id:'second-post',brand:'response-training',title:'Other business'}])));};
 const url='https://portal.example.test/marketing-studio/calendar';
 assert.equal((await marketingCalendar(new Request(url),env,null,fetcher)).status,401);
 assert.equal((await marketingCalendar(new Request(url),env,{admin:true,email:'other@example.test'},fetcher)).status,403);
 assert.equal((await marketingCalendar(new Request(url,{method:'POST'}),env,owner,fetcher)).status,405);assert.equal(calls,0);
 const r=await marketingCalendar(new Request(url+'?brand=uk-trade-websites'),env,owner,fetcher);const html=await r.text();
 assert.equal(r.status,200);assert.match(html,/&lt;script&gt;test&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>|test-secret|Other business/);assert.match(html,/Permission needed/);assert.match(html,/1 matching items/);assert.match(html,/does not schedule or publish/);
});
