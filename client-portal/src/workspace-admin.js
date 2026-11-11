// Admin-only workspace configuration; no credentials returned to browser.
const json=(data,status=200)=>new Response(JSON.stringify({ok:status<400,...data}),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const trim=(v,n=300)=>String(v??'').trim().slice(0,n);
const repoValid=(repo)=>!repo||/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo);
const pathValid=(path)=>/^(?:src\/content\/blog\/|src\/pages\/blog\/|content\/blog\/|blog\/)$/.test(path);
const branchValid=(branch)=>/^[a-zA-Z0-9_.-]{1,80}$/.test(branch)&&!branch.includes('..')&&!branch.startsWith('.');
function safeGbpUrl(input){
  const val=trim(input,500);
  if(!val)return '';
  try{
    const u=new URL(val);
    const host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||!['business.google.com','www.google.com','google.com','maps.google.com','g.page'].includes(host))return null;
    if(u.pathname.length<2)return null;
    return u.href;
  }catch{return null;}
}
async function readSettings(env){
  return await env.DB.prepare('SELECT * FROM portal_ai_settings WHERE id=1').first();
}
async function aiSettings(request,env,user){
  if(!user.admin)return json({error:'Forbidden.'},403);
  const old=await readSettings(env);
  if(request.method==='GET'){
    return json({
      settings:{mcp_enabled:!!old.mcp_enabled,
        expose_search:!!old.expose_search,expose_editorial:!!old.expose_editorial,
        expose_research:!!old.expose_research},
      connections:{
        mcp_token:!!env.MCP_ADMIN_TOKEN,
        gsc:!!env.GSC_SERVICE_ACCOUNT_JSON,
        research:!!env.BRAVE_SEARCH_API_KEY,
        github_pr:!!env.GITHUB_PRUNUS_CONTENT_TOKEN,
        gbp_oauth:!!(env.GBP_OAUTH_CLIENT_ID&&env.GBP_OAUTH_CLIENT_SECRET&&env.GBP_TOKEN_ENCRYPTION_KEY)
      },
      endpoint:'https://portal.prunusmedia.com/mcp',
      info:'An API endpoint is not an installed ChatGPT app. The MCP endpoint is read-only and uses a separate bearer token.'
    });
  }
  let data;
  try{data=await request.json();}catch{return json({error:'Invalid settings.'},400);}
  if(typeof data!=='object'||!data||Object.keys(data).some(k=>!['mcp_enabled','expose_search','expose_editorial','expose_research'].includes(k))||
    !['mcp_enabled','expose_search','expose_editorial','expose_research'].every(k=>typeof data[k]==='boolean'))
    return json({error:'Choose the allowed tool permissions.'},400);
  if(data.mcp_enabled&&!env.MCP_ADMIN_TOKEN)return json({error:'Add the portal MCP token in protected deployment secrets first.'},409);
  await env.DB.prepare("UPDATE portal_ai_settings SET mcp_enabled=?,expose_search=?,expose_editorial=?,expose_research=?,updated_at=datetime('now') WHERE id=1")
    .bind(data.mcp_enabled?1:0,data.expose_search?1:0,data.expose_editorial?1:0,data.expose_research?1:0).run();
  await env.DB.prepare('INSERT INTO audit_log (id,actor_email,event,client_id) VALUES (?,?,?,NULL)')
    .bind(crypto.randomUUID(),user.email,'mcp.settings_changed').run();
  return json({message:'AI and MCP permissions saved.'});
}
async function publishing(request,env,user,id){
  if(!user.admin)return json({error:'Forbidden.'},403);
  const client=await env.DB.prepare('SELECT id,name,domain,brand,publishing_repo,publishing_path,publishing_branch,google_business_profile_url FROM clients WHERE id=? AND active=1').bind(id).first();
  if(!client)return json({error:'Client not found.'},404);
  if(request.method==='GET')return json({client,publishing:{
    repo:client.publishing_repo,path:client.publishing_path,branch:client.publishing_branch,
    active_git_writer:client.brand==='prunus'&&['prunusmedia.com','www.prunusmedia.com'].includes(client.domain.toLowerCase())&&!!env.GITHUB_PRUNUS_CONTENT_TOKEN,
    note:'Saving a repository target is not permission to publish. GitHub draft PR automation is currently restricted to the live Prunus Media repository.'
  }});
  let data;
  try{data=await request.json();}catch{return json({error:'Invalid details.'},400);}
  const repo=trim(data.repo,170),path=trim(data.path,100)||'src/content/blog/',branch=trim(data.branch,80)||'main',gbp=safeGbpUrl(data.gbp_url);
  if(!repoValid(repo)||!pathValid(path)||!branchValid(branch)||gbp===null)return json({error:'Enter a valid owner/repository, supported publishing folder, branch and Google Business Profile URL.'},400);
  // This is an allowlisted configuration record ONLY. It grants no GitHub credentials.
  await env.DB.prepare('UPDATE clients SET publishing_repo=?,publishing_path=?,publishing_branch=?,google_business_profile_url=? WHERE id=?')
    .bind(repo,path,branch,gbp,id).run();
  await env.DB.prepare('INSERT INTO audit_log (id,actor_email,event,client_id,resource_id) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(),user.email,'client.publishing_settings_changed',id,id).run();
  return json({message:'Business connection preferences saved. Publishing stays review-only until a repository is individually authorised.'});
}
export async function workspaceAdminRoutes(request,env,user,url){
  const path=url.pathname,method=request.method;
  if(path==='/api/admin/ai-settings'&&['GET','PATCH'].includes(method))return aiSettings(request,env,user);
  const m=path.match(/^\/api\/admin\/clients\/([a-f0-9-]{36})\/publishing$/);
  if(m&&['GET','PATCH'].includes(method))return publishing(request,env,user,m[1]);
  return null;
}
