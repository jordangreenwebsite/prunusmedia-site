import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { normalizeWebsiteDomain } from '../src/website-domain.js';

const base = 'https://portal.prunusmedia.com';
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  for(const file of ['0001_initial.sql','0002_editorial.sql','0003_integrations.sql','0004_workspaces.sql','0005_lead_customers.sql'])
    sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const db = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let args = [];
      const query = {
        bind(...values) { args = values; return query; },
        async first() { return stmt.get(...args) || null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { return stmt.run(...args); }
      };
      return query;
    },
    async batch(queries) {
      sqlite.exec('BEGIN');
      try {
        const results=[];
        for (const q of queries) results.push(await q.run());
        sqlite.exec('COMMIT');
        return results;
      } catch(err) { sqlite.exec('ROLLBACK'); throw err; }
    }
  };
  const files = new Map();
  const uploads = {
    async put(key,buffer) { files.set(key,buffer); },
    async get(key) { const v=files.get(key); return v ? {body:new Blob([v])} : null; },
    async delete(key) { files.delete(key); }
  };
  return { DB:db,UPLOADS:uploads,__files:files,ASSETS:{fetch:async()=>new Response('portal')},
    ADMIN_EMAILS:'admin@prunusmedia.com',ADMIN_NOTIFY_EMAIL:'admin@prunusmedia.com',
    AUTH_PEPPER:'test pepper must be securely generated in production',
    RESEND_API_KEY:'fake',OTP_FROM_EMAIL:'portal@contact.prunusmedia.com' };
}
function harness(env) {
  const outbound = [],pending = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url,'https://api.resend.com/emails');
    outbound.push(JSON.parse(options.body));
    return new Response(JSON.stringify({id:'message-id'}),{status:200});
  };
  async function call(path,{method='GET',data,body,cookie='',origin=base,headers={}}={}) {
    const h = new Headers(headers);
    if(origin!==null)h.set('origin',origin);
    if(cookie)h.set('cookie',cookie);
    if(data!==undefined){h.set('content-type','application/json');body=JSON.stringify(data);}
    const req=new Request(base+path,{method,headers:h,body});
    const res=await worker.fetch(req,env,{waitUntil(p){pending.push(p);}});
    let json=null;
    if((res.headers.get('content-type')||'').includes('application/json')) json=await res.json();
    return {res,json};
  }
  async function login(email) {
    const before=outbound.length;
    const sent=await call('/api/auth/request-code',{method:'POST',data:{email}});
    assert.equal(sent.res.status,200);
    assert.equal(outbound.length,before+1,'Known account should receive OTP email');
    const last=outbound.at(-1);
    assert.equal(last.to[0],email);
    const code=last.text.match(/\b(\d{6})\b/)[1];
    const ok=await call('/api/auth/verify',{method:'POST',data:{email,code}});
    assert.equal(ok.res.status,200);
    const cookie=ok.res.headers.get('set-cookie').split(';')[0];
    assert.match(cookie,/^__Host-prunus_session=/);
    return {cookie,code};
  }
  return {call,login,outbound,pending,files:env.__files};
}
test('tenant isolation, invited email codes, private PDFs and trusted lead intake',async()=>{
  const env=environment(),h=harness(env);
  const unknown=await h.call('/api/auth/request-code',{method:'POST',data:{email:'stranger@example.com'}});
  assert.equal(unknown.res.status,200);
  assert.equal(h.outbound.length,0);
  const admin=await h.login('admin@prunusmedia.com');
  const reused=await h.call('/api/auth/verify',{method:'POST',data:{email:'admin@prunusmedia.com',code:admin.code}});
  assert.equal(reused.res.status,401,'OTP must be consumed once');
  const first=await h.call('/api/admin/clients',{method:'POST',cookie:admin.cookie,
    data:{name:'Residential Roofing & Fascias',slug:'residential-roofing-fascias',domain:'www.residentialroofingandfascias.co.uk',owner_email:'roofer@example.com'}});
  assert.equal(first.res.status,201);
  assert.match(first.json.ingest_token,/^[0-9a-f]{64}$/);
  const second=await h.call('/api/admin/clients',{method:'POST',cookie:admin.cookie,
    data:{name:'Example Flower Studio',slug:'example-flower-studio',domain:'flowers.example.com',owner_email:'flowers@example.com'}});
  assert.equal(second.res.status,201);
  const a=first.json.client_id,b=second.json.client_id;
  const roofer=await h.login('roofer@example.com');
  const florist=await h.login('flowers@example.com');
  let r=await h.call('/api/dashboard?client='+a,{cookie:roofer.cookie});
  assert.equal(r.res.status,200);
  assert.equal(r.json.client.name,'Residential Roofing & Fascias');
  r=await h.call('/api/dashboard?client='+b,{cookie:roofer.cookie});
  assert.equal(r.res.status,404,'Client cannot query another tenant');
  r=await h.call('/api/requests/change',{method:'POST',cookie:roofer.cookie,
    data:{client_id:b,title:'Unapproved edit',body:'Try editing another business website.'}});
  assert.equal(r.res.status,404,'Client cannot write to another tenant');
  r=await h.call('/api/admin/clients',{method:'POST',cookie:roofer.cookie,
    data:{name:'Bad',slug:'bad',domain:'bad.example.com',owner_email:'bad@example.com'}});
  assert.equal(r.res.status,403,'Client is not agency admin');
  r=await h.call('/api/requests/change',{method:'POST',cookie:roofer.cookie,origin:'https://evil.example.com',
    data:{client_id:a,title:'Cross-origin edit',body:'Must not be accepted by the Worker.'}});
  assert.equal(r.res.status,403,'CSRF write must be blocked');
  const change=await h.call('/api/requests/change',{method:'POST',cookie:roofer.cookie,
    data:{client_id:a,title:'New opening hours',page_url:'/contact/',body:'Please show our revised opening times on the contact page.'}});
  assert.equal(change.res.status,201);
  const forged=await h.call('/api/ingest/lead',{method:'POST',origin:null,
    headers:{authorization:'Bearer '+second.json.ingest_token},
    data:{external_id:'roofing-form-123',name:'Person One',phone:'07700900123',postcode:'GL7 1AA',service:'Roofing',message:'Repair',source_page:'/',client_id:a}});
  assert.equal(forged.res.status,201);
  const bview=await h.call('/api/dashboard?client='+b,{cookie:florist.cookie});
  assert.equal(bview.json.leads.length,1,'Token B must always save to tenant B');
  const aview=await h.call('/api/dashboard?client='+a,{cookie:roofer.cookie});
  assert.equal(aview.json.leads.length,0,'Tenant A cannot read tenant B leads');
  assert.equal(aview.json.requests.length,1);
  // A client may move only their own leads through the pipeline.
  const forbiddenLead=await h.call('/api/leads/'+bview.json.leads[0].id+'/status',{method:'PATCH',cookie:roofer.cookie,data:{status:'contacted'}});
  assert.equal(forbiddenLead.res.status,404,'Cannot change another tenant lead status');
  const ownLead=await h.call('/api/leads/'+bview.json.leads[0].id+'/status',{method:'PATCH',cookie:florist.cookie,data:{status:'contacted'}});
  assert.equal(ownLead.res.status,200);
  assert.equal(ownLead.json.status,'contacted');
  const invalidLead=await h.call('/api/leads/'+bview.json.leads[0].id+'/status',{method:'PATCH',cookie:florist.cookie,data:{status:'deleted'}});
  assert.equal(invalidLead.res.status,400,'Only documented pipeline statuses are allowed');
  const flowerLead=bview.json.leads[0].id;
  const noCrossCustomer=await h.call('/api/leads/'+flowerLead+'/customer',{method:'POST',cookie:roofer.cookie});
  assert.equal(noCrossCustomer.res.status,404,'One client cannot turn another client lead into their customer');
  const converted=await h.call('/api/leads/'+flowerLead+'/customer',{method:'POST',cookie:florist.cookie});
  assert.equal(converted.res.status,200);
  const repeated=await h.call('/api/leads/'+flowerLead+'/customer',{method:'POST',cookie:florist.cookie});
  assert.equal(repeated.res.status,200,'Adding same customer twice is idempotent');
  const customerView=await h.call('/api/dashboard?client='+b,{cookie:florist.cookie});
  assert.equal(customerView.json.customers.length,1);
  assert.equal(customerView.json.leads[0].is_customer,1);
  const otherCustomerView=await h.call('/api/dashboard?client='+a,{cookie:roofer.cookie});
  assert.equal(otherCustomerView.json.customers.length,0,'Other business has no access to customer record');
  const reverted=await h.call('/api/leads/'+flowerLead+'/customer',{method:'DELETE',cookie:florist.cookie});
  assert.equal(reverted.res.status,200);
  const afterRemove=await h.call('/api/dashboard?client='+b,{cookie:florist.cookie});
  assert.equal(afterRemove.json.customers.length,0);
  assert.equal(afterRemove.json.leads.length,1,'Original lead remains when removed from customers');
  const updatedB=await h.call('/api/dashboard?client='+b,{cookie:florist.cookie});
  assert.equal(updatedB.json.leads[0].status,'contacted');
  const crossOrigin=await h.call('/api/leads/'+bview.json.leads[0].id+'/status',{method:'PATCH',cookie:florist.cookie,origin:'https://external.invalid',data:{status:'dealt-with'}});
  assert.equal(crossOrigin.res.status,403,'Pipeline status writes require a same-origin request');

  const validLead=await h.call('/api/ingest/lead',{method:'POST',origin:null,
    headers:{authorization:'Bearer '+first.json.ingest_token},
    data:{external_id:'roofing-form-124',name:'Roofer Lead',phone:'07700900123',postcode:'GL7 1AA',source_page:'/contact/',message:'Please call me'}});
  assert.equal(validLead.res.status,201);
  const duplicated=await h.call('/api/ingest/lead',{method:'POST',origin:null,
    headers:{authorization:'Bearer '+first.json.ingest_token},
    data:{external_id:'roofing-form-124',name:'Roofer Lead',phone:'07700900123',source_page:'/contact/'}});
  assert.equal(duplicated.res.status,201);
  r=await h.call('/api/dashboard?client='+a,{cookie:roofer.cookie});
  assert.equal(r.json.leads.length,1,'Idempotent integration should not duplicate leads');
  const badFile=new FormData();badFile.set('client_id',a);badFile.set('title','Bad document');
  badFile.set('file',new File(['not a real pdf'],'blog.pdf',{type:'application/pdf'}));
  r=await h.call('/api/requests/blog',{method:'POST',cookie:roofer.cookie,body:badFile});
  assert.equal(r.res.status,415);
  const form=new FormData();form.set('client_id',a);form.set('title','A complete roof blog');
  form.set('body','Original article supplied by the customer for review.');
  form.set('file',new File(['%PDF-1.4\nThis is test data'],'full-draft.pdf',{type:'application/pdf'}));
  const article=await h.call('/api/requests/blog',{method:'POST',cookie:roofer.cookie,body:form});
  assert.equal(article.res.status,201);
  assert.equal(h.files.size,1,'PDF is stored privately');
  const wrong=await h.call('/api/files/'+article.json.id,{cookie:florist.cookie});
  assert.equal(wrong.res.status,404,'PDF cannot be downloaded across tenants');
  const correct=await h.call('/api/files/'+article.json.id,{cookie:roofer.cookie});
  assert.equal(correct.res.status,200);
  assert.match(correct.res.headers.get('content-disposition'),/^attachment/);
  assert.match(await correct.res.text(),/^%PDF-/);
  const status=await h.call('/api/admin/requests/'+article.json.id,{method:'PATCH',cookie:admin.cookie,
    data:{status:'working',staff_note:'Reviewing the article now.'}});
  assert.equal(status.res.status,200);
  const requestList=await h.call('/api/dashboard?client='+a,{cookie:roofer.cookie});
  assert.equal(requestList.json.requests.find(x=>x.id===article.json.id).status,'working');
  assert.ok(requestList.json.requests.find(x=>x.id===article.json.id).staff_note);
  const signedOut=await h.call('/api/auth/logout',{method:'POST',cookie:roofer.cookie,data:{}});
  assert.equal(signedOut.res.status,200);
  r=await h.call('/api/dashboard?client='+a,{cookie:roofer.cookie});
  assert.equal(r.res.status,401);
  await Promise.all(h.pending);
});


