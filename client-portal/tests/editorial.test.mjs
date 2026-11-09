import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { validProperty } from '../src/gsc.js';
import { safeResult } from '../src/research.js';
import worker from '../src/index.js';
import { enqueueWeeklyResearch } from '../src/editorial.js';

const base='https://portal.prunusmedia.com';
const A='00000000-0000-4000-8000-00000000000a', B='00000000-0000-4000-8000-00000000000b';
function harness() {
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['0001_initial.sql','0002_editorial.sql','0003_integrations.sql'])
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
  assert.equal(r.json.posts[0].draft,draft.trim());
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


test('monthly calendar is tenant-scoped and admin sees only dated editorial/research work',async()=>{
  const h=harness();
  const insert=h.sqlite.prepare(
    "INSERT INTO editorial_posts (id,client_id,topic_key,title,suggested_by,audience_question,status,scheduled_at) VALUES (?,?,?,?,?,?,?,?)"
  );
  insert.run('post-A',A,'roofing advice','Roofing inspection checklist','admin@example.co.uk','How should a homeowner check their roof?','scheduled','2026-11-19T09:00:00.000Z');
  insert.run('post-B',B,'winter cleaning','Winter detailing tips','admin@example.co.uk','How do I clean my car in winter?','approved','2026-11-23T10:00:00.000Z');
  insert.run('post-rejected',B,'cancelled draft','Cancelled article','admin@example.co.uk','What was cancelled?','rejected','2026-11-23T09:00:00.000Z');
  h.sqlite.prepare("INSERT INTO research_jobs (id,client_id,week_start,status) VALUES (?,?,?,'queued')")
    .run('research-A',A,'2026-11-16');
  h.sqlite.prepare("INSERT INTO research_jobs (id,client_id,week_start,status) VALUES (?,?,?,'working')")
    .run('research-B',B,'2026-11-23');
  let r=await h.call('/api/calendar?month=2026-11&client='+A,{email:'roofer@example.co.uk'});
  assert.equal(r.res.status,200,JSON.stringify(r.json));
  assert.equal(r.json.posts.length,1);
  assert.equal(r.json.posts[0].title,'Roofing inspection checklist');
  assert.equal(r.json.research.length,0,'Clients must not see internal research jobs');
  assert.ok(!JSON.stringify(r.json).includes('Winter detailing'));
  r=await h.call('/api/calendar?month=2026-11&client='+B,{email:'roofer@example.co.uk'});
  assert.equal(r.res.status,404,'Clients cannot request another company calendar');
  r=await h.call('/api/calendar?month=2026-11',{email:'roofer@example.co.uk'});
  assert.equal(r.res.status,404,'Clients may not request all-agency calendar');
  r=await h.call('/api/calendar?month=2026-11');
  assert.equal(r.res.status,200);
  assert.equal(r.json.posts.length,2,'Admin sees dated articles across connected companies');
  assert.equal(r.json.research.length,2,'Admin sees weekly research queue');
  assert.ok(!JSON.stringify(r.json).includes('Cancelled article'),'Rejected work is not upcoming');
  r=await h.call('/api/calendar?month=2026-11&client='+B);
  assert.equal(r.res.status,200);
  assert.equal(r.json.posts.length,1);
  assert.equal(r.json.research.length,1);
  assert.equal(r.json.research[0].client_id,B);
  r=await h.call('/api/calendar?month=2026-12');
  assert.equal(r.res.status,200);
  assert.equal(r.json.posts.length,0,'No fabricated calendar events');
  r=await h.call('/api/calendar?month=2026-13');
  assert.equal(r.res.status,400);
  r=await h.call('/api/calendar?month=2026-11',{email:'uninvited@example.co.uk'});
  assert.equal(r.res.status,401);
});


