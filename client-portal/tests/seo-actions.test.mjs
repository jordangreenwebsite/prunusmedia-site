import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {crawlUrl,robotsPolicy,sitemapEntries,pageIssues,auditSite} from '../src/seo-audit.js';
import {buildOpportunities,calendarMonth,seoActionsRoute,runSeoActionsSchedule} from '../src/seo-actions.js';
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['0001_initial.sql','0002_editorial.sql','0003_integrations.sql','0004_workspaces.sql','0010_seo_workspace.sql','0011_seo_paid_research.sql','0012_seo_actions.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 db.exec("INSERT INTO clients(id,slug,name,domain,contact_email) VALUES('a','a','A','a.co.uk','a@example.com'),('b','b','B','b.co.uk','b@example.com')");
 const DB={prepare(sql){const s=db.prepare(sql);let args=[];const q={bind(...v){args=v;return q;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};return q;},async batch(q){db.exec('BEGIN');try{for(const i of q)await i.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {db,DB};
}
async function call(e,client,p='',method='GET',body,admin=true){
 const u=new URL('https://portal.prunusmedia.com/api/admin/seo-actions'+p+'?client='+client);
 const r=await seoActionsRoute(new Request(u,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),e,{admin,email:'admin@example.com'},u);
 return {status:r.status,data:await r.json()};
}
const sample={pairs_available:true,from:'2026-10-01',to:'2026-10-28',pairs:[
 {query:'how to clean windows',page:'https://a.co.uk/clean/',impressions:50},
 {query:'how to clean windows',page:'https://a.co.uk/blog/',impressions:20},
 {query:'other',page:'https://a.co.uk/other/',impressions:4}
],current:[{query:'how to clean windows',impressions:70,clicks:2,position:8}],previous:[{query:'how to clean windows',impressions:130,position:5}]};
test('bounded verified evidence generates mappings, possible overlap and blog candidates',()=>{
 const r=buildOpportunities(sample,[{id:'k',keyword:'how to clean windows',keyword_key:'how to clean windows',target_url:'https://a.co.uk/news/'}],{pages:[],links:[{target:'https://a.co.uk/missing',sources:['https://a.co.uk/'],status:404},{target:'https://a.co.uk/blocked',sources:['https://a.co.uk/'],status:403}],sitemap:{status:200}});
 assert.equal(r.mapping[0].suggested,'https://a.co.uk/clean/');assert.equal(r.mapping[0].mismatch,true);
 for(const kind of ['mapping','overlap','improve','decline','blog','broken'])assert.equal(r.opportunities.filter(t=>t.type===kind).length,1);
 assert.ok(!r.opportunities.some(t=>t.evidence.includes('/blocked')));
 assert.deepEqual(buildOpportunities(null,[],null).opportunities,[]);
});
test('site crawl never follows external hosts, queries or sensitive paths',()=>{
 assert.equal(crawlUrl('https://other.co.uk/page','a.co.uk','https://a.co.uk/'),null);
 assert.equal(crawlUrl('/checkout','a.co.uk','https://a.co.uk/'),null);
 assert.equal(crawlUrl('/concept-websites/example/','a.co.uk','https://a.co.uk/'),null);
 assert.equal(crawlUrl('/%2561pi/status','a.co.uk','https://a.co.uk/'),null);
 assert.equal(crawlUrl('/%61pi/status','a.co.uk','https://a.co.uk/'),null);
 assert.equal(crawlUrl('/page?secret=1','a.co.uk','https://a.co.uk/'),null);
 assert.equal(crawlUrl('/page#section','a.co.uk','https://a.co.uk/'),'https://a.co.uk/page');
 assert.equal(robotsPolicy('User-agent: *\nDisallow: /private').allows('https://a.co.uk/private/a'),false);
 assert.equal(robotsPolicy('User-agent: *\nDisallow: /private').allows('https://a.co.uk/public'),true);
 assert.equal(robotsPolicy('User-agent: *\nCrawl-delay: 5').allows('https://a.co.uk/'),false);
 assert.equal(sitemapEntries('<urlset><loc>https://a.co.uk/page</loc><loc>https://other.co.uk/page</loc></urlset>','a.co.uk','https://a.co.uk/').length,1);
 assert.deepEqual(pageIssues({status:403}),[]);
 assert.deepEqual(pageIssues({status:404}),['Page returns HTTP 404']);
 assert.ok(pageIssues({status:200,html:true,h1:0,imagesWithoutAlt:1}).includes('Missing H1'));
});
test('uncertain robots response skips the crawl and cross-host redirect is not followed',async()=>{
 let calls=[];
 const r=await auditSite('a.co.uk',async(url,opts)=>{calls.push(url);assert.equal(opts.redirect,'manual');assert.equal(opts.headers.authorization,undefined);return new Response(null,{status:302,headers:{location:'https://other.co.uk/robots.txt'}});});
 assert.deepEqual(calls,['https://a.co.uk/robots.txt']);assert.equal(r.pages.length,0);
});
test('month dates and unavailable metrics are not invented; report remains agency-only',async()=>{
 assert.equal(calendarMonth('2026-11',new Date('2026-11-18T12:00:00Z')),null);
 assert.deepEqual(calendarMonth('2026-10',new Date('2026-11-18T12:00:00Z')),{month:'2026-10',start:'2026-10-01',end:'2026-10-31',priorStart:'2026-09-01',priorEnd:'2026-09-30'});
 const e=setup();
 assert.equal((await call(e,'a','','GET',undefined,false)).status,403);
 assert.equal((await call(e,'missing')).status,404);
 const m=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()-2,1)).toISOString().slice(0,7);
 const r=await call(e,'a','/reports','POST',{month:m});assert.equal(r.status,200);
 assert.equal(r.data.report.performance.current,null);assert.equal(r.data.report.performance.status,'not-configured');
 assert.equal((await call(e,'b','/reports/'+m)).status,404);
 assert.equal((await call(e,'a','/reports/'+m)).data.report.business,'A');
 await runSeoActionsSchedule(e);
});
test('recommendation status is tenant scoped, schedule opt-in',async()=>{
 const e=setup();
 e.db.prepare("UPDATE clients SET gsc_property='sc-domain:a.co.uk' WHERE id='a'").run();
 e.db.prepare("INSERT INTO seo_sync(client_id,property,snapshot) VALUES(?,?,?)").run('a','sc-domain:a.co.uk',JSON.stringify(sample));
 const a=await call(e,'a');assert.ok(a.data.opportunities.length);
 const key=a.data.opportunities[0].key;
 assert.equal((await call(e,'b','/task','POST',{key,status:'done'})).status,404);
 assert.equal((await call(e,'a','/task','POST',{key,status:'done'})).status,200);
 assert.equal((await call(e,'a')).data.opportunities.find(x=>x.key===key).status,'done');
 assert.equal((await call(e,'a')).data.settings.audit_enabled,0);
 assert.equal((await call(e,'a','/settings','POST',{audit_enabled:true,reports_enabled:false})).status,200);
 assert.equal((await call(e,'a')).data.settings.audit_enabled,1);
});
test('existing portal exposes actions and distinct schedule only through admin view',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/seo-actions-ui.js',import.meta.url),'utf8');
 assert.ok(html.includes('id="seo-actions-root"'));
 assert.ok(worker.includes("_event?.cron==='23 */6 * * *'"));
 assert.ok(ui.includes("jsonPost('/api/editorial'"));
});
