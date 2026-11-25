// Owner-only editorial calendar. Plan data is not executable and cannot trigger provider writes.
import {marketingOwner,marketingHtml,marketingEscape as e} from './marketing-studio.js';
const SOURCE='https://api.github.com/repos/jordangreenwebsite/business-os/contents/growth/marketing-plan.json?ref=main';
const brands={'prunus-media':'Prunus Media','uk-trade-websites':'UK Trade Websites','j-piper-cleaning':'J Piper Cleaning','response-training':'Response Training','jo-response-training':"Jo · Response Training",'michal-rebekah-art':'Michal Rebekah Art','prunus-certificates':'Prunus Certificates','window-cleaning-calculator':'Window Cleaning Calculator','residential-roofing':'Residential Roofing','pp-power-detailing':'PP Power Detailing'};
const platforms={'facebook':'Facebook','instagram':'Instagram','linkedin':'LinkedIn','tiktok':'TikTok','google-photos':'Google · fresh photos','agency-facebook':'Agency Facebook (destination unverified)'};
const own=(o,k)=>typeof k==='string'&&Object.hasOwn(o,k);
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const str=(v,n,empty=false)=>typeof v==='string'&&v.length<=n&&(empty||!!v.trim());
export function validateMarketingPlan(q){
 if(q?.version!==2||!iso(q.week_of)||!iso(q.prepared_on)||!Array.isArray(q.items)||q.items.length>200)throw Error('Invalid plan');
 const start=new Date(q.week_of+'T00:00:00Z');if(start.getUTCDay()!==1)throw Error('Invalid week');
 const end=new Date(start.getTime()+6*86400000).toISOString().slice(0,10),seen=new Set();
 const items=q.items.map(x=>{
  if(!x||typeof x.id!=='string'||!/^[a-z0-9][a-z0-9-]{1,119}$/.test(x.id)||seen.has(x.id)||!own(brands,x.brand)||!own(platforms,x.platform)||!iso(x.planned_date)||x.planned_date<q.week_of||x.planned_date>end||!['held','ready-for-review'].includes(x.status)||!str(x.title,200)||!str(x.copy,4000,x.platform==='google-photos')||!str(x.evidence,2000)||!str(x.creative,1000)||!str(x.source_key,200)||!str(x.hold_reason,1000,x.status!=='held'))throw Error('Invalid plan item');
  // A Google photograph is never represented as a promotional text post.
  if(x.platform==='google-photos'&&x.copy.trim())throw Error('Google photo-only policy');
  seen.add(x.id);return {id:x.id,brand:x.brand,platform:x.platform,planned_date:x.planned_date,title:x.title,copy:x.copy,evidence:x.evidence,creative:x.creative,source_key:x.source_key,status:x.status,hold_reason:x.hold_reason};
 });
 return {week_of:q.week_of,prepared_on:q.prepared_on,items};
}
async function loadPlan(env,fetcher){
 const token=String(env.BLOG_SCHEDULE_READ_TOKEN||'').trim();if(!token)return null;
 try{const r=await fetcher(SOURCE,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github.raw+json','User-Agent':'Prunus-Portal'},redirect:'manual',signal:AbortSignal.timeout(8000)});if(!r.ok)return null;const body=await r.text();if(body.length>1000000)return null;return validateMarketingPlan(JSON.parse(body));}catch{return null;}
}
export async function marketingCalendar(request,env,user,fetcher=fetch){
 if(request.method!=='GET')return marketingHtml('<h1>Method not allowed</h1>',405);
 if(!user)return marketingHtml('<h1>Sign in required</h1>',401);
 if(!marketingOwner(user,env))return marketingHtml('<h1>Access not available</h1>',403);
 const back='<p><a href="/marketing-studio">Back to Marketing Studio</a></p><h1>Marketing calendar</h1>';
 const q=await loadPlan(env,fetcher);if(!q)return marketingHtml(back+'<p>Weekly plan unavailable. Check Business OS. No publication action taken.</p>',503);
 const params=new URL(request.url).searchParams,brand=params.get('brand')||'',platform=params.get('platform')||'',status=params.get('status')||'';
 if((brand&&!own(brands,brand))||(platform&&!own(platforms,platform))||(status&&!['held','ready-for-review'].includes(status)))return marketingHtml(back+'<p>Invalid filter.</p>',400);
 const filtered=q.items.filter(x=>(!brand||x.brand===brand)&&(!platform||x.platform===platform)&&(!status||x.status===status));
 const options=(o,selected)=>'<option value="">All</option>'+Object.entries(o).map(([k,v])=>'<option value="'+e(k)+'"'+(selected===k?' selected':'')+'>'+e(v)+'</option>').join('');
 const filters='<form method="get" action="/marketing-studio/calendar"><label>Business <select name="brand">'+options(brands,brand)+'</select></label><label>Platform <select name="platform">'+options(platforms,platform)+'</select></label><label>Editorial status <select name="status">'+options({'held':'Held','ready-for-review':'Ready for review'},status)+'</select></label><button type="submit">Filter calendar</button></form>';
 const held=q.items.filter(x=>x.status==='held').length;
 const days=Array.from({length:7},(_,i)=>new Date(Date.parse(q.week_of)+i*86400000).toISOString().slice(0,10));
 const cards=days.map(day=>{const rows=filtered.filter(x=>x.planned_date===day);if(!rows.length)return '';return '<section><h2>'+e(new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}))+'</h2>'+rows.map(x=>'<article><p class="meta">'+e(brands[x.brand])+' · '+e(platforms[x.platform])+'</p><h3>'+e(x.title)+'</h3><p><strong>'+ (x.status==='held'?'Held':'Ready for review')+'</strong>'+(x.hold_reason?' · '+e(x.hold_reason):'')+'</p><details><summary>Copy, evidence and creative brief</summary><p>'+e(x.copy).replace(/\n/g,'<br>')+'</p><p>'+e(x.evidence)+'</p><p>'+e(x.creative)+'</p></details></article>').join('')+'</section>';}).join('');
 return marketingHtml(back+'<p>Week commencing '+e(q.week_of)+' · Prepared '+e(q.prepared_on)+'</p><p><strong>'+q.items.length+' proposed items · '+held+' held · '+(q.items.length-held)+' ready for editorial review</strong></p><p>Proposed dates only. This page does not schedule or publish. Actual draft status is available in <a href="/marketing-studio/review">weekly draft review</a>.</p>'+filters+'<p class="meta">'+filtered.length+' matching items</p>'+(cards||'<p>No matching items.</p>'),200,true);
}
