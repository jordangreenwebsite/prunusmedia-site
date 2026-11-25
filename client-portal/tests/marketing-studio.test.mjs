import test from 'node:test';
import assert from 'node:assert/strict';
import {marketingOwner,readContent360,marketingStudio} from '../src/marketing-studio.js';
const env={CONTENT360_OWNER_EMAIL:'owner@example.test',CONTENT360_WORKSPACE_ID:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',CONTENT360_API_TOKEN:'test-secret'};
const owner={admin:true,email:'owner@example.test'};
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const request=(method='GET')=>new Request('https://portal.example.test/marketing-studio',{method});
test('owner guard fails closed',()=>{
  assert.equal(marketingOwner(owner,env),true);
  assert.equal(marketingOwner({...owner,admin:false},env),false);
  assert.equal(marketingOwner({admin:true,email:'staff@example.test'},env),false);
  assert.equal(marketingOwner(owner,{}),false);
});
test('no external requests for nonowner, anonymous or non-GET',async()=>{
  let calls=0;const f=async()=>{calls++;return json({data:[]});};
  assert.equal((await marketingStudio(request(),env,null,f)).status,401);
  assert.equal((await marketingStudio(request(),env,{admin:true,email:'staff@example.test'},f)).status,403);
  assert.equal((await marketingStudio(request('POST'),env,owner,f)).status,405);
  assert.equal(calls,0);
});
test('fixed read-only path and minimised response',async()=>{
  const result=await readContent360(env,'accounts',async(url,opts)=>{
    assert.equal(url,'https://app.content360.io/os/api/'+env.CONTENT360_WORKSPACE_ID+'/accounts');
    assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
    assert.equal(opts.headers.Authorization,'Bearer test-secret');
    return json({data:[{name:'Business',provider:'facebook_page',authorized:true,token:'private',id:99}],links:{next:'https://elsewhere.test'}});
  });
  assert.deepEqual(result.items,[{name:'Business',provider:'facebook_page',authorized:true}]);
  assert.equal(result.more,true);
  await assert.rejects(()=>readContent360(env,'../publish',async()=>{throw Error('never');}));
});
test('missing settings, rejected auth and malformed response fail closed',async()=>{
  assert.equal((await readContent360({},'posts',()=>{throw Error('never');})).ok,false);
  assert.deepEqual(await readContent360(env,'posts',async()=>new Response('private',{status:401})),{ok:false,message:'Content360 returned HTTP 401.'});
  assert.equal((await readContent360(env,'media',async()=>json({wrong:[]}))).ok,false);
});
test('owner HTML escapes names and never renders credentials or raw content',async()=>{
  const result=await marketingStudio(request(),env,owner,async()=>json({data:[{name:'<script>bad</script>',provider:'facebook_page',authorized:true,token:'test-secret',content:'private body'}]}));
  const body=await result.text();
  assert.equal(result.status,200);assert.match(body,/&lt;script&gt;bad/);
  assert.doesNotMatch(body,/<script>|test-secret|private body/);
  assert.match(result.headers.get('cache-control'),/no-store/);
});