test('GSC properties must belong to the specific client website',()=>{
  assert.equal(validProperty('sc-domain:example.co.uk','www.example.co.uk'),true);
  assert.equal(validProperty('https://www.example.co.uk/','example.co.uk'),true);
  assert.equal(validProperty('sc-domain:another.co.uk','example.co.uk'),false);
  assert.equal(validProperty('https://other.co.uk/','example.co.uk'),false);
  assert.equal(validProperty('http://example.co.uk/','example.co.uk'),false);
});
test('research candidates never masquerade as checked evidence',()=>{
  assert.equal(safeResult({title:'Unsafe result title',url:'http://example.com/topic'}),null);
  assert.equal(safeResult({title:'Local address forbidden',url:'https://localhost/private'}),null);
  const candidate=safeResult({title:'Official HSE construction guidance',
    url:'https://www.hse.gov.uk/construction/',description:'Result preview only'});
  assert.equal(candidate.status,'candidate-not-verified');
  assert.equal(candidate.checked_at,null);
});
test('unconfigured GSC remains clear and tenant scoped',async()=>{
  const h=harness();
  let r=await h.call('/api/seo?client='+A,{email:'roofer@example.co.uk'});
  assert.equal(r.res.status,200);
  assert.equal(r.json.configured,false);
  r=await h.call('/api/seo?client='+A,{email:'detailer@example.co.uk'});
  assert.equal(r.res.status,404);
});


test('MCP is off without its own token and exposes read-only tools only',async()=>{
  const h=harness(),url=base+'/mcp';
  const token='m'.repeat(64);
  const headers={
    'content-type':'application/json','accept':'application/json, text/event-stream',
    'mcp-protocol-version':'2026-07-28','mcp-method':'tools/list',
    authorization:'Bearer '+token
  };
  const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'});
  let res=await worker.fetch(new Request(url,{method:'POST',headers,body}),h.env,{waitUntil(){}});
  assert.equal(res.status,503);
  h.env.MCP_ADMIN_TOKEN=token;
  res=await worker.fetch(new Request(url,{method:'POST',headers:{...headers,origin:'https://other.example'},body}),h.env,{waitUntil(){}});
  assert.equal(res.status,403);
  res=await worker.fetch(new Request(url,{method:'POST',headers,body}),h.env,{waitUntil(){}});
  assert.equal(res.status,200);
  const tools=(await res.json()).result.tools;
  assert.equal(tools.length,4);
  assert.ok(tools.every(t=>t.annotations.readOnlyHint===true));
  assert.ok(!tools.some(t=>/publish|write|delete/i.test(t.name)));
  const other=await worker.fetch(new Request(url,{method:'POST',headers:{...headers,authorization:'Bearer '+'n'.repeat(64)},body}),h.env,{waitUntil(){}});
  assert.equal(other.status,401);
});


test('Brave discovery creates source candidates, not verified citations or blogs',async()=>{
  const h=harness(),fetchBefore=globalThis.fetch;
  h.env.BRAVE_SEARCH_API_KEY='fixture-key';
  h.sqlite.prepare('UPDATE clients SET industry=?,service_area=? WHERE id=?')
    .run('Roofing and fascias','Cirencester',A);
  const jobId='00000000-0000-4000-8000-000000000222';
  h.sqlite.prepare("INSERT INTO research_jobs (id,client_id,week_start,status) VALUES (?,?,?,'queued')")
    .run(jobId,A,'2026-11-09');
  globalThis.fetch=async(url,options)=>{
    assert.match(String(url),/api\.search\.brave\.com\/res\/v1\/web\/search/);
    assert.equal(options.headers['x-subscription-token'],'fixture-key');
    return new Response(JSON.stringify({web:{results:[
      {title:'Official construction safety guidance',url:'https://www.hse.gov.uk/construction/',description:'Search summary only.'},
      {title:'Unsafe local result skipped',url:'https://localhost/unsafe'}
    ]}}),{status:200});
  };
  try{
    let r=await h.call('/api/admin/research/'+jobId+'/discover',{method:'POST',email:'roofer@example.co.uk',data:{}});
    assert.equal(r.res.status,403);
    r=await h.call('/api/admin/research/'+jobId+'/discover',{method:'POST',data:{}});
    assert.equal(r.res.status,200,JSON.stringify(r.json));
    assert.equal(r.json.sources.length,1);
    assert.equal(r.json.sources[0].status,'candidate-not-verified');
    assert.equal(r.json.sources[0].checked_at,null);
    const record=h.sqlite.prepare('SELECT status,candidate_sources_json FROM research_jobs WHERE id=?').get(jobId);
    assert.equal(record.status,'working');
    assert.equal(JSON.parse(record.candidate_sources_json).length,1);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) n FROM editorial_posts').get().n,0);
  }finally{globalThis.fetch=fetchBefore;}
});


