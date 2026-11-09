// Shared, tenant-scoped editorial and private upload API.
// This Worker is an editorial queue, not an automated publisher.
const json = (value, status = 200) => new Response(JSON.stringify({ok:true,...value}), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
const bad = (message, status = 400) => new Response(JSON.stringify({ok:false,error:message}), {
  status, headers: {'content-type':'application/json','cache-control':'no-store'}
});
const str = (v,n=200) => String(v ?? '').trim().slice(0,n);
const id = () => crypto.randomUUID();
const adminOnly = user => user && user.admin;
async function canRead(env,user,clientId) {
  if (!clientId || !user) return false;
  if (user.admin) return !!(await env.DB.prepare('SELECT id FROM clients WHERE id=? AND active=1').bind(clientId).first());
  return !!(await env.DB.prepare('SELECT 1 FROM client_members m JOIN clients c ON c.id=m.client_id WHERE c.id=? AND c.active=1 AND m.email=? AND m.active=1').bind(clientId,user.email).first());
}
async function flags(env,clientId) {
  return env.DB.prepare('SELECT id,brand,industry,service_area,voice_notes,requires_blog_approval,allow_client_ideas,allow_client_uploads,search_console_url FROM clients WHERE id=? AND active=1').bind(clientId).first();
}
async function bodyJson(request,max=100000) {
  if (!(request.headers.get('content-type')||'').startsWith('application/json')) throw Error('JSON required');
  const raw=await request.text();
  if (new TextEncoder().encode(raw).byteLength>max) throw Error('Request too large');
  const data=JSON.parse(raw);
  if (!data || Array.isArray(data) || typeof data!=='object') throw Error('Invalid data');
  return data;
}
async function log(env,user,event,clientId,resourceId) {
  await env.DB.prepare('INSERT INTO audit_log (id,actor_email,event,client_id,resource_id) VALUES (?,?,?,?,?)')
    .bind(id(),user.email,event,clientId,resourceId).run();
}
function topicKey(title) {return title.toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g,' ').trim();}
function validSourceSet(input) {
  if (!Array.isArray(input) || input.length>12) return null;
  const result=[];
  for (const s of input) {
    if (!s || typeof s!=='object') return null;
    const url=str(s.url,700), title=str(s.title,180), checked=str(s.checked_at,10);
    try {
      const u=new URL(url);
      if (u.protocol!=='https:' || u.username || u.password || !u.hostname.includes('.')) return null;
    } catch {return null;}
    if (title.length<3 || !/^\d{4}-\d{2}-\d{2}$/.test(checked)) return null;
    result.push({url,title,checked_at:checked});
  }
  return result;
}
function dateTime(s) { return typeof s==='string' && /^\d{4}-\d{2}-\d{2}T\d\d:\d\d/.test(s) && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : ''; }
const EDITORIAL_STATUSES=['idea','research','draft','internal-review','client-review','approved','scheduled','published','rejected'];
function quality(row) {
  const sources=JSON.parse(row.sources_json||'[]');
  const firstParty=/first.party|original evidence|interview|own photos|client records/i.test(row.evidence_note||'');
  if ((row.brief||'').length<60 || (row.draft||'').length<500 || (row.evidence_note||'').length<30 || !((sources.length>0)||firstParty)) {
    return 'Before review or scheduling, add a detailed brief, a complete draft, verified sources or documented first-party evidence, and an evidence note.';
  }
  return '';
}
async function getEditorial(env,user,clientId) {
  if (!(await canRead(env,user,clientId))) return bad('Not found.',404);
  const config=await flags(env,clientId);
  const posts=(await env.DB.prepare('SELECT * FROM editorial_posts WHERE client_id=? ORDER BY CASE WHEN status=? THEN 0 ELSE 1 END,created_at DESC LIMIT 250').bind(clientId,'client-review').all()).results;
  if (!user.admin) {
    for (const p of posts) {
      // Drafts in progress remain internal until explicitly released to the client.
      if (!['client-review','approved','scheduled','published'].includes(p.status)) {
        p.draft='';
        p.sources_json='[]';
        p.evidence_note='';
        p.review_note='';
      }
    }
  }
  return json({config,posts});
}
async function addEditorial(request,env,user) {
  let d;try{d=await bodyJson(request,40000);}catch{return bad('Invalid idea or draft.');}
  const clientId=str(d.client_id,100);
  if (!(await canRead(env,user,clientId)))return bad('Not found.',404);
  const config=await flags(env,clientId);
  if (!user.admin && !config.allow_client_ideas)return bad('Blog suggestions are disabled for this account.',403);
  const title=str(d.title,180), key=topicKey(title), question=str(d.audience_question,500);
  if (title.length<8 || key.length<8 || !question)return bad('Enter a specific title and the question the article should answer.');
  const ownerId=id(), status=user.admin && d.status==='draft'?'draft':'idea';
  const draft=user.admin?str(d.draft,70000):'';
  const brief=user.admin?str(d.brief,12000):'';
  try {
    await env.DB.prepare('INSERT INTO editorial_posts (id,client_id,topic_key,title,suggested_by,audience_question,target_query,brief,draft,status,requires_approval) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(ownerId,clientId,key,title,user.email,question,user.admin?str(d.target_query,180):'',brief,draft,status,config.requires_blog_approval?1:0).run();
    await log(env,user,'editorial.idea_created',clientId,ownerId);
  } catch {return bad('This topic already exists in this client editorial calendar. Review it rather than adding a duplicate.',409);}
  return json({id:ownerId,status},201);
}
async function patchEditorial(request,env,user,postId) {
  if (!adminOnly(user))return bad('Forbidden.',403);
  const old=await env.DB.prepare('SELECT * FROM editorial_posts WHERE id=?').bind(postId).first();
  if (!old)return bad('Not found.',404);
  let d;try{d=await bodyJson(request,100000);}catch{return bad('Invalid editorial changes.');}
  const status=str(d.status||old.status,30);
  if (!EDITORIAL_STATUSES.includes(status))return bad('Invalid stage.');
  if (old.status==='published' && status!=='published')return bad('Published records are immutable. Create a separate revision request.');
  const brief=d.brief===undefined?old.brief:str(d.brief,12000),
    draft=d.draft===undefined?old.draft:str(d.draft,70000),
    note=d.evidence_note===undefined?old.evidence_note:str(d.evidence_note,12000),
    query=d.target_query===undefined?old.target_query:str(d.target_query,180),
    reviewNote=d.review_note===undefined?old.review_note:str(d.review_note,2000);
  const sources=d.sources===undefined?JSON.parse(old.sources_json||'[]'):validSourceSet(d.sources);
  if (!sources)return bad('Each source needs an HTTPS URL, title and checked_at date (YYYY-MM-DD).');
  const schedule=d.scheduled_at===undefined?old.scheduled_at:dateTime(d.scheduled_at);
  if (d.scheduled_at && !schedule)return bad('Provide a valid scheduled date and time.');
  const publishedUrl=d.published_url===undefined?old.published_url:str(d.published_url,700);
  if (publishedUrl) {
    try{const u=new URL(publishedUrl);if(u.protocol!=='https:'||!u.hostname.includes('.'))return bad('Published URL must use HTTPS.');}
    catch{return bad('Invalid published URL.');}
  }
  const updated={...old,brief,draft,evidence_note:note,sources_json:JSON.stringify(sources)};
  if (['client-review','approved','scheduled','published'].includes(status)) {
    const fail=quality(updated);if(fail)return bad(fail);
  }
  if (status==='client-review' && !old.requires_approval)return bad('Client approval is disabled for this article. Use internal review instead.');
  const contentChanged = brief!==old.brief || draft!==old.draft || note!==old.evidence_note || JSON.stringify(sources)!==old.sources_json;
  if (contentChanged && old.approved_at && ['scheduled','published','approved'].includes(status))
    return bad('This article has changed since client approval. Return it for client review.');
  const approvedAt=contentChanged?null:old.approved_at;
  if (['scheduled','published'].includes(status) && old.requires_approval && !approvedAt)
    return bad('The client must approve this exact draft first.');
  if (status==='scheduled' && (!schedule || Date.parse(schedule)<Date.now()))return bad('Choose a future scheduled date.');
  if (status==='published' && !publishedUrl)return bad('Confirm the real live article URL before recording publication.');
  if (status==='published' && !['scheduled','approved','internal-review'].includes(old.status))return bad('Review and approve the draft before marking it published.');
  await env.DB.prepare("UPDATE editorial_posts SET brief=?,draft=?,target_query=?,sources_json=?,evidence_note=?,review_note=?,status=?,scheduled_at=?,published_url=?,approved_at=?,approved_by=CASE WHEN ?=1 THEN NULL ELSE approved_by END,updated_at=datetime('now') WHERE id=?")
    .bind(brief,draft,query,JSON.stringify(sources),note,reviewNote,status,schedule||null,publishedUrl||null,approvedAt,contentChanged?1:0,postId).run();
  await log(env,user,'editorial.updated.'+status,old.client_id,postId);
  return json({id:postId,status,message:'Editorial record saved. Scheduling does not publish the article.'});
}
async function decideEditorial(request,env,user,postId) {
  const post=await env.DB.prepare('SELECT id,client_id,status,requires_approval FROM editorial_posts WHERE id=?').bind(postId).first();
  if (!post || !(await canRead(env,user,post.client_id)))return bad('Not found.',404);
  if (user.admin)return bad('Client approval must come from a client account.',403);
  if (!post.requires_approval || post.status!=='client-review')return bad('This article is not awaiting your approval.',409);
  let d;try{d=await bodyJson(request,3000);}catch{return bad('Invalid decision.');}
  const approve=d.approve===true;
  const note=str(d.note,1500);
  if (!approve && note.length<5)return bad('Tell Prunus what needs changing.');
  // Conditional update prevents repeat clicks from approving a changed article.
  const result=await env.DB.prepare("UPDATE editorial_posts SET status=?,approved_by=?,approved_at=?,review_note=?,updated_at=datetime('now') WHERE id=? AND status='client-review' RETURNING id")
    .bind(approve?'approved':'draft',approve?user.email:null,approve?new Date().toISOString():null,note,postId).first();
  if (!result)return bad('Article has already changed.',409);
  await log(env,user,approve?'editorial.client_approved':'editorial.client_changes',post.client_id,postId);
  return json({status:approve?'approved':'draft'});
}
async function changeClientSettings(request,env,user,clientId) {
  if (!user.admin)return bad('Forbidden.',403);
  if (!(await flags(env,clientId)))return bad('Not found.',404);
  let d;try{d=await bodyJson(request,6000);}catch{return bad('Invalid client settings.');}
  const brand=['prunus','uk-trades'].includes(d.brand)?d.brand:null;
  if (!brand)return bad('Choose Prunus Media or UK Trade Websites.');
  let gsc=str(d.search_console_url,600);
  if (gsc && !/^https:\/\/search\.google\.com\/search-console(\/|$|\?)/.test(gsc))return bad('Use an official Google Search Console URL.');
  await env.DB.prepare('UPDATE clients SET brand=?,industry=?,service_area=?,voice_notes=?,requires_blog_approval=?,allow_client_ideas=?,allow_client_uploads=?,search_console_url=? WHERE id=?')
    .bind(brand,str(d.industry,160),str(d.service_area,350),str(d.voice_notes,2000),
      d.requires_blog_approval===true?1:0,d.allow_client_ideas===true?1:0,d.allow_client_uploads===true?1:0,gsc,clientId).run();
  await log(env,user,'client.preferences_changed',clientId,clientId);
  return json({message:'Client preferences saved. Existing article approval requirements are unchanged.'});
}
function fileKind(file,bytes) {
  const x=new Uint8Array(bytes.slice(0,16)), a=Array.from(x);
  if (/\.pdf$/i.test(file.name) && String.fromCharCode(...a.slice(0,5))==='%PDF-')return 'application/pdf';
  if (/\.(png)$/i.test(file.name) && a.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')return 'image/png';
  if (/\.(jpg|jpeg)$/i.test(file.name) && a[0]===255 && a[1]===216 && a[2]===255)return 'image/jpeg';
  if (/\.webp$/i.test(file.name) && String.fromCharCode(...a.slice(0,4))==='RIFF' && String.fromCharCode(...a.slice(8,12))==='WEBP')return 'image/webp';
  return '';
}
async function addUpload(request,env,user) {
  if (!(request.headers.get('content-type')||'').includes('multipart/form-data'))return bad('Use a file upload.');
  if (Number(request.headers.get('content-length')||0)>11500000)return bad('File is too large.',413);
  let form;try{form=await request.formData();}catch{return bad('Invalid file upload.');}
  const clientId=str(form.get('client_id'),100);
  if (!(await canRead(env,user,clientId)))return bad('Not found.',404);
  const config=await flags(env,clientId);
  if (!user.admin && !config.allow_client_uploads)return bad('Uploads are disabled for this account.',403);
  const file=form.get('file');
  if (!(file instanceof File)||file.size<8||file.size>8*1024*1024)return bad('Choose a PDF, JPG, PNG or WebP file up to 8 MB.',413);
  const bytes=await file.arrayBuffer(), type=fileKind(file,bytes);
  if (!type)return bad('The file type or file contents are not supported.',415);
  const uploadId=id(),key=clientId+'/assets/'+uploadId, filename=str(file.name.replace(/[\r\n\\/"<>]/g,''),150);
  await env.UPLOADS.put(key,bytes,{httpMetadata:{contentType:type}});
  try {
    await env.DB.prepare('INSERT INTO client_uploads (id,client_id,uploaded_by,file_key,file_name,file_type,file_size,notes) VALUES (?,?,?,?,?,?,?,?)')
      .bind(uploadId,clientId,user.email,key,filename,type,file.size,str(form.get('notes'),2000)).run();
    await log(env,user,'upload.created',clientId,uploadId);
  } catch(e){await env.UPLOADS.delete(key);throw e;}
  return json({id:uploadId,message:'File uploaded privately for Prunus to review.'},201);
}
async function listUploads(env,user,clientId) {
  if (!(await canRead(env,user,clientId)))return bad('Not found.',404);
  const entries=(await env.DB.prepare('SELECT id,file_name,file_type,file_size,notes,uploaded_by,created_at FROM client_uploads WHERE client_id=? ORDER BY created_at DESC LIMIT 200').bind(clientId).all()).results;
  return json({entries});
}
async function downloadUpload(env,user,uploadId) {
  const row=await env.DB.prepare('SELECT * FROM client_uploads WHERE id=?').bind(uploadId).first();
  if (!row || !(await canRead(env,user,row.client_id)))return bad('Not found.',404);
  const object=await env.UPLOADS.get(row.file_key);
  if (!object)return bad('Not found.',404);
  return new Response(object.body,{headers:{'content-type':'application/octet-stream',
    'content-disposition':'attachment; filename="'+row.file_name.replace(/[^a-z0-9_. -]/gi,'_')+'"',
    'cache-control':'private, no-store','x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; sandbox"}});
}
function weekMonday(now=new Date()) {
  const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  return d.toISOString().slice(0,10);
}
export async function enqueueWeeklyResearch(env) {
  if (!env.DB)return 0;
  const week=weekMonday();
  const clients=(await env.DB.prepare('SELECT id FROM clients WHERE active=1').all()).results;
  let count=0;
  for (const c of clients) {
    const row=await env.DB.prepare('INSERT OR IGNORE INTO research_jobs (id,client_id,week_start) VALUES (?,?,?)')
      .bind(id(),c.id,week).run();
    count+=Number(row.meta?.changes||0);
  }
  return count;
}
async function overview(env,user) {
  if (!user.admin)return bad('Forbidden.',403);
  const clients=(await env.DB.prepare("SELECT c.id,c.name,c.domain,c.brand,c.industry,c.service_area,c.requires_blog_approval,c.search_console_url,(SELECT COUNT(*) FROM leads l WHERE l.client_id=c.id) lead_total,(SELECT COUNT(*) FROM leads l WHERE l.client_id=c.id AND l.created_at>=datetime('now','-30 days')) lead_last30,(SELECT COUNT(*) FROM editorial_posts e WHERE e.client_id=c.id AND e.status NOT IN ('published','rejected')) blog_open,(SELECT COUNT(*) FROM editorial_posts e WHERE e.client_id=c.id AND e.status='client-review') awaiting_approval,(SELECT COUNT(*) FROM client_uploads f WHERE f.client_id=c.id) uploads FROM clients c WHERE c.active=1 ORDER BY c.name").all()).results;
  // Do not expose names, messages, phone numbers, emails or full postcodes in admin reporting.
  const leadRows=(await env.DB.prepare("SELECT client_id,postcode,substr(created_at,1,10) day FROM leads WHERE created_at>=datetime('now','-90 days') ORDER BY created_at DESC LIMIT 3000").all()).results;
  const summary=new Map();
  for (const l of leadRows) {
    const postcode=str(l.postcode,20).toUpperCase().replace(/\s+/g,'');
    const match=postcode.match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)[0-9][A-Z]{2}$/);
    const area=match?match[1]:'Unspecified';
    const key=l.client_id+'|'+l.day+'|'+area;
    const e=summary.get(key)||{client_id:l.client_id,day:l.day,area,count:0};
    e.count++;summary.set(key,e);
  }
  const queued=(await env.DB.prepare("SELECT j.id,j.client_id,c.name AS client_name,j.week_start,j.status,j.research_note FROM research_jobs j JOIN clients c ON c.id=j.client_id WHERE j.status IN ('queued','working','failed') ORDER BY j.week_start DESC,c.name LIMIT 200").all()).results;
  return json({clients,lead_areas:[...summary.values()],research_queue:queued});
}
async function editResearch(request,env,user,jobId) {
  if (!user.admin)return bad('Forbidden.',403);
  const job=await env.DB.prepare('SELECT id,client_id FROM research_jobs WHERE id=?').bind(jobId).first();
  if (!job)return bad('Not found.',404);
  let d;try{d=await bodyJson(request,6000);}catch{return bad('Invalid research update.');}
  const status=str(d.status,30),note=str(d.research_note,4000);
  if (!['queued','working','complete','failed'].includes(status))return bad('Invalid research status.');
  if (status==='complete' && note.length<30)return bad('Record the research sources and findings before completing a job.');
  await env.DB.prepare("UPDATE research_jobs SET status=?,research_note=?,updated_at=datetime('now') WHERE id=?").bind(status,note,jobId).run();
  await log(env,user,'research.updated.'+status,job.client_id,jobId);
  return json({status});
}
export async function extraRoutes(request,env,user,url) {
  const path=url.pathname,method=request.method;
  if (path==='/api/admin/overview' && method==='GET')return overview(env,user);
  if (path==='/api/admin/research/queue' && method==='POST') {
    if (!user.admin)return bad('Forbidden.',403);
    return json({queued:await enqueueWeeklyResearch(env)});
  }
  const research=path.match(/^\/api\/admin\/research\/([a-f0-9-]{36})$/);
  if (research && method==='PATCH')return editResearch(request,env,user,research[1]);
  const settings=path.match(/^\/api\/admin\/clients\/([a-f0-9-]{36})\/settings$/);
  if (settings && method==='PATCH')return changeClientSettings(request,env,user,settings[1]);
  if (path==='/api/editorial' && method==='GET')return getEditorial(env,user,str(url.searchParams.get('client'),100));
  if (path==='/api/editorial' && method==='POST')return addEditorial(request,env,user);
  const post=path.match(/^\/api\/admin\/editorial\/([a-f0-9-]{36})$/);
  if (post && method==='PATCH')return patchEditorial(request,env,user,post[1]);
  const decision=path.match(/^\/api\/editorial\/([a-f0-9-]{36})\/decision$/);
  if (decision && method==='POST')return decideEditorial(request,env,user,decision[1]);
  if (path==='/api/uploads' && method==='GET')return listUploads(env,user,str(url.searchParams.get('client'),100));
  if (path==='/api/uploads' && method==='POST')return addUpload(request,env,user);
  const upload=path.match(/^\/api\/uploads\/([a-f0-9-]{36})$/);
  if (upload && method==='GET')return downloadUpload(env,user,upload[1]);
  return null;
}
