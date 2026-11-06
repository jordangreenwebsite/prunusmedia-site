// Prunus Media shared website-client portal.
// Deploy independently from the marketing site using client-portal/wrangler.jsonc.
// Cloudflare Worker: D1 (tenant-scoped records), private R2 (PDFs), Resend (OTP + notices).
const COOKIE = '__Host-prunus_session';
const WEEK = 7 * 86400;
const MAX_PDF = 5 * 1024 * 1024;
const encoder = new TextEncoder();

function response(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    ...extra
  }});
}
function error(message, status = 400) { return response({ ok: false, error: message }, status); }
function clean(v, n = 200) { return String(v ?? '').trim().slice(0, n); }
function normEmail(v) {
  const s = clean(v, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}
function isAdmin(email, env) {
  return String(env.ADMIN_EMAILS || '').split(',').map(x => normEmail(x)).includes(email);
}
async function sha(s) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(s));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(mac), b => b.toString(16).padStart(2, '0')).join('');
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function token() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}
function otp() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(100000 + (b[0] % 900000));
}
function sessionCookie(s, age = WEEK) {
  return COOKIE + '=' + s + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + age;
}
function currentCookie(request) {
  const pair = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
  return pair ? pair.slice(COOKIE.length + 1) : '';
}
async function parseJson(request, max = 30000) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw Error('type');
  const length = Number(request.headers.get('content-length') || 0);
  if (length > max) throw Error('size');
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > max) throw Error('size');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('data');
  return data;
}
function safeOrigin(request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  // A browser's same-origin fetch supplies Origin; strict Origin + Referer checking
  // prevents cross-site cookie POSTs while permitting test/admin API clients without Origin.
  if (origin) return origin === url.origin;
  const referer = request.headers.get('referer');
  if (referer) { try { return new URL(referer).origin === url.origin; } catch { return false; } }
  // No Origin/Referer: only permit non-browser API callers with explicit JSON,
  // but avoid cookie-authenticated writes from legacy cross-site form requests.
  return !request.headers.get('cookie');
}
async function actor(request, env) {
  const raw = currentCookie(request);
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const hashed = await sha(raw);
  const row = await env.DB.prepare('SELECT email FROM sessions WHERE token_hash=? AND expires_at>?').bind(hashed, Date.now()).first();
  return row ? { email: row.email, admin: isAdmin(row.email, env), token_hash: hashed } : null;
}
async function memberships(env, email) {
  return (await env.DB.prepare('SELECT c.id, c.slug, c.name, c.domain, m.role FROM client_members m JOIN clients c ON c.id=m.client_id WHERE m.email=? AND m.active=1 AND c.active=1 ORDER BY c.name').bind(email).all()).results;
}
async function access(env, user, id) {
  if (!user || !id) return false;
  if (user.admin) return !!(await env.DB.prepare('SELECT id FROM clients WHERE id=? AND active=1').bind(id).first());
  return !!(await env.DB.prepare('SELECT 1 FROM client_members m JOIN clients c ON c.id=m.client_id WHERE m.client_id=? AND m.email=? AND m.active=1 AND c.active=1').bind(id, user.email).first());
}
async function audit(env, email, event, clientId, resourceId) {
  await env.DB.prepare('INSERT INTO audit_log (id,actor_email,event,client_id,resource_id) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(), email, event, clientId || null, resourceId || null).run();
}
async function mail(env, to, subject, textBody) {
  if (!env.RESEND_API_KEY || !env.OTP_FROM_EMAIL) throw Error('Email delivery not configured');
  const sender = clean(env.OTP_FROM_EMAIL, 200);
  if (!/^[^@<>\s]+@([a-z0-9-]+\.)*prunusmedia\.com$/i.test(sender)) throw Error('Invalid Prunus sender');
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: {
    'content-type': 'application/json', authorization: 'Bearer ' + env.RESEND_API_KEY
  }, body: JSON.stringify({ from: 'Prunus Media <' + sender + '>', to: [to], subject, text: textBody }) });
  if (!res.ok) throw Error('Mail provider rejected request: ' + res.status);
}
async function notice(env, clientId, event, subject, body) {
  const destination = normEmail(env.ADMIN_NOTIFY_EMAIL || '');
  if (!destination) return;
  let status = 'sent', err = null;
  try { await mail(env, destination, subject, body); }
  catch (e) { status = 'failed'; err = clean(e.message, 200); console.error('Portal notification failed', event); }
  await env.DB.prepare('INSERT INTO notifications (id,client_id,event,status,error_message) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(), clientId, event, status, err).run();
}
function later(context, promise) {
  if (context && context.waitUntil) context.waitUntil(promise);
  else return promise;
}
async function requestCode(request, env) {
  let data; try { data = await parseJson(request, 1000); } catch { return error('Invalid email.', 400); }
  const email = normEmail(data.email);
  if (!email) return error('Enter a valid email address.');
  // Generic response does not disclose which customer emails are invited.
  const generic = response({ ok: true, message: 'If this address has portal access, a sign-in code will arrive shortly.' });
  const known = isAdmin(email, env) || !!(await env.DB.prepare('SELECT 1 FROM client_members m JOIN clients c ON c.id=m.client_id WHERE m.email=? AND m.active=1 AND c.active=1 LIMIT 1').bind(email).first());
  if (!known) return generic;
  const ip = clean(request.headers.get('cf-connecting-ip') || 'unknown', 100);
  const ipHash = await hmac(env.AUTH_PEPPER, ip);
  const windowStart = Math.floor(Date.now() / 3600000);
  await env.DB.prepare('INSERT INTO otp_ip_limits (ip_hash,window_start,requests) VALUES (?,?,1) ON CONFLICT(ip_hash,window_start) DO UPDATE SET requests=requests+1').bind(ipHash, windowStart).run();
  const rate = await env.DB.prepare('SELECT requests FROM otp_ip_limits WHERE ip_hash=? AND window_start=?').bind(ipHash, windowStart).first();
  if (rate.requests > 20) return generic;
  const existing = await env.DB.prepare('SELECT sent_at FROM login_codes WHERE email=?').bind(email).first();
  if (existing && Date.now() - existing.sent_at < 60000) return generic;
  const code = otp(), hash = await hmac(env.AUTH_PEPPER, email + ':' + code);
  await env.DB.prepare('INSERT INTO login_codes (email,code_hash,expires_at,attempts,sent_at) VALUES (?,?,?,0,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at')
    .bind(email, hash, Date.now() + 600000, Date.now()).run();
  try { await mail(env, email, 'Your Prunus Media sign-in code', 'Your Prunus Media client portal sign-in code is: ' + code + '\n\nIt expires in 10 minutes. If you did not ask for this, ignore this email. Never share your code.'); }
  catch (e) {
    console.error('Portal OTP delivery failed', clean(e.message, 120));
    await env.DB.prepare('DELETE FROM login_codes WHERE email=? AND code_hash=?').bind(email, hash).run();
  }
  return generic;
}
async function verifyCode(request, env) {
  let data; try { data = await parseJson(request, 1000); } catch { return error('Invalid code.'); }
  const email = normEmail(data.email), code = clean(data.code, 6);
  if (!email || !/^\d{6}$/.test(code)) return error('Enter the six-digit code.');
  const row = await env.DB.prepare('UPDATE login_codes SET attempts=attempts+1 WHERE email=? AND expires_at>? AND attempts<5 RETURNING code_hash').bind(email, Date.now()).first();
  if (!row || !equal(row.code_hash, await hmac(env.AUTH_PEPPER, email + ':' + code))) return error('Invalid or expired code.', 401);
  const consumed = await env.DB.prepare('DELETE FROM login_codes WHERE email=? AND code_hash=? RETURNING email').bind(email, row.code_hash).first();
  if (!consumed) return error('Code already used.', 401);
  if (!isAdmin(email, env) && !(await memberships(env, email)).length) return error('Account is not active.', 403);
  const raw = token();
  await env.DB.prepare('INSERT INTO sessions (token_hash,email,expires_at) VALUES (?,?,?)').bind(await sha(raw), email, Date.now() + WEEK * 1000).run();
  await audit(env, email, 'auth.login', null, null);
  return response({ ok: true }, 200, { 'set-cookie': sessionCookie(raw) });
}
async function listClients(env, user) {
  if (user.admin) return (await env.DB.prepare('SELECT id,slug,name,domain,contact_email,active FROM clients WHERE active=1 ORDER BY name').all()).results;
  return await memberships(env, user.email);
}
async function getDashboard(env, user, url) {
  const clientId = clean(url.searchParams.get('client'), 100);
  if (!(await access(env, user, clientId))) return error('Not found.', 404);
  const client = await env.DB.prepare('SELECT id,slug,name,domain,contact_email FROM clients WHERE id=?').bind(clientId).first();
  const leads = (await env.DB.prepare('SELECT id,full_name,email,phone,postcode,service,message,source_page,status,created_at FROM leads WHERE client_id=? ORDER BY created_at DESC LIMIT 100').bind(clientId).all()).results;
  const requests = (await env.DB.prepare('SELECT id,type,title,page_url,body,status,staff_note,file_name,file_size,created_at,updated_at FROM work_requests WHERE client_id=? ORDER BY created_at DESC LIMIT 100').bind(clientId).all()).results;
  const sites = (await env.DB.prepare('SELECT id,domain FROM sites WHERE client_id=? AND active=1').bind(clientId).all()).results;
  return response({ ok: true, client, leads, requests, sites });
}
async function createRequest(request, env, user, context, isBlog) {
  if (Number(request.headers.get('content-length') || 0) > 6200000) return error('Upload too large.', 413);
  let data, file = null;
  if (isBlog) {
    if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) return error('Expected a blog form.', 415);
    try {
      const form = await request.formData();
      data = Object.fromEntries(form.entries());
      file = form.get('file');
    } catch { return error('Invalid blog form.'); }
  } else {
    try { data = await parseJson(request, 10000); } catch { return error('Invalid change request.'); }
  }
  const clientId = clean(data.client_id, 100);
  if (!(await access(env, user, clientId))) return error('Not found.', 404);
  const title = clean(data.title, 150), body = clean(data.body, isBlog ? 30000 : 8000);
  const pageUrl = clean(data.page_url, 500);
  if (title.length < 4 || (!isBlog && body.length < 10)) return error('Please add a clear title and description.');
  if (pageUrl && !/^https?:\/\/[^ ]{4,}$/i.test(pageUrl) && !/^\/[a-z0-9/_#?=&.%+-]*$/i.test(pageUrl)) return error('Use a page URL or path.');
  if (isBlog && !body && !(file instanceof File && file.size > 0)) return error('Provide full blog text or a PDF.');
  const id = crypto.randomUUID();
  let fileKey = null, fileName = null, fileSize = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PDF) return error('PDF must be 5 MB or smaller.', 413);
    if (!/\.pdf$/i.test(file.name) || !['application/pdf','application/octet-stream',''].includes(file.type)) return error('Only PDF files are accepted.', 415);
    const buffer = await file.arrayBuffer(), signature = new Uint8Array(buffer.slice(0, 5));
    if (String.fromCharCode(...signature) !== '%PDF-') return error('The uploaded file is not a PDF.', 415);
    fileKey = clientId + '/' + id + '/' + crypto.randomUUID() + '.pdf';
    fileName = clean(file.name.replace(/[\r\n\\/"<>]/g, ''), 150);
    fileSize = file.size;
    await env.UPLOADS.put(fileKey, buffer, { httpMetadata: { contentType: 'application/pdf' } });
  }
  try {
    await env.DB.prepare('INSERT INTO work_requests (id,client_id,created_by,type,title,page_url,body,status,file_key,file_name,file_size) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, clientId, user.email, isBlog ? 'blog' : 'change', title, pageUrl || null, body || null, 'open', fileKey, fileName, fileSize).run();
    await audit(env, user.email, isBlog ? 'blog.created' : 'change.created', clientId, id);
  } catch (e) {
    if (fileKey) await env.UPLOADS.delete(fileKey);
    console.error('Portal work request database failure');
    return error('Could not save this request.', 500);
  }
  const kind = isBlog ? 'blog draft' : 'website change';
  later(context, notice(env, clientId, kind, 'New Prunus client ' + kind + ': ' + title, 'A client sent a new ' + kind + ' request.\nClient ID: ' + clientId + '\nTitle: ' + title + '\nOpen your Prunus client portal to review.'));
  return response({ ok: true, id, status: 'open', message: 'Received. Prunus will review your request before any website changes are published.' }, 201);
}
async function privatePdf(request, env, user, id) {
  const row = await env.DB.prepare('SELECT id,client_id,file_key,file_name FROM work_requests WHERE id=? AND type=?').bind(id,'blog').first();
  if (!row || !row.file_key || !(await access(env, user, row.client_id))) return error('Not found.', 404);
  const object = await env.UPLOADS.get(row.file_key);
  if (!object) return error('Not found.', 404);
  const name = (row.file_name || 'article.pdf').replace(/[^a-z0-9_. -]/gi, '_');
  return new Response(object.body, { headers: {
    'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="' + name + '"',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox"
  }});
}
async function createClient(request, env, user) {
  if (!user.admin) return error('Forbidden.', 403);
  let d; try { d = await parseJson(request, 2000); } catch { return error('Invalid client details.'); }
  const name = clean(d.name, 150), slug = clean(d.slug, 80).toLowerCase(),
    domain = clean(d.domain, 200).toLowerCase(), owner = normEmail(d.owner_email);
  if (name.length < 3 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || !owner) return error('Name, slug, domain and owner email are required.');
  const id = crypto.randomUUID(), siteId = crypto.randomUUID(), raw = token();
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO clients (id,slug,name,domain,contact_email) VALUES (?,?,?,?,?)').bind(id,slug,name,domain,owner),
      env.DB.prepare('INSERT INTO sites (id,client_id,domain) VALUES (?,?,?)').bind(siteId,id,domain),
      env.DB.prepare('INSERT INTO client_members (id,client_id,email,role) VALUES (?,?,?,?)').bind(crypto.randomUUID(),id,owner,'owner'),
      env.DB.prepare('INSERT INTO site_tokens (id,site_id,token_hash) VALUES (?,?,?)').bind(crypto.randomUUID(),siteId,await sha(raw))
    ]);
    await audit(env, user.email, 'client.created', id, siteId);
  } catch (e) {
    console.error('Client provisioning failed');
    return error('Unable to create client. Check duplicate name/domain.', 409);
  }
  return response({ ok: true, client_id: id, site_id: siteId, ingest_token: raw, message: 'Copy the site token now. It cannot be retrieved later.' }, 201);
}
async function addMember(request, env, user) {
  if (!user.admin) return error('Forbidden.',403);
  let d; try { d = await parseJson(request, 2000); } catch { return error('Invalid member.'); }
  const id = clean(d.client_id, 100), email = normEmail(d.email);
  if (!(await access(env,user,id)) || !email) return error('Invalid client/email.');
  await env.DB.prepare("INSERT INTO client_members (id,client_id,email,role) VALUES (?,?,?,'member') ON CONFLICT(client_id,email) DO UPDATE SET active=1")
    .bind(crypto.randomUUID(), id, email).run();
  await audit(env,user.email,'member.added',id,email);
  return response({ok:true});
}
async function rotateSiteToken(request,env,user,siteId) {
  if (!user.admin) return error('Forbidden.',403);
  const site = await env.DB.prepare('SELECT id,client_id FROM sites WHERE id=? AND active=1').bind(siteId).first();
  if (!site) return error('Not found.',404);
  const raw = token();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM site_tokens WHERE site_id=?').bind(siteId),
    env.DB.prepare('INSERT INTO site_tokens (id,site_id,token_hash) VALUES (?,?,?)').bind(crypto.randomUUID(),siteId,await sha(raw))
  ]);
  await audit(env,user.email,'site.token_rotated',site.client_id,siteId);
  return response({ok:true,ingest_token:raw,message:'Update the site secret immediately; the old token no longer works.'});
}
async function updateTicket(request,env,user,id) {
  if (!user.admin) return error('Forbidden.',403);
  let d; try { d = await parseJson(request, 1500); } catch { return error('Invalid update.'); }
  const status = clean(d.status,30), note = clean(d.staff_note,1000);
  if (!['open','working','awaiting-approval','complete'].includes(status)) return error('Invalid status.');
  const row = await env.DB.prepare('SELECT client_id FROM work_requests WHERE id=?').bind(id).first();
  if (!row) return error('Not found.',404);
  await env.DB.prepare("UPDATE work_requests SET status=?,staff_note=?,updated_at=datetime('now') WHERE id=?").bind(status,note,id).run();
  await audit(env,user.email,'request.status_changed',row.client_id,id);
  return response({ok:true});
}
async function updateLeadStatus(request, env, user, leadId) {
  let data;
  try { data = await parseJson(request, 500); }
  catch { return error('Invalid update.'); }
  const status = clean(data.status, 30);
  if (!['new', 'contacted', 'dealt-with'].includes(status)) return error('Invalid lead status.');
  const lead = await env.DB.prepare('SELECT id, client_id FROM leads WHERE id=?').bind(leadId).first();
  // Return the same result for missing and unauthorised leads to avoid revealing another tenant's IDs.
  if (!lead || !(await access(env, user, lead.client_id))) return error('Not found.', 404);
  await env.DB.prepare('UPDATE leads SET status=? WHERE id=? AND client_id=?')
    .bind(status, leadId, lead.client_id).run();
  await audit(env, user.email, 'lead.status_changed', lead.client_id, leadId);
  return response({ ok: true, id: leadId, status });
}