test('Google Search Console data comes from an authorised API call, not made-up metrics',async()=>{
  const h=harness(),original=globalThis.fetch;
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  h.env.GSC_SERVICE_ACCOUNT_JSON=JSON.stringify({
    type:'service_account',client_email:'site-reports@prunus-tests.iam.gserviceaccount.com',
    private_key_id:'test',private_key:privateKey.export({type:'pkcs8',format:'pem'})
  });
  h.sqlite.prepare('UPDATE clients SET gsc_property=? WHERE id=?').run('sc-domain:roofer.example.co.uk',A);
  let analytics=0;
  globalThis.fetch=async(url,options)=>{
    if(String(url)==='https://oauth2.googleapis.com/token')
      return new Response(JSON.stringify({access_token:'fixture-token'}),{status:200});
    assert.match(String(url),/www\.googleapis\.com\/webmasters\/v3\/sites\/sc-domain%3Aroofer/);
    assert.equal(options.headers.authorization,'Bearer fixture-token');
    analytics++;
    if(JSON.parse(options.body).dimensions?.[0]==='query')
      return new Response(JSON.stringify({rows:[{keys:['roof cleaning'],clicks:7,impressions:200,ctr:.035,position:9.1}]}),{status:200});
    return new Response(JSON.stringify({rows:[{clicks:30,impressions:500,ctr:.06,position:12.3}]}),{status:200});
  };
  try{
    let r=await h.call('/api/seo?client='+A,{email:'roofer@example.co.uk'});
    assert.equal(r.res.status,200,JSON.stringify(r.json));
    assert.equal(r.json.current.clicks,30);
    assert.equal(r.json.queries[0].query,'roof cleaning');
    assert.equal(analytics,3);
    r=await h.call('/api/seo?client='+A,{email:'detailer@example.co.uk'});
    assert.equal(r.res.status,404);
  }finally{globalThis.fetch=original;}
});


test('GitHub reviewer PRs can target the live Prunus site only and remain drafts',async()=>{
  const h=harness(),original=globalThis.fetch;
  const postId='00000000-0000-4000-8000-000000000333';
  h.sqlite.prepare(
    "INSERT INTO editorial_posts (id,client_id,topic_key,title,suggested_by,audience_question,brief,draft,evidence_note,status) VALUES (?,?,?,?,?,?,?,?,?,'approved')"
  ).run(postId,A,'prunus article','A practical website speed guide','admin@prunusmedia.com',
    'How can a business improve its website speed?',
    'A researched explanation of pages, loading and accessibility using real client data and measured SEO checks.',
    ('Check real site performance and prioritise accessible mobile pages before changing code.\n').repeat(10),
    'First-party interview and original evidence from client performance checks.');
  let r=await h.call('/api/admin/editorial/'+postId+'/create-pr',{method:'POST',data:{}});
  assert.equal(r.res.status,503,'Without separate GitHub secret no repository writes occur');
  h.env.GITHUB_PRUNUS_CONTENT_TOKEN='fixture-for-test';
  r=await h.call('/api/admin/editorial/'+postId+'/create-pr',{method:'POST',data:{}});
  assert.equal(r.res.status,403,'Client roofing sites are never authorised in the Prunus repository writer');
  h.sqlite.prepare('UPDATE clients SET domain=?,brand=? WHERE id=?').run('prunusmedia.com','prunus',A);
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),method:options.method,body:options.body?JSON.parse(options.body):null});
    if(String(url).endsWith('/git/ref/heads/main'))
      return new Response(JSON.stringify({object:{sha:'a'.repeat(40)}}),{status:200});
    if(String(url).endsWith('/pulls'))
      return new Response(JSON.stringify({number:15,html_url:'https://github.com/jordangreenwebsite/prunusmedia-site/pull/15'}),{status:201});
    return new Response(JSON.stringify({ok:true}),{status:201});
  };
  try{
    r=await h.call('/api/admin/editorial/'+postId+'/create-pr',{method:'POST',data:{}});
    assert.equal(r.res.status,201,JSON.stringify(r.json));
    assert.equal(calls.length,4);
    assert.ok(calls.every(x=>x.url.startsWith('https://api.github.com/repos/jordangreenwebsite/prunusmedia-site/')));
    assert.equal(calls.at(-1).body.draft,true);
    const content=Buffer.from(calls.find(x=>x.method==='PUT').body.content,'base64').toString();
    assert.match(content,/draft: true/);
    assert.equal(h.sqlite.prepare('SELECT github_pr_number FROM editorial_posts WHERE id=?').get(postId).github_pr_number,15);
  }finally{globalThis.fetch=original;}
});
