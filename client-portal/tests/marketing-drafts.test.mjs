import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {marketingDraft,draftPayload} from '../src/marketing-drafts.js';
const origin='https://portal.example.test',url=origin+'/marketing-studio/draft';
const owner={admin:true,email:'owner@example.test'};
const settings={CONTENT360_OWNER_EMAIL:owner.email,CONTENT360_API_TOKEN:'test-secret',CONTENT360_WORKSPACE_ID:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',CONTENT360_DRAFT_ACCOUNT_ID:'123'};
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../migrations/0011_marketing_studio_drafts.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){return {bind(...args){return {first:async()=>db.prepare(sql).get(...args),run:async()=>db.prepare(sql).run(...args)}}}}};
 return {db,env:{...settings,DB}};
}
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const form=(content='Original copy',extra={},from=origin)=>new Request(url,{method:'POST',headers:{origin:from,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({content,confirm:'draft',...extra})});
const accounts=()=>json({data:[{id:123,name:'Prunus.media',provider:'facebook_page',authorized:true}]});
test('form owner gate and exact origin; no provider calls for bad requests',async()=>{
 const {env}=setup();let calls=0;const f=async()=>{calls++;return accounts()};
 assert.equal((await marketingDraft(form(),env,null,f)).status,401);
 assert.equal((await marketingDraft(form(),env,{...owner,admin:false},f)).status,403);
 assert.equal((await marketingDraft(form(),env,{...owner,email:'staff@example.test'},f)).status,403);
 assert.equal((await marketingDraft(form('text',{},'https://other.example'),env,owner,f)).status,403);
 assert.equal((await marketingDraft(form('text',{status:'published'}),env,owner,f)).status,400);
 assert.equal((await marketingDraft(form('text',{confirm:'no'}),env,owner,f)).status,400);
 assert.equal(calls,0);
 const view=await marketingDraft(new Request(url),env,owner,f);
 assert.equal(view.status,200);assert.match(view.headers.get('content-security-policy'),/form-action 'self'/);
 assert.equal(view.headers.get('referrer-policy'),'same-origin');
});
test('target must match configured Prunus Facebook page',async()=>{
 const {env,db}=setup();let calls=0;
 const f=async()=>{calls++;return json({data:[{id:123,name:'Other client',provider:'facebook_page',authorized:true}]})};
 assert.equal((await marketingDraft(form(),env,owner,f)).status,409);
 assert.equal(calls,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM marketing_draft_attempts').get().n,0);
});
test('one verified draft, duplicate prevented, no schedule or publish payload',async()=>{
 const {env,db}=setup();let writes=0;
 const f=async(u,o)=>{
  assert.equal(o.redirect,'manual');assert.equal(o.headers.Authorization,'Bearer test-secret');
  if(o.method==='GET')return accounts();
  writes++;assert.match(u,/\/posts$/);const p=JSON.parse(o.body);
  assert.equal(p.status,'draft');assert.deepEqual(p.accounts,['123']);assert.equal(p.versions[0].account_id,123);
  assert.equal(p.scheduled_at,undefined);assert.equal(p.published_at,undefined);
  return json({data:{id:99,status:'draft',scheduled_at:null,published_at:null}});
 };
 assert.equal((await marketingDraft(form(),env,owner,f)).status,200);
 assert.equal((await marketingDraft(form(),env,owner,f)).status,409);
 assert.equal(writes,1);assert.equal(db.prepare('SELECT state FROM marketing_draft_attempts').get().state,'confirmed');
 assert.match(draftPayload('123','<script>').versions[0].content[0].body,/&lt;script&gt;/);
});
test('ambiguous outcome blocks retry and records uncertainty',async()=>{
 const {env,db}=setup();let writes=0;
 const f=async(u,o)=>{if(o.method==='GET')return accounts();writes++;throw Error('secret provider detail')};
 const result=await marketingDraft(form(),env,owner,f);
 assert.equal(result.status,502);assert.doesNotMatch(await result.text(),/secret provider detail/);
 assert.equal((await marketingDraft(form(),env,owner,f)).status,409);
 assert.equal(writes,1);assert.equal(db.prepare('SELECT state FROM marketing_draft_attempts').get().state,'uncertain');
});

const imageRow={id:'456',name:'Roofing <image>',type:'image',mime_type:'image/jpeg',is_video:false,thumb_url:'https://cdn.content360.io/'+settings.CONTENT360_WORKSPACE_ID+'/uploads/test-thumb.jpg'};
const mediaList=()=>json({data:[imageRow,{...imageRow,id:'457',type:'video',is_video:true},{...imageRow,id:'458',thumb_url:'https://untrusted.example/thumb.jpg'}]});
test('image picker displays supported images and only trusted thumbnail URLs',async()=>{
 const {env}=setup();
 const r=await marketingDraft(new Request(url),env,owner,async(u,o)=>{assert.equal(o.method,'GET');assert.match(u,/\/media$/);return mediaList();});
 const html=await r.text();
 assert.match(html,/name="media_id" value="456"/);assert.match(html,/Roofing &lt;image&gt;/);
 assert.match(html,/https:\/\/cdn\.content360\.io\//);assert.doesNotMatch(html,/untrusted\.example|value="457"/);
 assert.match(r.headers.get('content-security-policy'),/img-src https:\/\/cdn\.content360\.io/);
});
test('selected library image sends ID only; direct top-level response recognised and duplicate blocked',async()=>{
 const {env,db}=setup();let writes=0;
 const f=async(u,o)=>{
  if(o.method==='GET')return u.endsWith('/accounts')?accounts():mediaList();
  writes++;const p=JSON.parse(o.body);assert.deepEqual(p.versions[0].content[0].media,['456']);assert.equal(p.status,'draft');
  assert.equal(p.scheduled_at,undefined);return json({id:100,status:'draft',scheduled_at:null,published_at:null});
 };
 assert.equal((await marketingDraft(form('Image copy',{media_id:'456'}),env,owner,f)).status,200);
 assert.equal((await marketingDraft(form('Image copy',{media_id:'456'}),env,owner,f)).status,409);
 assert.equal(writes,1);assert.equal(db.prepare('SELECT state FROM marketing_draft_attempts').get().state,'confirmed');
});
test('reject unknown, video or arbitrary URL media without write',async()=>{
 const {env,db}=setup();let writes=0;
 const f=async(u,o)=>{if(o.method==='GET')return u.endsWith('/accounts')?accounts():mediaList();writes++;throw Error('unexpected write')};
 assert.equal((await marketingDraft(form('Test',{media_id:'999'}),env,owner,f)).status,409);
 assert.equal((await marketingDraft(form('Test',{media_id:'457'}),env,owner,f)).status,409);
 assert.equal((await marketingDraft(form('Test',{media_id:'https://other.example/image.jpg'}),env,owner,f)).status,400);
 assert.equal(writes,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM marketing_draft_attempts').get().n,0);
});
