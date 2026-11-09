// Explicit admin-only draft PR creation for the ONE authorised website repository.
// No access to Certificates, UK Trades, or SEO customer repositories.
// This never merges a PR, changes a live branch, or marks an article published.
const REPO='jordangreenwebsite/prunusmedia-site';
const slugify=text=>String(text||'').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,72);
const formatError=(message,status=400)=>new Response(JSON.stringify({ok:false,error:message}),{
  status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
const result=(data,status=200)=>new Response(JSON.stringify({ok:true,...data}),{
  status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
async function github(env,method,path,body){
  const url='https://api.github.com/repos/'+REPO+'/'+path;
  const res=await fetch(url,{
    method,headers:{authorization:'Bearer '+env.GITHUB_PRUNUS_CONTENT_TOKEN,
      accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'prunus-client-portal',
      ...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  if(!res.ok){
    const status=res.status;
    throw Error(status===401||status===403?'GitHub token is missing repository permissions ('+status+').':
      status===422?'GitHub rejected a duplicate or invalid branch/content request.':
      'GitHub request failed ('+status+').');
  }
  return res.json();
}
const b64=value=>{
  const bytes=new TextEncoder().encode(value);
  let raw='';for(let i=0;i<bytes.length;i+=5000)
    raw+=String.fromCharCode(...bytes.slice(i,i+5000));
  return btoa(raw);
};
const yamlString=v=>JSON.stringify(String(v||'').replace(/\r?\n/g,' '));
function markdown(post){
  const text=String(post.draft||'').trim();
  if(/<\s*(script|iframe|object|embed|style)\b|^\s*(import|export)\s+/im.test(text))
    throw Error('Remove executable HTML or imports before creating a website pull request.');
  const desc=String(post.audience_question||post.brief||'').replace(/\s+/g,' ').trim().slice(0,180);
  if(desc.length<20)throw Error('Add a useful reader question or summary before creating a PR.');
  const sources=JSON.parse(post.sources_json||'[]');
  const citations=sources.length?'\n\n## Sources checked\n\n'+sources.map(s=>'- ['+
    String(s.title||'Source').replace(/[\[\]]/g,'')+']('+String(s.url).replace(/[()]/g,'')+') (checked '+s.checked_at+')').join('\n'):'';
  return '---\n'+
    'title: '+yamlString(post.title)+'\n'+
    'description: '+yamlString(desc)+'\n'+
    'publishedAt: '+new Date().toISOString().slice(0,10)+'\n'+
    'author: "Prunus Media"\n'+
    'tags: ["Websites"]\n'+
    'draft: true\n'+
    '---\n\n'+text+citations+'\n';
}
export async function createPrRoute(request,env,user,url){
  const match=url.pathname.match(/^\/api\/admin\/editorial\/([a-f0-9-]{36})\/create-pr$/);
  if(!match||request.method!=='POST')return null;
  if(!user?.admin)return formatError('Forbidden.',403);
  if(!env.GITHUB_PRUNUS_CONTENT_TOKEN)return formatError(
    'GitHub PR integration is not configured. Add the repository-scoped token to protected deployment secrets.',503);
  const post=await env.DB.prepare(
    'SELECT e.*,c.domain,c.brand,c.active FROM editorial_posts e JOIN clients c ON c.id=e.client_id WHERE e.id=?'
  ).bind(match[1]).first();
  if(!post||!post.active)return formatError('Article not found.',404);
  // Avoid accidental cross-repository publishing: only Prunus Media's live site.
  if(post.brand!=='prunus'||!['prunusmedia.com','www.prunusmedia.com'].includes(post.domain.toLowerCase()))
    return formatError('This integration only creates reviewed PRs for the live Prunus Media website. Client websites require separate authorised repository connections.',403);
  if(!['approved','scheduled'].includes(post.status))return formatError('Approve the complete article before generating a PR.',409);
  if(post.requires_approval && !post.approved_at)return formatError('Client approval is still required.',409);
  if(post.github_pr_url)return result({url:post.github_pr_url,number:post.github_pr_number,already_created:true});
  if((post.brief||'').length<60||(post.draft||'').length<500||(post.evidence_note||'').length<30)
    return formatError('Add detailed research, complete draft and verified evidence notes first.',400);
  const sources=JSON.parse(post.sources_json||'[]');
  if(!sources.length&&!/first.party|original evidence|interview|own photos|client records/i.test(post.evidence_note||''))
    return formatError('Provide verified source URLs or genuine first-party evidence before preparing the PR.',400);
  let content;
  try{content=markdown(post);}catch(err){return formatError(err.message,400);}
  const file='src/content/blog/'+slugify(post.title)+'-'+post.id.slice(0,8)+'.md';
  const branch='portal/review-blog-'+post.id.slice(0,8);
  try{
    const main=await github(env,'GET','git/ref/heads/main');
    await github(env,'POST','git/refs',{ref:'refs/heads/'+branch,sha:main.object.sha});
    await github(env,'PUT','contents/'+file,{message:'Add review-only Prunus blog draft: '+post.title.slice(0,60),
      content:b64(content),branch});
    const pr=await github(env,'POST','pulls',{
      title:'Review blog draft: '+post.title,
      head:branch,base:'main',draft:true,
      body:'Portal editorial record: '+post.id+
      '\n\n**REVIEW REQUIRED — DOES NOT PUBLISH.** The new Astro article has draft: true.'+
      '\n\nBefore merging: check source URLs, all factual statements, duplication, tone, structure, internal links and accessibility.'+
      '\nSwitch draft to false only after approval, run the build, merge, verify live URL, then update the portal.'+
      '\n\nThis operation is restricted to '+REPO+'.'
    });
    await env.DB.prepare("UPDATE editorial_posts SET github_pr_url=?,github_pr_number=?,updated_at=datetime('now') WHERE id=? AND github_pr_url=''")
      .bind(pr.html_url,pr.number,post.id).run();
    await env.DB.prepare('INSERT INTO audit_log (id,actor_email,event,client_id,resource_id) VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(),user.email,'editorial.github_draft_pr',post.client_id,post.id).run();
    return result({url:pr.html_url,number:pr.number,message:'Draft pull request prepared for human review. Nothing has been published.'},201);
  }catch(err){return formatError(err.message,502);}
}
