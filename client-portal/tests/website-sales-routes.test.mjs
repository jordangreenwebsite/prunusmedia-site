import test from 'node:test';import assert from 'node:assert/strict';import {websiteSalesPublic,websiteSalesAdmin} from '../src/website-sales.js';
test('public endpoint denies unapproved origin',async()=>{
 const url=new URL('https://portal.prunusmedia.com/api/website-sales/quote');
 const res=await websiteSalesPublic(new Request(url,{headers:{origin:'https://unrelated.example'}}),{},url);assert.equal(res.status,403);
});
test('live payment stays disabled without explicit switch and configuration',async()=>{
 const url=new URL('https://portal.prunusmedia.com/api/website-sales/checkout');
 const request=new Request(url,{method:'POST',headers:{origin:'https://prunusmedia.com','content-type':'application/json'},body:'{}'});
 assert.equal((await websiteSalesPublic(request,{},url)).status,503);
});
test('owner routes reject non-admin before database access',async()=>{
 const url=new URL('https://portal.prunusmedia.com/api/admin/website-sales');assert.equal((await websiteSalesAdmin(new Request(url),{},{admin:false},url)).status,403);
});
test('unregistered token cannot receive quote',async()=>{
 const url=new URL('https://portal.prunusmedia.com/api/website-sales/quote?ref=invalid');const res=await websiteSalesPublic(new Request(url,{headers:{origin:'https://prunusmedia.com'}}),{},url);assert.equal(res.status,404);
});
