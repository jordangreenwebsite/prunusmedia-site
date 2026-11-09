import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from '../src/index.js';
import { enqueueWeeklyResearch } from '../src/editorial.js';

const base='https://portal.prunusmedia.com';
const A='00000000-0000-4000-8000-00000000000a', B='00000000-0000-4000-8000-00000000000b';
function harness() {
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['0001_initial.sql','0002_editorial.sql'])
    sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const db={
    prepare(sql) {
      const stmt=sqlite.prepare(sql);let values=[];
      const q={bind(...args){values=args;return q;},
        async first(){return stmt.get(...values)||null;},
        async all(){return {results:stmt.all(...values)};},
        async run(){const x=stmt.run(...values);return {meta:{changes:x.changes}};}};
      return q;
    },
    async batch(queries) {
      sqlite.exec('BEGIN');
      try{const results=[];for(const q of queries)results.push(await q.run());sqlite.exec('COMMIT');return results;}
      catch(e){sqlite.exec('ROLLBACK');throw e;}
    }
  };
  const objects=new Map();
  const env={DB:db,AUTH_PEPPER:'unit test secret',ADMIN_EMAILS:'admin@prunusmedia.com',
    UPLOADS:{
      async put(key,bytes){objects.set(key,bytes);},
      async get(key){return objects.has(key)?{body:new Blob([objects.get(key)])}:null;},
      async delete(key){objects.delete(key);}
    },ASSETS:{fetch:async()=>new Response('portal')}};
  function seed(clientId,name,domain,email) {
    sqlite.prepare('INSERT INTO clients (id,slug,name,domain,contact_email) VALUES (?,?,?,?,?)')
      .run(clientId,clientId,name,domain,email);
    sqlite.prepare("INSERT INTO client_members (id,client_id,email,role) VALUES (?, ?, ?,'owner')").run('membership-'+clientId,clientId,email);
  }
  seed(A,'Residential Roofing & Fascias','roofer.example.co.uk','roofer@example.co.uk');
  seed(B,'PP Power Detailing','detailing.example.co.uk','detailer@example.co.uk');
  const cookies=new Map();
  for(const email of ['admin@prunusmedia.com','roofer@example.co.uk','detailer@example.co.uk']){
    const raw=createHash('sha256').update('session:'+email).digest('hex');
    const hashed=createHash('sha256').update(raw).digest('hex');
    sqlite.prepare('INSERT INTO sessions (token_hash,email,expires_at) VALUES (?,?,?)')
      .run(hashed,email,Date.now()+60*60*1000);
    cookies.set(email,'__Host-prunus_session='+raw);
  }
  async function call(path,{email='admin@prunusmedia.com',method='GET',data,form,origin=base}={}) {
    const headers={origin,cookie:cookies.get(email)};
    if(data!==undefined)headers['content-type']='application/json';
    const body=data!==undefined?JSON.stringify(data):form;
    const res=await worker.fetch(new Request(base+path,{method,headers,body}),env,{waitUntil(){}});
    const json=res.headers.get('content-type')?.includes('application/json')?await res.json():null;
    return {res,json};
  }
  return {env,sqlite,call,objects};
}
test('private editorial calendar, duplicate control, approvals and release gate',async()=>{
  const h=harness();
  let r=await h.call('/api/admin/clients/'+A+'/settings',{method:'PATCH',data:{
    brand:'uk-trades',industry:'Roofing',service_area:'Cirencester and Swindon',voice_notes:'Clear and helpful',
    requires_blog_approval:true,allow_client_ideas:true,allow_client_uploads:true,search_console_url:''}});
  assert.equal(r.res.status,200);
  const idea={client_id:A,title:'How can you tell a roof leak from a gutter leak?',audience_question:'Where should I look for damp signs?'};
  r=await h.call('/api/editorial',{method:'POST',email:'roofer@example.co.uk',data:idea});
  assert.equal(r.res.status,201);
  const post=r.json.id;
  r=await h.call('/api/editorial',{method:'POST',email:'roofer@example.co.uk',data:idea});
  assert.equal(r.res.status,409);
  r=await h.call('/api/editorial?client='+A,{email:'detailer@example.co.uk'});
  assert.equal(r.res.status,404);
  r=await h.call('/api/admin/editorial/'+post,{method:'PATCH',email:'roofer@example.co.uk',data:{status:'published'}});
  assert.equal(r.res.status,403);
  const draft=('Look for internal water marks and carefully inspect visible gutter joints. ').repeat(12);
  r=await h.call('/api/admin/editorial/'+post,{method:'PATCH',data:{status:'client-review',
    brief:'A practical homeowner checklist comparing likely roof ingress with overflowing rainwater goods and when to call a professional.',
    draft,evidence_note:'Checked source advice and local client review for practical accuracy.',
    sources:[{title:'Official weather advice',url:'https://www.metoffice.gov.uk/',checked_at:'2026-11-09'}]}});
  assert.equal(r.res.status,200,JSON.stringify(r.json));
  r=await h.call('/api/editorial?client='+A,{email:'roofer@example.co.uk'});
  assert.equal(r.json.posts[0].draft,draft);
  r=await h.call('/api/editorial/'+post+'/decision',{method:'POST',email:'detailer@example.co.uk',data:{approve:true}});
  assert.equal(r.res.status,404);
  r=await h.call('/api/editorial/'+post+'/decision',{method:'POST',email:'roofer@example.co.uk',data:{approve:true}});
  assert.equal(r.res.status,200);
  r=await h.call('/api/admin/editorial/'+post,{method:'PATCH',data:{status:'scheduled',draft:draft+'Unapproved addition.',scheduled_at:'2028-02-01T12:00:00.000Z'}});
  assert.equal(r.res.status,400,'A changed draft cannot reuse client approval');
  r=await h.call('/api/admin/editorial/'+post,{method:'PATCH',data:{status:'scheduled',scheduled_at:'2028-02-01T12:00:00.000Z'}});
  assert.equal(r.res.status,200,JSON.stringify(r.json));
  r=await h.call('/api/editorial?client='+A,{email:'detailer@example.co.uk'});
  assert.equal(r.res.status,404);
});
test('general files stay private to tenant and admin receives only lead summaries',async()=>{
  const h=harness();
  const form=new FormData();
  form.set('client_id',A);form.set('notes','Photo for our service page');
  form.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0])],'roof.png',{type:'image/png'}));
  let r=await h.call('/api/uploads',{method:'POST',email:'roofer@example.co.uk',form});
  assert.equal(r.res.status,201,JSON.stringify(r.json));
  const uploadId=r.json.id;
  r=await h.call('/api/uploads/'+uploadId,{email:'detailer@example.co.uk'});
  assert.equal(r.res.status,404);
  r=await h.call('/api/uploads/'+uploadId,{email:'roofer@example.co.uk'});
  assert.equal(r.res.status,200);
  assert.match(r.res.headers.get('content-disposition'),/^attachment/);
  h.sqlite.prepare("INSERT INTO sites (id,client_id,domain) VALUES ('s','00000000-0000-4000-8000-00000000000a','roofer2.example.co.uk')").run();
  h.sqlite.prepare("INSERT INTO leads (id,client_id,site_id,external_id,full_name,email,phone,postcode,message,source_page) VALUES ('l','00000000-0000-4000-8000-00000000000a','s','client-12345','Private Person','private@example.co.uk','07700900123','GL7 1AA','Secret details','/contact/')").run();
  r=await h.call('/api/admin/overview');
  assert.equal(r.res.status,200);
  assert.equal(r.json.clients.find(c=>c.id===A).lead_total,1);
  assert.equal(r.json.lead_areas[0].area,'GL7');
  assert.ok(!JSON.stringify(r.json).includes('Private Person'));
  assert.ok(!JSON.stringify(r.json).includes('private@example.co.uk'));
  assert.ok(!JSON.stringify(r.json).includes('Secret details'));
  r=await h.call('/api/dashboard?client='+A);
  assert.equal(r.res.status,200);
  assert.equal(r.json.leads.length,0,'Admin does not see individual lead contact details');
  r=await h.call('/api/dashboard?client='+A,{email:'roofer@example.co.uk'});
  assert.equal(r.json.leads[0].full_name,'Private Person','Client can follow up on own submissions');
});
test('weekly research jobs enqueue once per client per week, never publish',async()=>{
  const h=harness();
  assert.equal(await enqueueWeeklyResearch(h.env),2);
  assert.equal(await enqueueWeeklyResearch(h.env),0);
  const jobs=h.sqlite.prepare('SELECT * FROM research_jobs').all();
  assert.equal(jobs.length,2);
  assert.ok(jobs.every(j=>j.status==='queued'));
  const r=await h.call('/api/admin/research/'+jobs[0].id,{method:'PATCH',data:{status:'complete',research_note:'Source checked: https://www.metoffice.gov.uk/ and first-party repair questions.'}});
  assert.equal(r.res.status,200,JSON.stringify(r.json));
});
