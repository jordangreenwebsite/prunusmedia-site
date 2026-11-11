// Per-client Google Business Profile OAuth. Never accept an API key as a substitute.
// Admin-only, user consent, one-time state + PKCE, encrypted refresh token in portal D1.
// Read/manage connection & choose a location; NO automatic Google posts or cross-brand writes.
const urlBase='https://portal.prunusmedia.com';
const callback=urlBase+'/api/gbp/callback';
const json=(body,status=200)=>new Response(JSON.stringify({ok:status<400,...body}),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const text=(x,n=300)=>String(x??'').trim().slice(0,n);
const configured=env=>!!(env.GBP_OAUTH_CLIENT_ID&&env.GBP_OAUTH_CLIENT_SECRET&&env.GBP_TOKEN_ENCRYPTION_KEY);
function bytes64(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function getBytes(){const b=new Uint8Array(32);crypto.getRandomValues(b);return bytes64(b);}
async function sha64(x){
  return bytes64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))));
}
async function cipherKey(env){
  const value=text(env.GBP_TOKEN_ENCRYPTION_KEY,256);
  const base=value.replaceAll('-','+').replaceAll('_','/');
  const raw=Uint8Array.from(atob(base),x=>x.charCodeAt(0));
  if(raw.length!==32)throw Error('GBP encryption key must be 32 base64url bytes.');
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
async function encrypt(env,value){
  const key=await cipherKey(env),iv=new Uint8Array(12);crypto.getRandomValues(iv);
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));
  return {iv:bytes64(iv),ciphertext:bytes64(ct)};
}
async function decrypt(env,iv,ciphertext){
  const decode=v=>Uint8Array.from(atob(v.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv)},await cipherKey(env),decode(ciphertext));
  return new TextDecoder().decode(raw);
}
const redirect=(location)=>new Response(null,{status:303,headers:{location,'cache-control':'no-store','referrer-policy':'no-referrer'}});
async function hasClient(env,id){
  return !!(await env.DB.prepare('SELECT id FROM clients WHERE id=? AND active=1').bind(id).first());
}
async function tokenRequest(env,fields){
  const r=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({...fields,client_id:env.GBP_OAUTH_CLIENT_ID,client_secret:env.GBP_OAUTH_CLIENT_SECRET})
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.access_token)throw Error('Google Business Profile OAuth token request failed ('+r.status+').');
  return data;
}
async function connect(request,env,user,url){
  if(!user?.admin)return json({error:'Forbidden.'},403);
  if(!configured(env))return json({error:'Google Business Profile OAuth needs separate Google Cloud credentials and Google API approval.'},503);
  const id=text(url.searchParams.get('client'),100);
  if(!(await hasClient(env,id)))return json({error:'Business not found.'},404);
  const state=getBytes(),verifier=getBytes(),challenge=await sha64(verifier);
  await env.DB.prepare('INSERT INTO gbp_oauth_pending (state_hash,client_id,actor_email,pkce_verifier,expires_at) VALUES (?,?,?,?,?)')
    .bind(await sha64(state),id,user.email,verifier,Date.now()+10*60*1000).run();
  const dest=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [key,value] of Object.entries({
    client_id:env.GBP_OAUTH_CLIENT_ID,redirect_uri:callback,response_type:'code',
    access_type:'offline',prompt:'consent',scope:'https://www.googleapis.com/auth/business.manage',
    state,code_challenge:challenge,code_challenge_method:'S256'
  }))dest.searchParams.set(key,value);
  return redirect(dest.href);
}
async function oauthCallback(request,env,user,url){
  if(!user?.admin)return json({error:'Sign in again to complete Google Business Profile connection.'},401);
  const state=text(url.searchParams.get('state'),200);
  if(!state)return json({error:'Missing OAuth state.'},400);
  const pending=await env.DB.prepare('DELETE FROM gbp_oauth_pending WHERE state_hash=? AND actor_email=? AND expires_at>? RETURNING *')
    .bind(await sha64(state),user.email,Date.now()).first();
  if(!pending)return json({error:'Google connection link expired or belongs to another account.'},403);
  const next=new URL(urlBase+'/');
  next.searchParams.set('view','settings');
  next.searchParams.set('client',pending.client_id);
  if(url.searchParams.has('error')){
    next.searchParams.set('gbp','denied');
    return redirect(next.href);
  }
  const code=text(url.searchParams.get('code'),2000);
  if(!code)return json({error:'Missing Google authorisation code.'},400);
  if(!(await hasClient(env,pending.client_id)))return json({error:'Business no longer exists.'},404);
  try{
    const result=await tokenRequest(env,{grant_type:'authorization_code',code,
      redirect_uri:callback,code_verifier:pending.pkce_verifier});
    if(!result.refresh_token)throw Error('Google returned no refresh token. Disconnect existing grant and try again.');
    const encrypted=await encrypt(env,result.refresh_token);
    await env.DB.prepare(
      "INSERT INTO gbp_connections (client_id,token_ciphertext,token_iv) VALUES (?,?,?) "+
      "ON CONFLICT(client_id) DO UPDATE SET token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,location_name='',location_title='',updated_at=datetime('now')"
    ).bind(pending.client_id,encrypted.ciphertext,encrypted.iv).run();
    await env.DB.prepare('INSERT INTO audit_log (id,actor_email,event,client_id,resource_id) VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(),user.email,'gbp.oauth_connected',pending.client_id,pending.client_id).run();
    next.searchParams.set('gbp','connected');
    return redirect(next.href);
  }catch{
    next.searchParams.set('gbp','failed');
    return redirect(next.href);
  }
}
async function status(env,id){
  const row=await env.DB.prepare('SELECT client_id,location_name,location_title,connected_at FROM gbp_connections WHERE client_id=?')
    .bind(id).first();
  return json({configured:configured(env),connected:!!row,location:row?.location_name||'',
    title:row?.location_title||'',connected_at:row?.connected_at||null,
    message:!configured(env)?'Google Business Profile needs OAuth 2.0 and approved API access, not an API key.':!row?'Use Connect with Google, then choose the correct location.':'The Google account is authorised. Select the exact business listing below.'});
}
async function locations(env,id){
  const row=await env.DB.prepare('SELECT token_ciphertext,token_iv FROM gbp_connections WHERE client_id=?')
    .bind(id).first();
  if(!row)return json({error:'Connect Google first.'},409);
  const refresh_token=await decrypt(env,row.token_iv,row.token_ciphertext);
  const result=await tokenRequest(env,{grant_type:'refresh_token',refresh_token});
  const endpoint='https://mybusinessbusinessinformation.googleapis.com/v1/accounts/-/locations?readMask=name,title,websiteUri&pageSize=100';
  const response=await fetch(endpoint,{headers:{authorization:'Bearer '+result.access_token,'accept':'application/json'}});
  if(!response.ok) {
    return json({error:response.status===403?'Google has not approved Business Profile API access for this project or this Google account lacks permission.':'Unable to list Google Business Profile locations.'},502);
  }
  const payload=await response.json();
  return json({locations:(payload.locations||[]).map(p=>({name:p.name,title:p.title,websiteUri:p.websiteUri||''}))
    .filter(p=>/^locations\/\d+$/.test(p.name||'')),has_more:!!payload.nextPageToken});
}
async function chooseLocation(request,env,user,id){
  let input;
  try{input=await request.json();}catch{return json({error:'Invalid selection.'},400);}
  const location=text(input.name,100);
  if(!/^locations\/\d+$/.test(location))return json({error:'Choose a real Google listing.'},400);
  const res=await locations(env,id),body=await res.json();
  if(!res.ok)return json({error:body.error},res.status);
  const match=body.locations.find(x=>x.name===location);
  if(!match)return json({error:'This listing is not accessible to the connected Google account.'},403);
  await env.DB.prepare("UPDATE gbp_connections SET location_name=?,location_title=?,updated_at=datetime('now') WHERE client_id=?")
    .bind(match.name,text(match.title,250),id).run();
  await env.DB.prepare('INSERT INTO audit_log (id,actor_email,event,client_id,resource_id) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(),user.email,'gbp.location_selected',id,location).run();
  return json({message:'Google Business Profile listing saved.',location:match.name,title:match.title});
}
async function disconnect(env,user,id){
  await env.DB.prepare('DELETE FROM gbp_connections WHERE client_id=?').bind(id).run();
  await env.DB.prepare('INSERT INTO audit_log (id,actor_email,event,client_id,resource_id) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(),user.email,'gbp.disconnected',id,id).run();
  return json({message:'Disconnected in the portal. You can also revoke access in your Google Account permissions.'});
}
export async function gbpRoutes(request,env,user,url){
  const path=url.pathname,method=request.method;
  if(path==='/api/admin/gbp/connect'&&method==='GET')return connect(request,env,user,url);
  if(path==='/api/gbp/callback'&&method==='GET')return oauthCallback(request,env,user,url);
  const match=path.match(/^\/api\/admin\/gbp\/(status|locations|location|disconnect)$/);
  if(!match)return null;
  if(!user?.admin)return json({error:'Forbidden.'},403);
  const id=text(method==='GET'?url.searchParams.get('client'):url.searchParams.get('client'),100);
  if(!/^[a-f0-9-]{36}$/.test(id)||!(await hasClient(env,id)))return json({error:'Business not found.'},404);
  if(match[1]==='status'&&method==='GET')return status(env,id);
  if(match[1]==='locations'&&method==='GET')return locations(env,id);
  if(match[1]==='location'&&method==='PATCH')return chooseLocation(request,env,user,id);
  if(match[1]==='disconnect'&&method==='DELETE')return disconnect(env,user,id);
  return null;
}
