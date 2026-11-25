import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {marketingSchedule,scheduleTime,checkedPost} from '../src/marketing-schedule.js';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',origin='https://portal.example.test',url=origin+'/marketing-studio/schedule',owner={admin:true,email:'owner@example.test'},now=Date.parse('2026-11-25T00:00Z'),expected='2026-12-01 09:00:00';
const version={account_id:0,is_original:true,content:[{body:'<div>Useful advice</div>',media:[],url:'',opened:true}],options:{facebook_page:{type:'post',share_to_story:false}}};
const fresh=()=>({id:99,uuid:id,status:'draft',scheduled_at:null,published_at:null,accounts:[{id:123}],tags:[],versions:[structuredClone(version)]});
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const p of ['0011_marketing_studio_drafts.sql','0012_marketing_queue_review.sql','0013_marketing_schedule.sql'])db.exec(readFileSync(new URL('../migrations/'+p,import.meta.url),'utf8'));
 db.prepare("INSERT INTO marketing_draft_attempts(digest,actor_email,state,provider_post_id,provider_post_uuid) VALUES(?,?,'confirmed',?,?)").run('test',owner.email,'99',id);
 const DB={prepare(sql){const wrap=(args)=>({first:async()=>db.prepare(sql).get(...args),run:async()=>db.prepare(sql).run(...args),all:async()=>({results:db.prepare(sql).all(...args)})});return {...wrap([]),bind(...args){return wrap(args)}}}};
 return {db,env:{DB,CONTENT360_OWNER_EMAIL:owner.email,CONTENT360_API_TOKEN:'test-secret',CONTENT360_WORKSPACE_ID:id,CONTENT360_DRAFT_ACCOUNT_ID:'123'}};
}
const json=d=>new Response(JSON.stringify(d),{headers:{'content-type':'application/json'}});
function mock({fail=false,alter=false}={}){
 let p=fresh();const writes=[];
 const fetcher=async(u,o)=>{
 assert.equal(o.redirect,'manual');assert.equal(o.headers.Authorization,'Bearer test-secret');
 if(u.endsWith('/accounts'))return json({data:[{id:123,name:'Prunus.media',provider:'facebook_page',authorized:true}]});
 if(o.method==='GET')return json(p);
 writes.push([o.method,u,JSON.parse(o.body)]);
 if(o.method==='PUT'){p={...p,scheduled_at:expected};if(alter)p.versions[0].content[0].body='changed';return json({success:true});}
 if(fail)return new Response('{}',{status:422,headers:{'content-type':'application/json'}});
 p={...p,status:'scheduled'};return json({success:true,scheduled_at:expected,needs_approval:false});
 };
 return {fetcher,writes,mutate:()=>{p.versions[0].content[0].body='Changed after review';}};
}
const get=new Request(url+'?post='+id);
const submit=(snapshot,extra={},from=origin)=>new Request(url,{method:'POST',headers:{origin:from,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({post:id,snapshot,date:'2026-12-01',time:'09:00',confirm:'schedule',...extra})});
async function review(env,f){const r=await marketingSchedule(get,env,owner,f,now);assert.equal(r.status,200);const html=await r.text();assert.match(html,/Useful advice/);assert.doesNotMatch(html,/<div>Useful advice<\/div>|test-secret/);return html.match(/name="snapshot" value="([a-f0-9]{64})"/)[1];}
test('time bounded to real future GMT dates',()=>{assert.equal(scheduleTime('2026-12-01','09:00',now),expected);assert.equal(scheduleTime('2026-11-25','00:05',now),null);assert.equal(scheduleTime('2026-12-31','09:00',now),null);assert.equal(scheduleTime('2026-06-01','09:00',Date.parse('2026-05-25')),null);assert.equal(scheduleTime('2026-11-31','09:00',now),null);});
test('post identity, account, tags and media must match pilot',()=>{const row={provider_post_uuid:id,provider_post_id:'99'},c={id:'123'};assert.equal(checkedPost(fresh(),row,c,'draft',null).accounts[0],123);for(const x of [{...fresh(),accounts:[123,456]},{...fresh(),tags:[1]},{...fresh(),status:'scheduled'},{...fresh(),scheduled_at:expected},{...fresh(),versions:[{...version,content:[{...version.content[0],media:['123']}]}]}])assert.throws(()=>checkedPost(x,row,c,'draft',null));});
test('two-stage approved write and verification; duplicate blocked',async()=>{const {env,db}=setup(),m=mock();const snapshot=await review(env,m.fetcher);const r=await marketingSchedule(submit(snapshot),env,owner,m.fetcher,now);assert.equal(r.status,200);assert.match(await r.text(),/Actual Facebook delivery has not yet been verified/);assert.equal(m.writes.length,2);assert.deepEqual(m.writes[0][2],{date:'2026-12-01',time:'09:00',timezone:'Europe/London',versions:[version],accounts:[123],tags:[]});assert.deepEqual(m.writes[1][2],{postNow:false});assert.equal(db.prepare('SELECT state FROM marketing_schedule_attempts').get().state,'confirmed');assert.equal((await marketingSchedule(submit(snapshot),env,owner,m.fetcher,now)).status,409);assert.equal(m.writes.length,2);});
test('no write if not owner, cross-origin, stale review or invalid date',async()=>{const {env}=setup(),m=mock();const snapshot=await review(env,m.fetcher);assert.equal((await marketingSchedule(submit(snapshot),env,null,m.fetcher,now)).status,401);assert.equal((await marketingSchedule(submit(snapshot),env,{...owner,email:'other@example.test'},m.fetcher,now)).status,403);assert.equal((await marketingSchedule(submit(snapshot,{},'https://elsewhere.test'),env,owner,m.fetcher,now)).status,403);assert.equal((await marketingSchedule(submit(snapshot,{date:'2026-11-24'}),env,owner,m.fetcher,now)).status,400);m.mutate();assert.equal((await marketingSchedule(submit(snapshot),env,owner,m.fetcher,now)).status,409);assert.equal(m.writes.length,0);});
test('provider failure or changed content stops activation or retry',async()=>{for(const opts of [{fail:true},{alter:true}]){const {env,db}=setup(),m=mock(opts);const snapshot=await review(env,m.fetcher);assert.equal((await marketingSchedule(submit(snapshot),env,owner,m.fetcher,now)).status,502);assert.equal(m.writes.length,opts.alter?1:2);assert.equal(db.prepare('SELECT state FROM marketing_schedule_attempts').get().state,'uncertain');assert.equal((await marketingSchedule(submit(snapshot),env,owner,m.fetcher,now)).status,409);assert.equal(m.writes.length,opts.alter?1:2);}});
