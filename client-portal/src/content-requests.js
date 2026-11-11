// Private client content requests: one submission, optional mixed image/PDF files.
// Kept in the existing tenant-scoped D1 + private R2; no public object URLs.
const respond=(body,status=200)=>new Response(JSON.stringify({ok:status<400,...body}),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
const clean=(v,max=500)=>String(v??'').trim().slice(0,max);
function supported(file,bytes){
  const u=new Uint8Array(bytes.slice(0,16)),name=file.name||'';
  if(/\.pdf$/i.test(name)&&String.fromCharCode(...u.slice(0,5))==='%PDF-')return 'application/pdf';
  if(/\.(jpe?g)$/i.test(name)&&u[0]===255&&u[1]===216&&u[2]===255)return 'image/jpeg';
  if(/\.png$/i.test(name)&&u.slice(0,8).every((x,i)=>x===[137,80,78,71,13,10,26,10][i]))return 'image/png';
  if(/\.webp$/i.test(name)&&String.fromCharCode(...u.slice(0,4))==='RIFF'&&String.fromCharCode(...u.slice(8,12))==='WEBP')return 'image/webp';
  return '';
}
async function canAccess(env,user,id){
  const c=await env.DB.prepare('SELECT id,allow_client_uploads FROM clients WHERE id=? AND active=1').bind(id).first();
  if(!c)return null;
  if(user.admin)return c;
  const member=await env.DB.prepare('SELECT 1 FROM client_members WHERE client_id=? AND email=? AND active=1')
    .bind(id,user.email).first();
  return member?c:null;
}
async function submit(request,env,user,notify){
  if(Number(request.headers.get('content-length')||0)>25*1024*1024)return respond({error:'Attachments exceed the 20 MB upload limit.'},413);
  if(!(request.headers.get('content-type')||'').includes('multipart/form-data'))return respond({error:'Use the content request form.'},415);
  let form;
  try{form=await request.formData();}catch{return respond({error:'Unable to read form.'},400);}
  const clientId=clean(form.get('client_id'),100),client=await canAccess(env,user,clientId);
  if(!client)return respond({error:'Not found.'},404);
  const title=clean(form.get('title'),150),description=clean(form.get('description'),9000);
  const purpose=clean(form.get('purpose'),30),page=clean(form.get('page_url'),500);
  const allowed=['blog','page','photos','other'];
  if(!allowed.includes(purpose))return respond({error:'Choose the content request type.'},400);
  if(title.length<4||description.length<10)return respond({error:'Add a title and tell us what you need.'},400);
  if(page&&!(/^https:\/\/[^\s]{4,}$/i.test(page)||/^\/[a-z0-9/_#?=&.%+-]*$/i.test(page)))
    return respond({error:'Use a valid HTTPS page URL or relative page path.'},400);
  const files=form.getAll('files').filter(x=>x instanceof File && x.size>0);
  if(files.length>4)return respond({error:'Upload up to four files per request.'},413);
  if(files.length&&!user.admin&&!client.allow_client_uploads)return respond({error:'Uploads are disabled for this business.'},403);
  const total=files.reduce((sum,f)=>sum+f.size,0);
  if(total>20*1024*1024||files.some(f=>f.size>8*1024*1024||f.size<8))
    return respond({error:'Each file must be under 8 MB, total 20 MB.'},413);
  const ticketId=crypto.randomUUID();
  const stored=[];
  try{
    for(const file of files){
      const bytes=await file.arrayBuffer(),type=supported(file,bytes);
      if(!type)throw Error('Choose only PDF, JPG, PNG or WebP files.');
      const name=clean(file.name.replace(/[\r\n\\/"<>]/g,''),150);
      if(!name)throw Error('Invalid file name.');
      const id=crypto.randomUUID(),key=clientId+'/requests/'+ticketId+'/'+id;
      await env.UPLOADS.put(key,bytes,{httpMetadata:{contentType:type}});
      stored.push({id,key,name,type,size:file.size});
    }
  }catch(error){
    for(const file of stored){try{await env.UPLOADS.delete(file.key);}catch{}}
    return respond({error:error.message==='Choose only PDF, JPG, PNG or WebP files.'?error.message:'Could not save the attachment. Try again.'},415);
  }
  const details='Content type: '+purpose+'\n\n'+description;
  try{
    await env.DB.batch([
      env.DB.prepare('INSERT INTO work_requests (id,client_id,created_by,type,title,page_url,body,status) VALUES (?,?,?,?,?,?,?,?)')
        .bind(ticketId,clientId,user.email,'blog',title,page||null,details,'open'),
      ...stored.map(f=>env.DB.prepare('INSERT INTO request_attachments (id,request_id,client_id,file_key,file_name,file_type,file_size,uploaded_by) VALUES (?,?,?,?,?,?,?,?)')
        .bind(f.id,ticketId,clientId,f.key,f.name,f.type,f.size,user.email)),
      env.DB.prepare('INSERT INTO audit_log (id,actor_email,event,client_id,resource_id) VALUES (?,?,?,?,?)')
        .bind(crypto.randomUUID(),user.email,'content.request_created',clientId,ticketId)
    ]);
  }catch{
    for(const file of stored){try{await env.UPLOADS.delete(file.key);}catch{}}
    return respond({error:'Unable to save the request.'},500);
  }
  if(notify) {
    try{await notify(clientId,'content.request','New client content request: '+title,
      'A new content request was submitted.\nBusiness ID: '+clientId+'\nTitle: '+title+'\nOpen the client portal for details.');}
    catch{}
  }
  return respond({id:ticketId,status:'open',files:stored.length,message:'Content request received. Your website team will review it.'},201);
}
async function attachment(env,user,id){
  const row=await env.DB.prepare('SELECT * FROM request_attachments WHERE id=?').bind(id).first();
  if(!row||!(await canAccess(env,user,row.client_id)))return respond({error:'Not found.'},404);
  const object=await env.UPLOADS.get(row.file_key);
  if(!object)return respond({error:'Not found.'},404);
  const name=row.file_name.replace(/[^a-z0-9_. -]/gi,'_');
  return new Response(object.body,{headers:{
    'content-type':row.file_type,'content-disposition':'attachment; filename="'+name+'"',
    'cache-control':'private, no-store','x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; sandbox"
  }});
}
export async function contentRequestRoutes(request,env,user,url,notify){
  if(url.pathname==='/api/content-requests'&&request.method==='POST')return submit(request,env,user,notify);
  const match=url.pathname.match(/^\/api\/content-attachments\/([a-f0-9-]{36})$/);
  if(match&&request.method==='GET')return attachment(env,user,match[1]);
  return null;
}
