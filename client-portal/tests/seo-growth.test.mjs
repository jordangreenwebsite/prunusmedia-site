import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {eventRequest,parseEvents,reportGrowth,growthRoute} from '../src/seo-growth.js';
import {parseResults} from '../src/seo-provider.js';
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0001_initial.sql','0002_editorial.sql','0003_integrations.sql','0004_workspaces.sql','0010_seo_workspace.sql','0011_seo_paid_research.sql','0012_seo_actions.sql','0013_seo_client_progress.sql','0014_seo_client_keyword_selection.sql','0015_seo_reporting.sql','0016_seo_growth.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.exec("INSERT INTO clients(id,slug,name,domain,contact_email) VALUES('a','a','A','a.co.uk','a@example.com'),('b','b','B','b.co.uk','b@example.com')");
 const DB={prepare(sql){const p=db.prepare(sql);let args=[];const q={bind(...v){args=v;return q;},async first(){return p.get(...args)||null;},async all(){return {results:p.all(...args)};},async run(){return p.run(...args);}};return q;}};
 return {db,DB};
}
test('Maps rankings select exact listing identifiers and exclude paid listings',()=>{
 const items=[{type:'maps_paid_item',rank_group:1,cid:'1234'},{type:'maps_search',rank_group:2,cid:'1234',place_id:'ChIJabcdefghijk'},{type:'maps_search',rank_group:3,cid:'5678'}];
 assert.equal(parseResults('maps',{items},'cid:1234').position,2);
 assert.equal(parseResults('maps',{items},'ChIJabcdefghijk').position,2);
 assert.equal(parseResults('maps',{items},'cid:9999').position,null);
});
test('conversion counts filter organic channel, website and fixed event names',()=>{
 const req=eventRequest({domain:'a.co.uk'},{start:'2026-10-01',end:'2026-10-31'},true);
 assert.deepEqual(req.dimensionFilter.andGroup.expressions[0].filter.inListFilter.values,['a.co.uk','www.a.co.uk']);
 assert.equal(req.dimensionFilter.andGroup.expressions[2].filter.stringFilter.value,'Organic Search');
 assert.deepEqual(parseEvents({rows:[{dimensionValues:[{value:'phone_click'}],metricValues:[{value:'7'}]},{dimensionValues:[{value:'unknown'}],metricValues:[{value:'99'}]}]}),{phone_click:7});
});
test('monthly growth report omits private keywords, change notes and other clients',async()=>{
 const e=setup();e.db.exec("INSERT INTO seo_keywords(id,client_id,keyword,keyword_key) VALUES('k','a','roofer','roofer'),('p','a','private keyword','private keyword'); INSERT INTO seo_client_keyword_slots(client_id,slot,keyword_id) VALUES('a',1,'k'); INSERT INTO seo_maps_targets(id,client_id,keyword_id,place_identity,location) VALUES('t','a','k','cid:123','Swindon'),('tp','a','p','cid:123','Swindon'); INSERT INTO seo_maps_checks(target_id,checked_at,keyword,domain,position,result_count) VALUES('t','2026-10-15T00:00:00Z','roofer','a.co.uk',5,30),('tp','2026-10-15T00:00:00Z','private keyword','a.co.uk',2,30); INSERT INTO seo_website_changes(id,client_id,title,changed_on,detail,shared) VALUES('c','a','Updated homepage','2026-10-08','private note',1),('d','a','private change','2026-10-09','detail',0),('e','b','other tenant','2026-10-09','detail',1)");
 const r=await reportGrowth(e,{id:'a',domain:'a.co.uk'},{start:'2026-10-01',end:'2026-10-31'},'');
 assert.equal(r.maps.length,1);assert.equal(r.maps[0].position,5);assert.equal(r.changes.length,1);assert.equal(r.changes[0].title,'Updated homepage');assert.equal(r.events.status,'not-configured');
 for(const x of ['private keyword','private note','private change','other tenant'])assert.ok(!JSON.stringify(r).includes(x));
});
test('agency-only growth and audit shortcut',async()=>{
 const e=setup(),url=new URL('https://portal.prunusmedia.com/api/admin/seo-growth?client=a');
 assert.equal((await growthRoute(new Request(url),e,{admin:false,email:'member@example.com'},url)).status,403);
 const r=await growthRoute(new Request(url),e,{admin:true,email:'admin@example.com'},url);assert.equal(r.status,200);
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),routes=readFileSync(new URL('../public/portal-pages.js',import.meta.url),'utf8');
 assert.ok(html.includes('id="screen-audits"'));assert.ok(html.includes('https://prunusmedia.com/seo-agency-uk/free-seo-audit/'));assert.match(html,/data-portal-route="audits" data-context="agency" data-permission="admin"/);assert.match(routes,/agencyViews=new Set\([^\n]+audits/);
});
