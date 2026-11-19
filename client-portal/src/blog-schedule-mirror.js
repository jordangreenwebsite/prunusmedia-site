// Read-only mirror of the master ChatGPT publisher. Never writes or publishes website content.
const SOURCE='https://api.github.com/repos/jordangreenwebsite/business-os/contents/businesses/prunus-media/portal-blog-schedule.json?ref=main';
const TTL=60_000;
let cache=null;
export const domainKey=value=>String(value||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'');
const titleKey=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function validateMirror(raw){
  if(raw?.version!==1||!/^\d{4}-\d{2}-\d{2}$/.test(raw.as_of)||!Array.isArray(raw.businesses)||raw.businesses.length>200)throw Error('Invalid schedule');
  const domains=new Set();
  const businesses=raw.businesses.map(b=>{
    const domain=domainKey(b.domain);if(!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)||domain.includes('..')||domains.has(domain)||!Array.isArray(b.articles)||b.articles.length>1000)throw Error('Invalid schedule business');
    domains.add(domain);const ids=new Set();
    const articles=b.articles.map(a=>{
      if(typeof a.id!=='string'||!(/^[a-zA-Z0-9_-]{1,120}$/).test(a.id)||ids.has(a.id)||typeof a.title!=='string'||!a.title.trim()||a.title.length>300||!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||!Number.isFinite(Date.parse(a.date))||!['planned','awaiting','published'].includes(a.status))throw Error('Invalid schedule article');
      ids.add(a.id);let url='';
      if(a.url){const u=new URL(a.url);if(u.protocol!=='https:'||u.username||u.password||domainKey(u.hostname)!==domain||!u.pathname.startsWith('/blog/'))throw Error('Invalid article link');url=u.href;}
      if(a.status==='published'&&!url)throw Error('Published article missing verified URL');
      return {id:a.id,title:a.title,date:a.date,status:a.status,url};
    });return {domain,articles};
  });
  return {as_of:raw.as_of,businesses};
}
export async function loadBlogMirror(env){
  const token=String(env.BLOG_SCHEDULE_READ_TOKEN||'').trim();
  if(!token)return {status:'not-configured',businesses:[]};
  if(cache?.token===token&&Date.now()-cache.fetched<TTL)return cache.result;
  try{
    const response=await fetch(SOURCE,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github.raw+json','User-Agent':'Prunus-Portal'},signal:AbortSignal.timeout(7000)});
    if(!response.ok)throw Error('GitHub rejected schedule read');
    const text=await response.text();if(text.length>2_000_000)throw Error('Schedule too large');
    const result={status:'connected',...validateMirror(JSON.parse(text))};
    cache={token,fetched:Date.now(),result};return result;
  }catch{
    if(cache?.token===token)return {...cache.result,status:'stale'};
    return {status:'unavailable',businesses:[]};
  }
}
export function mirrorPosts(mirror,client,native=[]){
  const b=mirror.businesses.find(b=>b.domain===domainKey(client.domain));if(!b)return [];
  const existing=new Set(native.map(p=>titleKey(p.title)));
  return b.articles.filter(a=>!existing.has(titleKey(a.title))).map(a=>({
    id:'mirror-'+a.id,client_id:client.id,title:a.title,
    status:a.status==='published'?'published':'scheduled',
    mirror_status:a.status,read_only:true,scheduled_at:a.date+'T09:00:00',published_url:a.status==='published'?a.url:'',
    suggested_by:'Master blog schedule',created_at:a.date,day:a.date,occurs_at:a.date+'T09:00:00',
    client_name:client.name
  }));
}
export function mirrorInfo(mirror,domain){
  return {status:mirror.status,as_of:mirror.as_of||null,registered:mirror.businesses.some(b=>b.domain===domainKey(domain))};
}
