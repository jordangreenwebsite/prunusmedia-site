// Owner-only Content360 read pilot. No mutations, scheduled work or forwarded credentials.
const root='https://app.content360.io/os/api/';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean=(v,n=160)=>typeof v==='string'?v.slice(0,n):'';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function marketingOwner(user,env){
  const email=String(env.CONTENT360_OWNER_EMAIL||'').trim().toLowerCase();
  return !!(email&&user?.admin===true&&String(user.email||'').toLowerCase()===email);
}
export async function readContent360(env,endpoint,fetcher=fetch){
  if(!['accounts','posts','media'].includes(endpoint))throw Error('Endpoint not allowed');
  const workspace=String(env.CONTENT360_WORKSPACE_ID||'').trim();
  const token=String(env.CONTENT360_API_TOKEN||'').trim();
  if(!uuid.test(workspace)||!token)return {ok:false,message:'Connection settings incomplete.'};
  try{
    const r=await fetcher(root+workspace+'/'+endpoint,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+token,Accept:'application/json','X-Requested-With':'XMLHttpRequest'}});
    // Workers support manual redirects; reject them without forwarding the bearer token.
    if(r.status>=300&&r.status<400)return {ok:false,message:'Content360 returned a redirect (HTTP '+r.status+'). Request stopped.'};
    if(!r.ok)return {ok:false,message:'Content360 returned HTTP '+r.status+'.'};
    if(!String(r.headers.get('content-type')||'').toLowerCase().includes('application/json'))return {ok:false,message:'Unexpected response format.'};
    const data=await r.json();
    if(!Array.isArray(data?.data))return {ok:false,message:'Unexpected response structure.'};
    const rows=data.data.filter(x=>x&&typeof x==='object');
    const items=rows.slice(0,100).map(x=>endpoint==='accounts'?{name:clean(x.name),provider:clean(x.provider,40),authorized:x.authorized===true}:endpoint==='posts'?{status:clean(x.status,40),created_at:clean(x.created_at,40),scheduled_at:clean(x.scheduled_at,40),published_at:clean(x.published_at,40)}:{type:clean(x.type,40),created_at:clean(x.created_at,40)});
    return {ok:true,items,count:rows.length,truncated:rows.length>100,more:!!data.links?.next};
  }catch(e){return {ok:false,message:e?.name==='TimeoutError'||e?.name==='AbortError'?'Content360 request timed out.':e?.name==='TypeError'?'Content360 network or request configuration error.':'Content360 connection unavailable.'};}
}
export const marketingEscape=esc;
export function marketingHtml(body,status=200,allowForm=false){
  const nonce=crypto.randomUUID().replaceAll('-','');
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Marketing Studio | Prunus</title><style nonce="'+nonce+'">*{box-sizing:border-box}body{margin:0;background:#f7f5f0;color:#292724;font:16px Arial,sans-serif}main{max-width:1080px;margin:auto;padding:28px 20px}h1,h2{font-family:Georgia,serif;font-weight:normal}h1{font-size:40px;margin:20px 0 8px}h2{font-size:26px;margin:0 0 12px}p{line-height:1.55}a{color:#45364c;text-decoration:underline}section{background:#fff;border:1px solid #dedbd3;padding:22px;margin:20px 0;border-radius:4px}.meta{color:#605b54;font-size:14px}.scroll{overflow:auto}label{display:block;margin:12px 0}textarea{width:100%;font:inherit;padding:12px;border:1px solid #aaa;border-radius:3px;resize:vertical}fieldset{border:1px solid #dedbd3;padding:12px;margin:16px 0}legend{padding:0 8px}.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:12px;max-height:420px;overflow:auto}.media-choice{border:1px solid #dedbd3;padding:8px;display:flex;flex-direction:column;gap:6px;margin:0;overflow-wrap:anywhere;cursor:pointer}.media-choice:has(input:checked){border-color:#45364c;outline:2px solid #45364c;outline-offset:-2px}.media-choice img{width:100%;height:90px;object-fit:contain;background:#f7f5f0}.media-choice input{align-self:flex-start}.media-choice span{font-size:13px}button{font:inherit;background:#45364c;color:white;padding:12px 18px;border:0;border-radius:3px;cursor:pointer}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:12px 10px;border-bottom:1px solid #e5e1da;vertical-align:top}th{font-size:14px}th,td{overflow-wrap:anywhere}@media(max-width:600px){main{padding:16px 12px}section{padding:14px}h1{font-size:32px}th,td{padding:8px 6px;font-size:13px}}</style></head><body><main>'+body+'</main></body></html>',{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':allowForm?'same-origin':'no-referrer','content-security-policy':"default-src 'none'; style-src 'nonce-"+nonce+"'; frame-ancestors 'none'; base-uri 'none'; form-action "+(allowForm?"'self'; img-src https://cdn.content360.io":"'none'")+""}});
}
function section(title,result,columns){
  let output='<section><h2>'+esc(title)+'</h2>';
  if(!result.ok)return output+'<p>'+esc(result.message)+'</p></section>';
  output+='<p class="meta">'+result.items.length+' records shown from the first response page'+(result.more||result.truncated?'; more records exist':'')+'. Not an account-wide total.</p>';
  if(!result.items.length)return output+'<p>No records in this response.</p></section>';
  return output+'<div class="scroll"><table><thead><tr>'+columns.map(c=>'<th scope="col">'+esc(c[0])+'</th>').join('')+'</tr></thead><tbody>'+result.items.map(item=>'<tr>'+columns.map(c=>'<td>'+esc(c[1](item)||'Not supplied')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>';
}
export async function marketingStudio(request,env,user,fetcher=fetch){
  if(request.method!=='GET')return marketingHtml('<h1>Method not allowed</h1>',405);
  if(!user)return marketingHtml('<h1>Sign in required</h1><p><a href="/">Open the portal and sign in</a></p>',401);
  if(!marketingOwner(user,env))return marketingHtml('<h1>Access not available</h1><p><a href="/">Return to portal</a></p>',403);
  const [accounts,posts,media]=await Promise.all(['accounts','posts','media'].map(e=>readContent360(env,e,fetcher)));
  return marketingHtml('<a href="/?view=dashboard">Back to dashboard</a><h1>Marketing Studio</h1><p>Content360 connection pilot. Review accounts, posts and media. Scheduling and publishing are disabled.</p><p><a href="/marketing-studio">Refresh data</a> &nbsp; <a href="https://app.content360.io/">Open Content360</a></p><p><a href="/marketing-studio/draft">Create an unpublished draft</a></p>'+section('Connected social accounts',accounts,[['Account',x=>x.name],['Platform',x=>x.provider],['Authorisation',x=>x.authorized?'Authorised':'Not authorised']])+section('Posts',posts,[['Status',x=>x.status],['Created',x=>x.created_at],['Scheduled',x=>x.scheduled_at],['Published timestamp',x=>x.published_at]])+section('Media library',media,[['Type',x=>x.type],['Created',x=>x.created_at]])+'<p class="meta">Provider statuses are not independently verified delivery or engagement. No media URLs, content, identifiers or credentials are displayed.</p>');
}
