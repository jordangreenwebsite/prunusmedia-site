import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMirror,mirrorPosts,mirrorInfo,domainKey,loadBlogMirror} from '../src/blog-schedule-mirror.js';
const data={version:1,as_of:'2026-11-19',businesses:[{domain:'one.example.com',articles:[{id:'one',title:'A planned guide',date:'2026-11-19',status:'awaiting',url:'https://one.example.com/blog/a/'},{id:'two',title:'A published guide',date:'2026-11-16',status:'published',url:'https://one.example.com/blog/b/'}]},{domain:'other.example.com',articles:[{id:'three',title:'Private other tenant',date:'2027-01-01',status:'planned'}]}]};
test('mirror stays scoped to registered domain, deduplicates native posts and does not mislabel unverified releases',()=>{
 const mirror=validateMirror(data);
 const posts=mirrorPosts(mirror,{id:'client',domain:'www.one.example.com',name:'One'},[]);
 assert.equal(posts.length,2);assert.equal(posts[0].status,'scheduled');assert.equal(posts[0].mirror_status,'awaiting');assert.equal(posts[0].published_url,'');assert.equal(posts[1].status,'published');assert.equal(posts[0].read_only,true);assert.equal(posts[0].client_id,'client');
 assert.equal(mirrorPosts(mirror,{domain:'one.example.com'},[{title:'A planned guide'}]).length,1);
 assert.deepEqual(mirrorPosts(mirror,{domain:'unknown.example.com'}),[]);
 assert.equal(mirrorInfo(mirror,'other.example.com').registered,true);
 assert.equal(domainKey('www.one.example.com'),'one.example.com');
});
test('rejects cross-tenant links and published items with no link',()=>{
 const bad=structuredClone(data);bad.businesses[0].articles[0].url='https://other.example.com/blog/a/';assert.throws(()=>validateMirror(bad));
 const noLink=structuredClone(data);delete noLink.businesses[0].articles[1].url;assert.throws(()=>validateMirror(noLink));
});
test('no token does not attempt remote access',async()=>assert.equal((await loadBlogMirror({})).status,'not-configured'));
