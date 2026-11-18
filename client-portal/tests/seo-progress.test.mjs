import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {seoProgressRoute,monthBounds,monthPerformance,rankMovement} from '../src/seo-progress.js';
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const name of ['0001_initial.sql','0002_editorial.sql','0003_integrations.sql','0004_workspaces.sql','0010_seo_workspace.sql','0011_seo_paid_research.sql','0012_seo_actions.sql','0013_seo_client_progress.sql','0014_seo_client_keyword_selection.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.exec("INSERT INTO clients(id,slug,name,domain,contact_email,gsc_property) VALUES('a','a','A','a.co.uk','a@example.com','sc-domain:a.co.uk'),('b','b','B','b.co.uk','b@example.com','sc-domain:b.co.uk')");
 db.exec("INSERT INTO client_members(id,client_id,email,role) VALUES('m','a','client@example.com','owner')");
 db.exec("INSERT INTO seo_keywords(id,client_id,keyword,keyword_key) VALUES('ka','a','roofing Swindon','roofing swindon'),('kb','b','other private keyword','other private keyword')");
 const DB={prepare(sql){const p=db.prepare(sql);let values=[];const q={bind(...v){values=v;return q;},async first(){return p.get(...values)||null;},async all(){return {results:p.all(...values)};},async run(){return p.run(...values);}};return q;},async batch(q){db.exec('BEGIN');try{for(const i of q)await i.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};return {db,DB};
}
const admin={admin:true,email:'admin@example.com'},member={admin:false,email:'client@example.com'};
async function call(e,client,path='',method='GET',payload,user=admin){
 const u=new URL('https://portal.prunusmedia.com/api/seo-progress'+path+'?client='+client);
 const req=new Request(u,{method,headers:{'content-type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
 const r=await seoProgressRoute(req,e,user,u);return {status:r.status,data:await r.json()};
}
test('month movement and matched reported day comparisons never fabricate zero metrics',()=>{
 const m=monthBounds(new Date('2026-11-18T00:00:00Z'));
 const rows=[{day:'2026-10-03',clicks:1,impressions:10,position:10},{day:'2026-11-03',clicks:2,impressions:20,position:8},{day:'2026-11-04',clicks:5,impressions:30,position:7}];
 const p=monthPerformance(rows,m);assert.equal(p.current.clicks,7);assert.equal(p.matchedCurrent.clicks,2);assert.equal(p.matchedPrevious.clicks,1);
 assert.equal(monthPerformance([],m).current,null);
 assert.equal(rankMovement({position:3,checked_at:'2026-11-12'},{position:9,checked_at:'2026-10-28'},m.start).change,6);
 assert.equal(rankMovement({position:null,checked_at:'2026-11-12'},{position:9,checked_at:'2026-10-28'},m.start).change,null);
 assert.equal(rankMovement({position:3,checked_at:'2026-10-28'},{position:9,checked_at:'2026-10-01'},m.start).change,null);
});
test('member sees own keywords and actual rank snapshots without rival or internal task data',async()=>{
 const e=setup(),m=monthBounds();
 e.db.exec("INSERT INTO seo_rank_targets(id,client_id,keyword_id,location,device,enabled) VALUES('t','a','ka','United Kingdom','desktop',1)");
 const insert=e.db.prepare("INSERT INTO seo_rank_history(target_id,checked_at,keyword,domain,position,url,result_count,rivals) VALUES('t',?,'roofing Swindon','a.co.uk',?,'https://a.co.uk/',30,'[\"private-rival\"]')");
 insert.run(m.previousStart+'T00:00:00Z',12);insert.run(m.start+'T00:00:00Z',4);
 e.db.exec("INSERT INTO seo_action_tasks(client_id,task_key,status,title,evidence) VALUES('a','task','done','Private task','Internal evidence')");
 assert.equal((await call(e,'a','/client-keywords','POST',{keyword_ids:['ka']})).status,200);
 const a=await call(e,'a','','GET',undefined,member);assert.equal(a.status,200);assert.equal(a.data.keywords[0].targets[0].movement.change,8);
 assert.equal(a.data.counts.monitored,1);assert.equal(a.data.counts.improved,1);
 const wire=JSON.stringify(a.data);for(const x of ['private-rival','Private task','Internal evidence','other private keyword','gsc_property'])assert.ok(!wire.includes(x));
 assert.equal((await call(e,'b','','GET',undefined,member)).status,404);
 assert.equal((await call(e,'a','/track','POST',{keyword_ids:['ka']},member)).status,403);
 assert.equal((await call(e,'a','/updates','POST',{},member)).status,403);
 assert.equal((await call(e,'a','','GET',undefined,{admin:false,email:'stranger@example.com'})).status,404);
});
test('admin bulk tracking validates tenant and weekly paid checks are opt-in',async()=>{
 const e=setup();
 assert.equal((await call(e,'a','/track','POST',{keyword_ids:['ka','kb']})).status,404);
 assert.equal((await call(e,'a','/track','POST',{keyword_ids:['ka']})).status,201);
 assert.equal((await call(e,'a')).data.keywords[0].targets[0].enabled,false);
 assert.equal((await call(e,'a','/track','POST',{keyword_ids:['ka'],location:'Swindon,England,United Kingdom',device:'mobile',enabled:true})).status,201);
 assert.equal((await call(e,'a')).data.counts.monitored,1);
});
test('only reviewed completed work updates are shared, isolated by membership',async()=>{
 const e=setup(),d=monthBounds().today;
 e.db.exec("INSERT INTO seo_action_tasks(client_id,task_key,status,title,evidence) VALUES('a','done-task','done','Internal task','Private evidence'),('a','open-task','open','Unfinished','Private')");
 const body={title:'Improved service page',detail:'Updated service information',completed_on:d,confirm_share:true};
 assert.equal((await call(e,'a','/updates','POST',{...body,confirm_share:false})).status,400);
 assert.equal((await call(e,'a','/updates','POST',{...body,task_key:'open-task'})).status,404);
 const ok=await call(e,'a','/updates','POST',{...body,task_key:'done-task'});assert.equal(ok.status,201);
 assert.equal((await call(e,'a','','GET',undefined,member)).data.updates[0].title,'Improved service page');
 assert.equal((await call(e,'b')).data.updates.length,0);
 assert.equal((await call(e,'a','/updates/'+ok.data.id,'DELETE',undefined,member)).status,403);
 await call(e,'b','/updates/'+ok.data.id,'DELETE');
 assert.equal((await call(e,'a')).data.updates.length,1);
 await call(e,'a','/updates/'+ok.data.id,'DELETE');
 assert.equal((await call(e,'a')).data.updates.length,0);
});
test('keyword progress is a separate business view for both roles',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),routes=readFileSync(new URL('../public/portal-pages.js',import.meta.url),'utf8');
 assert.match(html,/id="screen-keywords"/);
 assert.match(html,/data-portal-route="keywords" data-context="business" data-permission="both"/);
 assert.match(routes,/const clientViews=new Set\([^\n]+keywords/);
});

test('client receives at most five explicitly selected keywords and matching counts, never private tracking data',async()=>{
 const e=setup(),m=monthBounds();
 const add=e.db.prepare('INSERT INTO seo_keywords(id,client_id,keyword,keyword_key) VALUES(?,?,?,?)');
 for(let i=1;i<=19;i++)add.run('term'+i,'a','SEO term '+i,'seo term '+i);
 const addTarget=e.db.prepare('INSERT INTO seo_rank_targets(id,client_id,keyword_id,location,device,enabled) VALUES(?,?,?,?,?,1)');
 for(let i=1;i<=19;i++)addTarget.run('target'+i,'a','term'+i,'United Kingdom','desktop');
 e.db.prepare("INSERT INTO seo_rank_history(target_id,checked_at,keyword,domain,position,url,result_count,rivals) VALUES(?,?,?,?,?,?,30,'[]')").run('target19',m.start+'T00:00:00Z','SEO term 19','a.co.uk',1,'https://a.co.uk/private-rank-page');
 const empty=await call(e,'a','','GET',undefined,member);assert.equal(empty.data.keywords.length,0);assert.equal(empty.data.counts.saved,0);assert.equal(empty.data.client_keyword_limit,5);
 const ids=['term5','term2','term3','term4','ka'];
 assert.equal((await call(e,'a','/client-keywords','POST',{keyword_ids:ids})).status,200);
 assert.equal((await call(e,'a','/client-keywords','POST',{keyword_ids:[...ids,'term6']})).status,400);
 assert.equal((await call(e,'a','/client-keywords','POST',{keyword_ids:['term1','term1']})).status,400);
 assert.equal((await call(e,'a','/client-keywords','POST',{keyword_ids:['kb']})).status,404);
 assert.equal((await call(e,'a','/client-keywords','POST',{keyword_ids:[]},member)).status,403);
 const client=await call(e,'a','','GET',undefined,member);
 assert.deepEqual(client.data.keywords.map(x=>x.id),ids);
 assert.equal(client.data.counts.saved,5);assert.equal(client.data.counts.monitored,4);assert.equal(client.data.counts.improved,0);
 const wire=JSON.stringify(client.data);
 for(const privateData of ['SEO term 19','target19','private-rank-page','client_slot','client_keyword_ids'])assert.ok(!wire.includes(privateData));
 const owner=await call(e,'a');assert.equal(owner.data.keywords.length,20);assert.equal(owner.data.counts.monitored,19);assert.deepEqual(owner.data.client_keyword_ids,ids);
 assert.throws(()=>e.db.prepare('INSERT INTO seo_client_keyword_slots(client_id,slot,keyword_id) VALUES(?,?,?)').run('a',6,'term6'));
 assert.throws(()=>e.db.prepare('INSERT INTO seo_client_keyword_slots(client_id,slot,keyword_id) VALUES(?,?,?)').run('b',1,'term6'));
 e.db.prepare('DELETE FROM seo_keywords WHERE id=?').run('term5');
 assert.equal((await call(e,'a','','GET',undefined,member)).data.keywords.length,4);
 assert.equal((await call(e,'a','/client-keywords','POST',{keyword_ids:['term6']})).status,200);
 assert.deepEqual((await call(e,'a','','GET',undefined,member)).data.keywords.map(x=>x.id),['term6']);
 assert.equal((await call(e,'a','/client-keywords','POST',{keyword_ids:[]})).status,200);
 assert.equal((await call(e,'a','','GET',undefined,member)).data.keywords.length,0);
 assert.equal((await call(e,'a')).data.keywords.length,19);
});