test('website domain validation accepts a pasted homepage URL but rejects unsafe addresses',()=>{
  for(const [entered,expected] of [
    ['https://www.pppowerdetailing.com','www.pppowerdetailing.com'],
    ['HTTPS://WWW.PPPOWERDETAILING.COM/','www.pppowerdetailing.com'],
    ['http://example.co.uk/','example.co.uk'],
    ['www.example.co.uk','www.example.co.uk'],
    ['example.co.uk/','example.co.uk'],
    ['  https://example.co.uk  ','example.co.uk']
  ]){
    const result=normalizeWebsiteDomain(entered);
    assert.equal(result.error,null,'Should accept '+entered);
    assert.equal(result.domain,expected);
  }
  for(const entered of [
    'https://example.co.uk/blog',
    'https://example.co.uk/?token=abc',
    'https://example.co.uk/#section',
    'https://user:password@example.co.uk',
    'https://example.co.uk:8080/',
    'https://localhost/',
    'https://127.0.0.1/',
    'https://site..co.uk/',
    'javascript:alert(1)',
    '//example.co.uk/',
    'https://intranet/'
  ]){
    assert.ok(normalizeWebsiteDomain(entered).error,'Should reject '+entered);
  }
});
test('admin can create PP Power Detailing from a complete URL without touching another tenant',async()=>{
  const env=environment(),h=harness(env);
  const admin=await h.login('admin@prunusmedia.com');
  const created=await h.call('/api/admin/clients',{method:'POST',cookie:admin.cookie,data:{
    name:'PP Power Detailing',slug:'pp-power-detailing',domain:'https://www.pppowerdetailing.com',
    owner_email:'info@pppowerdetailing.com'
  }});
  assert.equal(created.res.status,201,JSON.stringify(created.json));
  const dashboard=await h.call('/api/dashboard?client='+created.json.client_id,{cookie:admin.cookie});
  assert.equal(dashboard.res.status,200);
  assert.equal(dashboard.json.client.domain,'www.pppowerdetailing.com');
  const duplicate=await h.call('/api/admin/clients',{method:'POST',cookie:admin.cookie,data:{
    name:'Different client',slug:'new-unique-client',domain:'https://www.pppowerdetailing.com/',
    owner_email:'owner@example.co.uk'
  }});
  assert.equal(duplicate.res.status,409);
  assert.match(duplicate.json.error,/already connected/i);
  const invalid=await h.call('/api/admin/clients',{method:'POST',cookie:admin.cookie,data:{
    name:'Wrong URL',slug:'wrong-url',domain:'https://www.pppowerdetailing.com/private',
    owner_email:'owner@example.co.uk'
  }});
  assert.equal(invalid.res.status,400);
  assert.match(invalid.json.error,/homepage address only/i);
  await Promise.all(h.pending);
});
