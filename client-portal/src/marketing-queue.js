// Private Business OS queue: prepared copy is data, never executable instructions.
import {marketingOwner,marketingHtml,marketingEscape as e} from './marketing-studio.js';
const SOURCE='https://api.github.com/repos/jordangreenwebsite/business-os/contents/growth/marketing-queue.json?ref=main';
const idPattern=/^[a-z0-9][a-z0-9-]{1,119}$/;
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const bounded=(v,n)=>typeof v==='string'&&v.trim()&&v.length<=n;
export function validateMarketingQueue(q){
 if(q?.version!==1||!iso(q.week_of)||!iso(q.prepared_on)||!Array.isArray(q.items)||q.items.length>20)throw Error('Invalid weekly queue');
 const start=new Date(q.week_of+'T00:00:00Z');
 if(start.getUTCDay()!==1)throw Error('Invalid week');
 const end=new Date(start.getTime()+6*86400000).toISOString().slice(0,10),seen=new Set();
 const items=q.items.map(x=>{
  if(!x||typeof x.id!=='string'||!idPattern.test(x.id)||seen.has(x.id)||!['prunus-media','prunus-certificates'].includes(x.brand)||!iso(x.planned_date)||x.planned_date<q.week_of||x.planned_date>end||x.status!=='needs-review'||!bounded(x.title,200)||!bounded(x.copy,4000)||!bounded(x.evidence,2000)||!bounded(x.creative,1000)||!bounded(x.source_key,200))throw Error('Invalid queue item');
  seen.add(x.id);
  return {id:x.id,brand:x.brand,planned_date:x.planned_date,title:x.title,copy:x.copy,evidence:x.evidence,creative:x.creative,source_key:x.source_key};
 });
 return {week_of:q.week_of,prepared_on:q.prepared_on,items};
}
export async function loadMarketingQueue(env,fetcher=fetch){
 const token=String(env.BLOG_SCHEDULE_READ_TOKEN||'').trim();
 if(!token)return null;
 try{
  const r=await fetcher(SOURCE,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github.raw+json','User-Agent':'Prunus-Portal'},redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!r.ok)return null;
  const text=await r.text();if(text.length>200000)return null;
  return validateMarketingQueue(JSON.parse(text));
 }catch{return null;}
}
export async function marketingQueue(request,env,user,fetcher=fetch){
 if(request.method!=='GET')return marketingHtml('<h1>Method not allowed</h1>',405);
 if(!user)return marketingHtml('<h1>Sign in required</h1>',401);
 if(!marketingOwner(user,env))return marketingHtml('<h1>Access not available</h1>',403);
 const back='<p><a href="/marketing-studio">Back to Marketing Studio</a></p><h1>Weekly marketing review</h1>';
 const q=await loadMarketingQueue(env,fetcher);
 if(!q)return marketingHtml(back+'<p>Prepared content unavailable. Check the private Business OS queue connection. Nothing has been sent.</p>',503);
 let states;
 try{states=await Promise.all(q.items.map(x=>env.DB.prepare('SELECT state FROM marketing_draft_attempts WHERE queue_item_id=?').bind(x.id).first()));}
 catch{return marketingHtml(back+'<p>Review history unavailable. No draft actions are offered.</p>',503);}
 const cards=q.items.map((x,i)=>{
  const state=states[i]?.state;
  const brand=x.brand==='prunus-media'?'Prunus Media':'Prunus Certificates';
  const action=state==='confirmed'?'<p><strong>Draft created in Content360</strong> (not published).</p>':state?'<p><strong>Attempt requires reconciliation.</strong> Check Content360; do not retry.</p>':x.brand==='prunus-media'?'<p><a href="/marketing-studio/draft?item='+encodeURIComponent(x.id)+'">Review and create draft</a></p>':'<p><strong>Review only:</strong> no approved Certificates publishing account.</p>';
  return '<section><p class="meta">'+e(brand)+' · Proposed '+e(x.planned_date)+'</p><h2>'+e(x.title)+'</h2><p>'+e(x.copy).replace(/\n/g,'<br>')+'</p><details><summary>Evidence and creative brief</summary><p>'+e(x.evidence)+'</p><p>'+e(x.creative)+'</p></details>'+action+'</section>';
 }).join('');
 return marketingHtml(back+'<p>Week commencing '+e(q.week_of)+' · Prepared '+e(q.prepared_on)+'. Dates are suggestions, not scheduled posts.</p>'+cards+'<p class="meta">Content360 is the delivery engine. Review evidence, copy and permission before approval.</p>');
}