async function ingest(request, env) {
  const bearer = request.headers.get('authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(bearer)) return error('Unauthorized.',401);
  const hashed = await sha(bearer.slice(7));
  const site = await env.DB.prepare('SELECT s.id,s.client_id FROM site_tokens t JOIN sites s ON s.id=t.site_id JOIN clients c ON c.id=s.client_id WHERE t.token_hash=? AND s.active=1 AND c.active=1').bind(hashed).first();
  if (!site) return error('Unauthorized.',401);
  let d; try { d=await parseJson(request, 12000); } catch { return error('Invalid lead.'); }
  const externalId = clean(d.external_id,100), name=clean(d.name,120), email=normEmail(d.email),
    phone=clean(d.phone,50),postcode=clean(d.postcode,20),service=clean(d.service,160),
    message=clean(d.message,5000),source=clean(d.source_page,300);
  if (!/^[a-zA-Z0-9._:-]{8,100}$/.test(externalId) || name.length<2 || !phone || !source.startsWith('/')) return error('Invalid lead data.');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO leads (id,client_id,site_id,external_id,full_name,email,phone,postcode,service,message,source_page) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(site_id,external_id) DO NOTHING')
    .bind(id,site.client_id,site.id,externalId,name,email||null,phone,postcode,service,message,source).run();
  return response({ok:true},201);
}
export default {
  async fetch(request,env,context) {
    const url=new URL(request.url), path=url.pathname;
    if (!path.startsWith('/api/')) {
      if (!env.ASSETS) return error('Portal assets not configured.',503);
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set('x-content-type-options','nosniff');
      headers.set('referrer-policy','strict-origin-when-cross-origin');
      headers.set('x-frame-options','DENY');
      if ((headers.get('content-type')||'').includes('text/html')) {
        headers.set('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
        headers.set('cache-control','no-store');
      }
      return new Response(asset.body,{status:asset.status,headers});
    }
    if (!env.DB || !env.AUTH_PEPPER || !env.UPLOADS) return error('Portal backend is not configured.',503);
    try {
      const method=request.method;
      if (path==='/api/ingest/lead' && method==='POST') return await ingest(request,env);
      if (method!=='GET' && !safeOrigin(request)) return error('Origin not permitted.',403);
      if (path==='/api/auth/request-code' && method==='POST') return await requestCode(request,env);
      if (path==='/api/auth/verify' && method==='POST') return await verifyCode(request,env);
      const user=await actor(request,env);
      if (!user) return error('Sign in required.',401);
      if (path==='/api/auth/logout' && method==='POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();
        return response({ok:true},200,{'set-cookie':sessionCookie('',0)});
      }
      if (path==='/api/session' && method==='GET') return response({ok:true,email:user.email,admin:user.admin,clients:await listClients(env,user)});
      if (path==='/api/dashboard' && method==='GET') return await getDashboard(env,user,url);
      const leadStatus=path.match(/^\/api\/leads\/([a-f0-9-]{36})\/status$/);
      if (leadStatus && method==='PATCH') return await updateLeadStatus(request,env,user,leadStatus[1]);
      if (path==='/api/requests/change' && method==='POST') return await createRequest(request,env,user,context,false);
      if (path==='/api/requests/blog' && method==='POST') return await createRequest(request,env,user,context,true);
      const file = path.match(/^\/api\/files\/([a-f0-9-]{36})$/);
      if (file && method==='GET') return await privatePdf(request,env,user,file[1]);
      if (path==='/api/admin/notifications' && method==='GET') {
        if (!user.admin) return error('Forbidden.',403);
        const failed=(await env.DB.prepare("SELECT n.event,n.error_message,n.created_at,c.name AS client_name FROM notifications n LEFT JOIN clients c ON c.id=n.client_id WHERE n.status='failed' ORDER BY n.created_at DESC LIMIT 25").all()).results;
        return response({ok:true,failed});
      }
      if (path==='/api/admin/clients' && method==='POST') return await createClient(request,env,user);
      if (path==='/api/admin/members' && method==='POST') return await addMember(request,env,user);
      const rotate=path.match(/^\/api\/admin\/sites\/([a-f0-9-]{36})\/rotate$/);
      if (rotate && method==='POST') return await rotateSiteToken(request,env,user,rotate[1]);
      const ticket=path.match(/^\/api\/admin\/requests\/([a-f0-9-]{36})$/);
      if (ticket && method==='PATCH') return await updateTicket(request,env,user,ticket[1]);
      return error('Not found.',404);
    } catch (e) {
      console.error('Portal request failed',path,clean(e.message,150));
      return error('Unable to complete the request.',500);
    }
  },
  // Daily cleanup of short-lived authentication data. Leads/uploads are retained only
  // under the separately agreed customer data-retention policy, never auto-deleted here.
  async scheduled(_event,env) {
    if (!env.DB) return;
    const now=Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),
      env.DB.prepare('DELETE FROM login_codes WHERE expires_at<?').bind(now),
      env.DB.prepare('DELETE FROM otp_ip_limits WHERE window_start<?').bind(Math.floor(now/3600000)-48)
    ]);
  }
};
