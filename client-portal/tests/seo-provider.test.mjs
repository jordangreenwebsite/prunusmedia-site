import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {providerConfig,reserve,parseResults,paidSeoRoute,runPaidSeoSchedule} from '../src/seo-provider.js';
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['0001_initial.sql','0002_editorial.sql','0003_integrations.sql','0004_workspaces.sql','0010_seo_workspace.sql','0011_seo_paid_research.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 db.exec("INSERT INTO clients(id,slug,name,domain,contact_email) VALUES('a','a','A','a.co.uk','a@example.com'),('b','b','B','b.co.uk','b@example.com')");
 db.exec("INSERT INTO seo_keywords(id,client_id,keyword,keyword_key) VALUES('k','a','roofer Swindon','roofer swindon')");
 return {db,DB:{prepare(sql){const s=db.prepare(sql);let args=[];const q={bind(...v){args=v;return q;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};return q;}}};
}
async function call(e,client,p='',method='GET',body,admin=true){
 const u=new URL('https://portal.prunusmedia.com/api/admin/seo-provider'+p+'?client='+client);
 const r=await paidSeoRoute(new Request(u,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),e,{admin,email:'a@example.com'},u);
 return {status:r.status,data:await r.json()};
}
test('disabled by default, admin only, and rank targets scoped',async()=>{
 const e=setup();assert.equal(providerConfig(e).enabled,false);
 assert.equal((await call(e,'a','','GET',undefined,false)).status,403);
 assert.equal((await call(e,'a','/ideas','POST',{keyword:'roofer'})).status,409);
 assert.equal((await call(e,'b','/targets','POST',{keyword_id:'k'})).status,404);
 assert.equal((await call(e,'a','/targets','POST',{keyword_id:'k'})).status,201);
 assert.equal((await call(e,'a')).data.tracked.length,1);
 assert.equal((await call(e,'b')).data.tracked.length,0);
 await runPaidSeoSchedule(e);
});
test('atomic shared budget, duplicate suppression, provider overage blocks additional calls',async()=>{
 const e=Object.assign(setup(),{DATAFORSEO_LOGIN:'mock',DATAFORSEO_PASSWORD:'mock',DATAFORSEO_ENABLED:'true',DATAFORSEO_MONTHLY_BUDGET_USD:'0.10'});
 const id=await reserve(e,'a','ideas','one');
 await assert.rejects(reserve(e,'a','ideas','one'),/Budget/);
 await reserve(e,'b','ideas','two');
 await assert.rejects(reserve(e,'a','rank','three'),/Budget/);
 e.db.prepare('UPDATE seo_provider_usage SET billed=51000 WHERE id=?').run(id);
 await assert.rejects(reserve(e,'a','rank','four'),/Budget/);
});
test('provider result normalisation preserves unknowns and organic rank',()=>{
 assert.deepEqual(parseResults('ideas',{items:[{keyword:'a',keyword_info:{search_volume:0}}]}).rows[0].volume,0);
 assert.equal(parseResults('ideas',{items:[{keyword:'a'}]}).rows[0].difficulty,null);
 const r=parseResults('rank',{items:[{type:'paid',rank_group:1,domain:'a.co.uk'},{type:'organic',rank_group:2,domain:'www.a.co.uk',url:'https://a.co.uk/'}]},'a.co.uk');
 assert.equal(r.position,2);
 assert.equal(parseResults('rank',{items:[]},'a.co.uk').position,null);
});
test('mock provider results are cached, actual charges recorded and credentials not returned',async()=>{
 const e=Object.assign(setup(),{DATAFORSEO_LOGIN:'mock',DATAFORSEO_PASSWORD:'secret',DATAFORSEO_ENABLED:'true'});
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live');assert.equal(opts.redirect,'error');
 return new Response(JSON.stringify({status_code:20000,cost:0.013,tasks:[{status_code:20000,result:[{items:[{keyword:'roof repairs',keyword_info:{search_volume:90},keyword_properties:{keyword_difficulty:13}}]}]}]}));};
 try{
  const a=await call(e,'a','/ideas','POST',{keyword:'roofer'});assert.equal(a.status,200);assert.equal(a.data.rows[0].volume,90);
  const b=await call(e,'a','/ideas','POST',{keyword:'roofer'});assert.equal(b.data.cached,true);assert.equal(calls,1);
  const s=await call(e,'a');assert.equal(s.data.spend.used,13000);assert.ok(!JSON.stringify(s).includes('secret'));
  assert.equal((await call(e,'a','/ideas','POST',{keyword:'site:a.co.uk'})).status,400);
 }finally{globalThis.fetch=old;}
});
