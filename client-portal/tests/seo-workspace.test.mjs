import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {seoWorkspaceRoute,publicUrl,siteUrl,keywordKey,matchLink,runSeoSchedule} from '../src/seo-workspace.js';
function env(){
  const db=new DatabaseSync(':memory:');
  for(const f of ['0001_initial.sql','0002_editorial.sql','0003_integrations.sql','0004_workspaces.sql','0010_seo_workspace.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
  db.exec("INSERT INTO clients(id,slug,name,domain,contact_email) VALUES ('a','a','A','a.co.uk','a@example.com'),('b','b','B','b.co.uk','b@example.com')");
  return {DB:{prepare(sql){const s=db.prepare(sql);let p=[];const q={bind(...v){p=v;return q;},async first(){return s.get(...p)||null;},async all(){return {results:s.all(...p)};},async run(){return s.run(...p);}};return q;},async batch(q){db.exec('BEGIN');try{for(const i of q)await i.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}}};
}
async function call(e,client,path='',method='GET',data,admin=true){
  const u=new URL('https://portal.prunusmedia.com/api/admin/seo-workspace'+path+'?client='+client);
  const r=await seoWorkspaceRoute(new Request(u,{method,headers:{'content-type':'application/json'},body: data===undefined?undefined:JSON.stringify(data)}),e,{admin,email:'admin@example.com'},u);
  return {status:r.status,data:await r.json()};
}
test('agency-only, client-specific keywords, no cross-site target, no duplicate terms',async()=>{
  const e=env();assert.equal((await call(e,'a','','GET',undefined,false)).status,403);
  assert.equal((await call(e,'missing')).status,404);
  assert.equal((await call(e,'a','/keywords','POST',{keywords:['Car Valet',' car  valet ']})).status,201);
  assert.equal((await call(e,'a')).data.keywords.length,1);
  assert.equal((await call(e,'b')).data.keywords.length,0);
  const k=(await call(e,'a')).data.keywords[0];
  assert.equal((await call(e,'a','/keywords','POST',{keyword:'invalid',target_url:'https://b.co.uk/'})).status,400);
  assert.equal((await call(e,'b','/keywords/'+k.id,'PATCH',{keyword:'stolen'})).status,404);
  await call(e,'b','/keywords/'+k.id,'DELETE');assert.equal((await call(e,'a')).data.keywords.length,1);
  assert.equal((await call(e,'a','/sync','POST',{})).status,409);
  assert.deepEqual((await call(e,'a')).data.daily,[]);
  await runSeoSchedule(e);
});
test('backlink source validation and tenant-scoped edit, no paid API',async()=>{
  const e=env();
  const saved=await call(e,'a','/backlinks','POST',{source_url:'https://directory.co.uk/page',target_url:'https://a.co.uk/',outreach_status:'contacted',monitor:false});
  assert.equal(saved.status,201);
  assert.equal((await call(e,'b')).data.links.length,0);
  assert.equal((await call(e,'b','/backlinks/'+saved.data.id+'/check','POST',{})).status,404);
  assert.equal((await call(e,'a','/backlinks','POST',{source_url:'https://127.0.0.1/',target_url:'https://a.co.uk/'})).status,400);
  assert.equal((await call(e,'a')).data.links[0].check_status,'unchecked');
  assert.equal(publicUrl('https://user:pass@directory.co.uk/'),null);
  assert.equal(publicUrl('https://localhost/'),null);
  assert.equal(siteUrl('https://evil-a.co.uk/',['a.co.uk']),null);
  assert.equal(keywordKey(' A  B '),'a b');
  assert.ok(matchLink('https://www.a.co.uk/page/#top','https://directory.co.uk/','https://a.co.uk/page'));
  assert.ok(!matchLink('https://a.co.uk/other','https://directory.co.uk/','https://a.co.uk/page'));
});
test('UI is on the existing agency-only SEO screen',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.ok(html.includes('id="seo-workspace-root"'));
  assert.ok(html.includes('/seo-workspace-ui.js'));
});
