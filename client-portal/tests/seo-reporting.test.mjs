import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {analyticsRequest,parseAnalytics,analyticsMetrics,buildClientReport,renderReport,reportingRoute} from '../src/seo-reporting.js';
const dates={month:'2026-10',start:'2026-10-01',end:'2026-10-31',priorStart:'2026-09-01',priorEnd:'2026-09-30'};
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0001_initial.sql','0002_editorial.sql','0003_integrations.sql','0004_workspaces.sql','0010_seo_workspace.sql','0011_seo_paid_research.sql','0012_seo_actions.sql','0013_seo_client_progress.sql','0014_seo_client_keyword_selection.sql','0015_seo_reporting.sql','0016_seo_growth.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.exec("INSERT INTO clients(id,slug,name,domain,contact_email) VALUES('a','a','A','a.co.uk','a@example.com'),('b','b','B','b.co.uk','b@example.com')");
 const DB={prepare(sql){const p=db.prepare(sql);let args=[];const q={bind(...v){args=v;return q;},async first(){return p.get(...args)||null;},async all(){return {results:p.all(...args)};},async run(){return p.run(...args);}};return q;}};
 return {db,DB};
}
const admin={admin:true,email:'admin@example.com'},member={admin:false,email:'client@example.com'};
async function call(env,path='',method='GET',body,user=admin,client='a'){
 const url=new URL('https://portal.prunusmedia.com/api/admin/seo-reporting'+path+'?client='+client);
 return reportingRoute(new Request(url,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,user,url);
}
test('analytics filters the registered hostname and organic channel, with missing periods preserved',async()=>{
 const r=analyticsRequest('www.a.co.uk',dates,true);assert.deepEqual(r.dimensionFilter.andGroup.expressions[0].filter.inListFilter.values,['a.co.uk','www.a.co.uk']);assert.equal(r.dimensionFilter.andGroup.expressions[1].filter.stringFilter.value,'Organic Search');
 const raw={dimensionHeaders:[{name:'dateRange'}],metricHeaders:[{name:'sessions'},{name:'activeUsers'},{name:'keyEvents'}],rows:[{dimensionValues:[{value:'current'}],metricValues:[{value:'11'},{value:'9'},{value:'0'}]}]};
 const parsed=parseAnalytics(raw);assert.equal(parsed.current.sessions,11);assert.equal(parsed.current.keyEvents,0);assert.equal(parsed.previous,null);
 const env=setup();env.GSC_SERVICE_ACCOUNT_JSON='test';env.db.exec("INSERT INTO seo_reporting_settings(client_id,domain,ga_property) VALUES('a','a.co.uk','123456')");
 let calls=0;const x=await analyticsMetrics(env,{id:'a',domain:'a.co.uk'},dates,async(url,opts)=>{calls++;assert.equal(url,'https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport');assert.equal(opts.headers.authorization,'Bearer fake');return new Response(JSON.stringify(raw));},async(_,scope)=>{assert.equal(scope,'https://www.googleapis.com/auth/analytics.readonly');return 'fake';});
 assert.equal(calls,2);assert.equal(x.status,'ok');assert.equal(x.organic.current.sessions,11);
});
test('branded report contains only selected keywords and no private contacts, even in printable markup',async()=>{
 const e=setup();e.db.exec("INSERT INTO seo_keywords(id,client_id,keyword,keyword_key) VALUES('k','a','roofing','roofing'),('private','a','PRIVATE TERM','private term'); INSERT INTO seo_client_keyword_slots(client_id,slot,keyword_id) VALUES('a',1,'k'); INSERT INTO seo_backlinks(id,client_id,source_url,target_url,contact,notes,contacted_on) VALUES('l','a','https://directory.co.uk/item','https://a.co.uk/','PRIVATE EMAIL','PRIVATE NOTES','2026-10-02'); INSERT INTO seo_reporting_settings(client_id,domain,brand) VALUES('a','a.co.uk','dual')");
 const r=await buildClientReport(e,{id:'a',name:'<script>bad</script>',domain:'a.co.uk',brand:'prunus'},dates,{status:'not-configured',current:null,previous:null},{audit:null},'2026-11-06T00:00:00Z');
 assert.equal(r.keywords.length,1);assert.equal(r.brand,'Prunus Media / UK Trade Websites');assert.equal(r.outreach[0].domain,'directory.co.uk');assert.equal(r.analytics.status,'not-configured');
 const html=renderReport(r);assert.ok(html.includes('roofing'));assert.ok(html.includes('Your five focus keywords'));assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert.ok(!html.includes('<script>'));
 for(const privateValue of ['PRIVATE TERM','PRIVATE EMAIL','PRIVATE NOTES'])assert.ok(!JSON.stringify(r).includes(privateValue)&&!html.includes(privateValue));
});
test('settings are agency-only, require property confirmation, and provider test returns no credentials',async()=>{
 const e=setup();
 assert.equal((await call(e,'','GET',undefined,member)).status,403);
 assert.equal((await call(e,'','POST',{ga_property:'G-123',confirm_property:true})).status,400);
 assert.equal((await call(e,'','POST',{ga_property:'123'})).status,400);
 assert.equal((await call(e,'','POST',{ga_property:'123',brand:'dual',confirm_property:true})).status,200);
 assert.equal((await (await call(e)).json()).ga_property,'123');
 assert.equal((await (await call(e,'','GET',undefined,admin,'b')).json()).ga_property,'');
 assert.equal((await call(e,'/test-dataforseo','POST',{})).status,409);
});
