'use strict';
// Portal integration UI. Every value comes from authenticated, tenant-scoped APIs.
let seoRequest=0;
const number=(v)=>Number(v||0).toLocaleString('en-GB');
function measure(parent,label,value,footnote){
  const card=add(parent,'div',null,'seo-measure');
  add(card,'span',label,'seo-measure-label');
  add(card,'strong',value,'seo-measure-number');
  if(footnote)add(card,'small',footnote);
}
function seoDelta(current,previous){
  if(!previous)return 'Previous period: 0';
  const pct=(current-previous)/previous*100;
  return (pct>0?'+':'')+pct.toFixed(1)+'% from previous period';
}
async function loadSeoInsights(){
  const target=$('seo-status'),grid=$('seo-metrics'),root=$('seo-query-rows');
  const requestId=++seoRequest;
  grid.replaceChildren();root.replaceChildren();
  $('seo-measurements').hidden=true;
  target.classList.remove('error');
  if(!state.clientId){target.textContent='Select a website to see measured search performance.';return;}
  target.textContent='Checking Search Console…';
  try{
    const data=await api('/api/seo?client='+encodeURIComponent(state.clientId));
    if(requestId!==seoRequest)return;
    if(!data.configured){
      target.textContent=data.reason||'Search Console is not connected for this website.';
      return;
    }
    target.textContent='';
    $('seo-measurements').hidden=false;
    $('seo-period').textContent=data.period.start+' to '+data.period.end+
      ' · Finalised Search Console data · Comparison with preceding 28 days';
    measure(grid,'Search clicks',number(data.current.clicks),seoDelta(data.current.clicks,data.previous.clicks));
    measure(grid,'Search impressions',number(data.current.impressions),seoDelta(data.current.impressions,data.previous.impressions));
    measure(grid,'Average CTR',(data.current.ctr*100).toFixed(1)+'%','Share of impressions generating clicks');
    measure(grid,'Average position',data.current.position.toFixed(1),'Google Search Console average, not a keyword rank tracker');
    for(const item of data.queries||[]){
      const row=add(root,'tr');
      add(row,'td',item.query);
      add(row,'td',number(item.clicks));
      add(row,'td',number(item.impressions));
      add(row,'td',(item.ctr*100).toFixed(1)+'%');
      add(row,'td',item.position.toFixed(1));
    }
    if(!data.queries?.length){
      const row=add(root,'tr');
      const cell=add(row,'td','No search queries returned for this reporting period.');
      cell.colSpan=5;
    }
  }catch(err){
    if(requestId!==seoRequest)return;
    target.textContent='Search Console unavailable: '+err.message;
    target.classList.add('error');
  }
}
$('seo-refresh').addEventListener('click',()=>loadSeoInsights());

// A reviewed PR is only available for the current live Prunus Media website.
// No client website repository integration or automatic publication is implied.
function renderGitHubPrControl(box,post){
  if(!state.session?.admin)return;
  const client=state.dashboard?.client;
  if(!client||!['prunusmedia.com','www.prunusmedia.com'].includes(String(client.domain).toLowerCase()))return;
  if(editorialData.config?.brand!=='prunus')return;
  if(post.github_pr_url){
    const link=add(box,'a','Review GitHub draft PR #'+post.github_pr_number,'pr-review-link');
    link.href=post.github_pr_url;link.target='_blank';link.rel='noopener noreferrer';
    return;
  }
  if(!['approved','scheduled'].includes(post.status))return;
  const controls=add(box,'div',null,'pr-create-controls');
  add(controls,'p','Prunus site only. Prepares a private review pull request with draft: true; never publishes.','subtle');
  const button=add(controls,'button','Prepare GitHub draft PR','secondary');
  button.type='button';
  const message=add(controls,'p','','message');
  button.addEventListener('click',async()=>{
    if(!confirm('Create a draft review PR in jordangreenwebsite/prunusmedia-site? No website page will be published automatically.'))return;
    button.disabled=true;message.classList.remove('error');
    try{
      const r=await jsonPost('/api/admin/editorial/'+post.id+'/create-pr',{});
      const link=add(controls,'a','Open review PR #'+r.number,'pr-review-link');
      link.href=r.url;link.target='_blank';link.rel='noopener noreferrer';
      message.textContent='Draft PR created. Review and approve it separately in GitHub.';
      button.hidden=true;
    }catch(err){message.textContent=err.message;message.classList.add('error');}
    finally{button.disabled=false;}
  });
}
