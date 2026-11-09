// Google Search Console read-only integration. No OAuth browser flow, no client
// passwords and no shared credentials with Prunus Certificates.
// Google Cloud service account must be invited as a Search Console property user.
const json=(data,status=200)=>new Response(JSON.stringify({ok:status<400,...data}),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
const clean=(value,max=200)=>String(value??'').trim().slice(0,max);

export function validProperty(property,registeredDomain){
  const value=clean(property,250),domain=clean(registeredDomain,250).toLowerCase().replace(/^www\./,'');
  if(!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)||domain.includes('..'))return false;
  if(value.startsWith('sc-domain:')){
    const host=value.slice('sc-domain:'.length).toLowerCase();
    return host===domain||host==='www.'+domain;
  }
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return false;
    const host=url.hostname.toLowerCase();
    return (host===domain||host==='www.'+domain) && url.pathname==='/';
  }catch{return false;}
}
export async function allowedClient(env,user,clientId){
  if(!user||!clientId)return null;
  const row=await env.DB.prepare(
    'SELECT c.id,c.domain,c.name,c.gsc_property,c.brand,c.industry,c.service_area,c.voice_notes FROM clients c WHERE c.id=? AND c.active=1'
  ).bind(clientId).first();
  if(!row)return null;
  if(user.admin)return row;
  const membership=await env.DB.prepare(
    'SELECT 1 FROM client_members WHERE client_id=? AND email=? AND active=1'
  ).bind(clientId,user.email).first();
  return membership?row:null;
}
const encode64url=bytes=>{
  let s='';for(const x of bytes)s+=String.fromCharCode(x);
  return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
};
const as64=value=>encode64url(new TextEncoder().encode(value));
function serviceCredentials(env){
  const raw=clean(env.GSC_SERVICE_ACCOUNT_JSON,12000);
  if(!raw)return null;
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw Error('Invalid GSC service-account configuration');}
  if(parsed.type!=='service_account'||!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(parsed.client_email)||!parsed.private_key?.includes('BEGIN PRIVATE KEY')) {
    throw Error('Invalid GSC service-account configuration');
  }
  return parsed;
}
export async function gscToken(env){
  const creds=serviceCredentials(env);
  if(!creds)return null;
  const now=Math.floor(Date.now()/1000);
  const head=as64(JSON.stringify({alg:'RS256',typ:'JWT',kid:creds.private_key_id||undefined}));
  const claims=as64(JSON.stringify({
    iss:creds.client_email,scope:'https://www.googleapis.com/auth/webmasters.readonly',
    aud:'https://oauth2.googleapis.com/token',iat:now-20,exp:now+3400
  }));
  const keyBytes=Uint8Array.from(atob(creds.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'')),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',keyBytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signed=await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},key,new TextEncoder().encode(head+'.'+claims));
  const assertion=head+'.'+claims+'.'+encode64url(new Uint8Array(signed));
  const res=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})
  });
  if(!res.ok)throw Error('Google credential exchange failed ('+res.status+').');
  const body=await res.json();
  if(!body.access_token)throw Error('Google did not provide an access token.');
  return body.access_token;
}
function utcDate(daysBack){
  const d=new Date(Date.now()-daysBack*86400000);
  return d.toISOString().slice(0,10);
}
async function querySearchConsole(accessToken,property,startDate,endDate,dimensions=[],limit=1){
  const url='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(property)+'/searchAnalytics/query';
  const result=await fetch(url,{
    method:'POST',
    headers:{authorization:'Bearer '+accessToken,'content-type':'application/json'},
    body:JSON.stringify({startDate,endDate,dimensions,rowLimit:limit,type:'web',dataState:'final'})
  });
  if(!result.ok){
    if(result.status===403||result.status===404)throw Error('Search Console property not shared with the portal service account.');
    throw Error('Search Console request failed ('+result.status+').');
  }
  return result.json();
}
function summary(row){
  return {clicks:Math.round(Number(row?.clicks)||0),impressions:Math.round(Number(row?.impressions)||0),
    ctr:Number((Number(row?.ctr)||0).toFixed(4)),position:Number((Number(row?.position)||0).toFixed(1))};
}
export async function getGscMetrics(env,client){
  if(!client?.gsc_property)return {configured:false,reason:'Add this website’s exact Search Console property in client settings.'};
  if(!validProperty(client.gsc_property,client.domain))return {configured:false,reason:'The Search Console property does not match this client website.'};
  if(!env.GSC_SERVICE_ACCOUNT_JSON)return {configured:false,reason:'Connect the separate Google Search Console service account in GitHub secrets.'};
  const accessToken=await gscToken(env);
  const from=utcDate(30),to=utcDate(3),prevFrom=utcDate(58),prevTo=utcDate(31);
  const [current,previous,queries]=await Promise.all([
    querySearchConsole(accessToken,client.gsc_property,from,to,[],1),
    querySearchConsole(accessToken,client.gsc_property,prevFrom,prevTo,[],1),
    querySearchConsole(accessToken,client.gsc_property,from,to,['query'],25)
  ]);
  return {configured:true,property:client.gsc_property,period:{start:from,end:to},previousPeriod:{start:prevFrom,end:prevTo},
    current:summary(current.rows?.[0]),previous:summary(previous.rows?.[0]),
    queries:(queries.rows||[]).slice(0,25).map(r=>({query:clean(r.keys?.[0],180),...summary(r)}))};
}
export async function gscRoute(request,env,user,url){
  if(url.pathname!=='/api/seo'||request.method!=='GET')return null;
  const clientId=clean(url.searchParams.get('client'),100);
  const client=await allowedClient(env,user,clientId);
  if(!client)return json({error:'Not found.'},404);
  try{
    return json({client_id:client.id,...await getGscMetrics(env,client)});
  }catch(err){
    const message=clean(err.message,180);
    return json({error:message.startsWith('Search Console')||message.startsWith('Google')?message:'Unable to load Search Console data.'},502);
  }
}
