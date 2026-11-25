// Intentionally narrow draft-only pilot. No scheduling, uploads, videos or arbitrary account inputs.
import {marketingOwner,marketingHtml,marketingEscape} from './marketing-studio.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const root='https://app.content360.io/os/api/';
const formPath='/marketing-studio/draft';
const back='<p><a href="/marketing-studio">Back to Marketing Studio</a></p>';
const page=(title,message,status=200)=>marketingHtml(back+'<h1>'+marketingEscape(title)+'</h1><p>'+marketingEscape(message)+'</p>',status);
function config(env){
  const workspace=String(env.CONTENT360_WORKSPACE_ID||'').trim(),token=String(env.CONTENT360_API_TOKEN||'').trim(),id=String(env.CONTENT360_DRAFT_ACCOUNT_ID||'').trim();
  if(!uuid.test(workspace)||!token||!/^\d{1,12}$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<=0)return null;
  return {workspace,token,id,base:root+workspace};
}
async function provider(c,endpoint,method,fetcher,body){
  const headers={Authorization:'Bearer '+c.token,Accept:'application/json','X-Requested-With':'XMLHttpRequest'};
  if(body)headers['Content-Type']='application/json';
  return fetcher(c.base+'/'+endpoint,{method,redirect:'manual',signal:AbortSignal.timeout(10000),headers,...(body?{body:JSON.stringify(body)}:{})});
}
async function validTarget(c,fetcher){
  try{
    const r=await provider(c,'accounts','GET',fetcher);
    if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))return false;
    const d=await r.json();
    return Array.isArray(d.data)&&d.data.some(x=>String(x.id)===c.id&&x.authorized===true&&x.provider==='facebook_page'&&['prunus.media','prunus media'].includes(String(x.name).trim().toLowerCase()));
  }catch{return false;}
}
// Existing library images only. Never follow provider pagination URLs or accept arbitrary URLs.
async function imageLibrary(c,fetcher){
  try{
    const r=await provider(c,'media','GET',fetcher);
    if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))return null;
    const d=await r.json();
    if(!Array.isArray(d.data))return null;
    const seen=new Set();
    return d.data.slice(0,100).flatMap(x=>{
      if(!x||x.type!=='image'||x.is_video!==false||!['image/jpeg','image/png','image/webp','image/gif'].includes(x.mime_type))return [];
      const id=String(x.id??'');
      if(!/^\d{1,15}$/.test(id)||seen.has(id))return [];
      seen.add(id);
      let thumb='';
      try{
        const u=new URL(x.thumb_url);
        if(u.origin==='https://cdn.content360.io'&&!u.username&&!u.password&&u.pathname.startsWith('/'+c.workspace+'/uploads/')&&!u.search&&!u.hash)thumb=u.href;
      }catch{}
      return [{id,name:String(x.name||'Image').slice(0,180),thumb}];
    });
  }catch{return null;}
}
function imagePicker(images){
  const e=marketingEscape;
  return '<fieldset><legend>Optional image from Content360</legend><label><input type="radio" name="media_id" value="" checked> No image (text only)</label>'+
    (images===null?'<p>Media library unavailable. Text-only drafts are still available.</p>':images.length===0?'<p>No supported images on the first library page.</p>':'<p class="meta">Select one existing image from the first library page. Only select images you have permission to use for this business.</p><div class="media-grid">'+images.map(x=>'<label class="media-choice"><input type="radio" name="media_id" value="'+e(x.id)+'">'+(x.thumb?'<img src="'+e(x.thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<span>'+e(x.name)+' · '+e(x.id)+'</span></label>').join('')+'</div>')+'</fieldset>';
}
export function draftPayload(id,text,mediaId=''){
  const body='<div>'+marketingEscape(text).replace(/\n/g,'<br>')+'</div>';
  return {content:text,accounts:[id],status:'draft',versions:[{account_id:Number(id),is_original:true,content:[{body,media:mediaId?[mediaId]:[],url:'',opened:true}]}]};
}
async function digestOf(c,text,mediaId=''){
  const bytes=new TextEncoder().encode(JSON.stringify(mediaId?[c.workspace,c.id,text,mediaId]:[c.workspace,c.id,text]));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function marketingDraft(request,env,user,fetcher=fetch){
  if(!user)return page('Sign in required','Sign in through the portal.',401);
  if(!marketingOwner(user,env))return page('Access not available','Owner access only.',403);
  if(!['GET','POST'].includes(request.method))return page('Method not allowed','',405);
  const c=config(env);
  if(!c||!env.DB)return page('Draft pilot not configured','The owner must configure the single permitted account ID.',503);
  if(request.method==='GET'){
    const images=await imageLibrary(c,fetcher);
    return marketingHtml(back+'<h1>Create a draft</h1><section><h2>Prunus Media · Facebook</h2><p>This saves one unpublished draft with an optional existing image in Content360. It does not schedule or publish.</p><form method="post" action="'+formPath+'"><label for="content">Post copy</label><textarea id="content" name="content" rows="9" maxlength="4000" required></textarea>'+imagePicker(images)+'<label class="confirm"><input type="checkbox" name="confirm" value="draft" required> I have reviewed this copy and approve saving it as an unpublished draft.</label><button type="submit">Save unpublished draft</button></form></section>',200,true);
  }
  // Exact same-origin browser form POST only; missing or cross-site Origin fails closed.
  if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return page('Request blocked','Open the draft form in the portal.',403);
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return page('Invalid form','Use the draft form.',415);
  if(Number(request.headers.get('content-length')||0)>50000)return page('Draft too large','',413);
  const raw=await request.text();
  if(raw.length>50000)return page('Draft too large','',413);
  const form=new URLSearchParams(raw);
  if([...form.keys()].some(k=>!['content','confirm','media_id'].includes(k))||form.getAll('content').length!==1||form.getAll('confirm').length!==1||form.getAll('media_id').length>1||form.get('confirm')!=='draft')return page('Confirmation required','Review the text and tick the approval box.',400);
  const text=(form.get('content')||'').replace(/\r\n?/g,'\n').trim();
  if(!text||text.length>4000)return page('Invalid draft','Enter 1 to 4,000 characters.',400);
  if(!(await validTarget(c,fetcher)))return page('Account not verified','No draft was submitted. Check the permitted Facebook account and its authorisation.',409);
  const mediaId=form.get('media_id')||'';
  if(mediaId){
    if(!/^\d{1,15}$/.test(mediaId))return page('Invalid image','Choose an image from the library.',400);
    const images=await imageLibrary(c,fetcher);
    if(!images?.some(x=>x.id===mediaId))return page('Image not verified','No draft was submitted. The image is not available on the current library page.',409);
  }
  const digest=await digestOf(c,text,mediaId);
  let reserved;
  try{reserved=await env.DB.prepare("INSERT INTO marketing_draft_attempts (digest,actor_email,state) VALUES (?,?,'pending') ON CONFLICT(digest) DO NOTHING RETURNING digest").bind(digest,user.email).first();}
  catch{return page('Draft ledger unavailable','No draft was submitted.',503);}
  if(!reserved)return page('Duplicate or unresolved attempt','An identical draft was already attempted. Check Content360 before taking any further action. No second request was sent.',409);
  let state='uncertain',postId=null;
  try{
    const r=await provider(c,'posts','POST',fetcher,draftPayload(c.id,text,mediaId));
    if(r.ok&&r.headers.get('content-type')?.includes('application/json')){
      const result=await r.json(),d=result?.data??result;
      if(d&&d.status==='draft'&&/^\d+$/.test(String(d.id))&&!d.scheduled_at&&!d.published_at){state='confirmed';postId=String(d.id);}
    }
  }catch{/* A request may have reached the provider. Never retry automatically. */}
  try{await env.DB.prepare("UPDATE marketing_draft_attempts SET state=?,provider_post_id=?,updated_at=datetime('now') WHERE digest=?").bind(state,postId,digest).run();}
  catch{return page('Check Content360','A draft request was attempted but the local result could not be recorded. Do not resubmit.',502);}
  return state==='confirmed'?page('Draft saved','Content360 returned draft status. Open Content360 to verify the copy, destination and any selected image. Nothing was scheduled or requested for publication.'):page('Draft outcome needs verification','Check Content360 drafts and publishing history. The provider did not return a confirmed draft result. Do not retry this content.',502);
}
