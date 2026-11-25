// Owner-approved, text-only Facebook scheduling pilot. Never retries or publishes immediately.
import {marketingOwner,marketingHtml,marketingEscape as e} from './marketing-studio.js';
import {config,provider,validTarget} from './marketing-drafts.js';
const path='/marketing-studio/schedule',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back='<p><a href="/marketing-studio">Back to Marketing Studio</a> · <a href="'+path+'">Scheduling pilot</a></p>';
const page=(title,msg,status=200)=>marketingHtml(back+'<h1>'+e(title)+'</h1><p>'+e(msg)+'</p>',status);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
async function json(c,endpoint,method,f,body){
 const r=await provider(c,endpoint,method,f,body);
 if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Provider response rejected');
 const d=await r.json();return d?.data??d;
}
// A narrow canonical shape; unknown account/tag/version formats deliberately fail closed.
export function checkedPost(d,row,c,expectedStatus,expectedTime){
 if(!d||d.uuid!==row.provider_post_uuid||String(d.id)!==String(row.provider_post_id)||d.status!==expectedStatus||d.published_at||((d.scheduled_at||null)!==expectedTime))throw Error('Post identity/status changed');
 if(!Array.isArray(d.accounts)||d.accounts.length!==1||String(typeof d.accounts[0]==='object'?d.accounts[0]?.id:d.accounts[0])!==c.id||!Array.isArray(d.tags)||d.tags.length!==0)throw Error('Destination or tags not verified');
 const v=d.versions;
 if(!Array.isArray(v)||v.length!==1||v[0]?.account_id!==0||v[0].is_original!==true||!Array.isArray(v[0].content)||v[0].content.length!==1)throw Error('Version not verified');
 const t=v[0].content[0],o=v[0].options?.facebook_page;
 if(!t||typeof t.body!=='string'||!t.body.trim()||t.body.length>20000||!Array.isArray(t.media)||t.media.length||t.url!==''||o?.type!=='post'||o.share_to_story!==false)throw Error('Text-only standard post required');
 return {versions:v,accounts:[Number(c.id)],tags:[]};
}
// Initial test was in GMT. Restrict pilot to GMT dates within 30 days, until BST is verified.
export function scheduleTime(date,time,now=Date.now()){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
 const ts=Date.parse(date+'T'+time+':00Z');
 if(!Number.isFinite(ts)||new Date(ts).toISOString().slice(0,16)!==date+'T'+time||ts<now+15*60000||ts>now+30*86400000)return null;
 const zone=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',timeZoneName:'short'}).formatToParts(new Date(ts)).find(p=>p.type==='timeZoneName')?.value;
 return zone==='GMT'?date+' '+time+':00':null;
}
export async function marketingSchedule(request,env,user,f=fetch,now=Date.now()){
 if(!user)return page('Sign in required','Open the portal.',401);
 if(!marketingOwner(user,env))return page('Access not available','Owner only.',403);
 if(!['GET','POST'].includes(request.method))return page('Method not allowed','',405);
 const c=config(env);if(!c||!env.DB)return page('Scheduling unavailable','Connection settings incomplete.',503);
 let id,form;
 if(request.method==='GET'){
  id=new URL(request.url).searchParams.get('post');
  if(id===null){
   const rows=await env.DB.prepare("SELECT d.provider_post_uuid,d.provider_post_id,d.created_at,s.state,s.scheduled_at FROM marketing_draft_attempts d LEFT JOIN marketing_schedule_attempts s ON s.provider_post_uuid=d.provider_post_uuid WHERE d.state='confirmed' AND d.provider_post_uuid IS NOT NULL ORDER BY d.created_at DESC LIMIT 50").all();
   const items=rows.results||[];
   return marketingHtml(back+'<h1>Scheduling pilot</h1><p>Prunus Media Facebook only. New text-only drafts created in this portal are eligible. Existing images, imported drafts, other accounts and automatic publishing are excluded.</p><p><a href="/marketing-studio/draft">Create a text-only draft</a></p>'+ (items.length?items.map(x=>'<section><h2>Draft '+e(x.provider_post_id)+'</h2><p>'+e(x.created_at)+'</p>'+(x.state?'<p>'+e(x.state==='confirmed'?'Scheduled (provider verified at time of request)':'Needs manual reconciliation; no retry')+' · '+e(x.scheduled_at)+' London time</p>':'<a href="'+path+'?post='+encodeURIComponent(x.provider_post_uuid)+'">Review and schedule</a>')+'</section>').join(''):'<p>No eligible portal drafts yet.</p>'));
  }
 }else{
  if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return page('Request blocked','Use the portal form.',403);
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return page('Invalid form','',415);
  if(Number(request.headers.get('content-length')||0)>5000)return page('Invalid form','',413);
  const raw=await request.text();if(raw.length>5000)return page('Invalid form','',413);
  form=new URLSearchParams(raw);
  const keys=['post','snapshot','date','time','confirm'];
  if([...form.keys()].some(k=>!keys.includes(k))||keys.some(k=>form.getAll(k).length!==1)||form.get('confirm')!=='schedule'||!/^[a-f0-9]{64}$/.test(form.get('snapshot')))return page('Approval required','Review the post and confirm.',400);
  id=form.get('post');
 }
 if(typeof id!=='string'||!uuid.test(id))return page('Invalid post','',400);
 const row=await env.DB.prepare("SELECT provider_post_uuid,provider_post_id FROM marketing_draft_attempts WHERE provider_post_uuid=? AND state='confirmed'").bind(id).first();
 if(!row)return page('Not eligible','Only new portal-created text-only drafts.',404);
 const previous=await env.DB.prepare('SELECT state FROM marketing_schedule_attempts WHERE provider_post_uuid=?').bind(id).first();
 if(previous)return page('Already attempted','Check Content360 for actual status. No retry is offered.',409);
 if(!(await validTarget(c,f)))return page('Account not verified','No scheduling action taken.',409);
 const endpoint='posts/'+id;let post,canonical,snapshot;
 try{post=await json(c,endpoint,'GET',f);canonical=checkedPost(post,row,c,'draft',null);snapshot=await hash(canonical);}catch{return page('Draft not eligible','The provider did not return a verified unscheduled, text-only Prunus Media draft. No changes made.',409);}
 if(request.method==='GET'){
  return marketingHtml(back+'<h1>Review and schedule</h1><section><h2>Prunus Media · Facebook</h2><p>Provider draft '+e(row.provider_post_id)+'</p><p>Exact stored text (HTML markup shown, not executed):</p><pre>'+e(canonical.versions[0].content[0].body)+'</pre><p>Schedule a future public post in London time. Do not edit this draft concurrently in Content360. The pilot accepts GMT dates within 30 days, at least 15 minutes ahead.</p><form method="post" action="'+path+'"><input type="hidden" name="post" value="'+e(id)+'"><input type="hidden" name="snapshot" value="'+e(snapshot)+'"><label>Date <input name="date" type="date" required></label><label>Time (London) <input name="time" type="time" required></label><label><input type="checkbox" name="confirm" value="schedule" required> I approve this exact post and date/time for public Facebook publication.</label><button type="submit">Schedule approved post</button></form></section>',200,true);
 }
 if(snapshot!==form.get('snapshot'))return page('Draft changed','Reopen and review the latest version. No changes made.',409);
 const date=form.get('date'),time=form.get('time'),expected=scheduleTime(date,time,now);
 if(!expected)return page('Invalid date or time','Choose a GMT date within 30 days, at least 15 minutes ahead.',400);
 const reserved=await env.DB.prepare("INSERT INTO marketing_schedule_attempts (provider_post_uuid,actor_email,approved_snapshot,scheduled_at,state) VALUES (?,?,?,?,'pending') ON CONFLICT DO NOTHING RETURNING provider_post_uuid").bind(id,user.email,snapshot,expected).first();
 if(!reserved)return page('Already attempted','No second request sent.',409);
 let state='uncertain';
 try{
  const updated=await json(c,endpoint,'PUT',f,{date,time,timezone:'Europe/London',...canonical});
  if(updated?.success!==true)throw Error('Date update unconfirmed');
  const dated=checkedPost(await json(c,endpoint,'GET',f),row,c,'draft',expected);
  if(await hash(dated)!==snapshot)throw Error('Content changed during date update');
  const result=await json(c,'posts/schedule/'+id,'POST',f,{postNow:false});
  if(result?.success!==true||result.scheduled_at!==expected||result.needs_approval!==false)throw Error('Schedule unconfirmed');
  const verified=checkedPost(await json(c,endpoint,'GET',f),row,c,'scheduled',expected);
  if(await hash(verified)!==snapshot)throw Error('Scheduled content changed');
  state='confirmed';
 }catch{/* Any write may have reached provider. Never automatically retry. */}
 try{await env.DB.prepare("UPDATE marketing_schedule_attempts SET state=?,updated_at=datetime('now') WHERE provider_post_uuid=?").bind(state,id).run();}
 catch{return page('Check Content360','Local ledger update failed. Do not retry.',502);}
 return state==='confirmed'?page('Scheduled','Content360 confirmed '+expected+' London time. Actual Facebook delivery has not yet been verified.'):page('Check Content360','A date update or scheduling request may have reached the provider. Check this draft and publishing history manually. No retry is offered.',502);
}
