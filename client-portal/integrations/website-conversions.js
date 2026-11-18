/* Copy to each managed website, self-host it. Do not load from the portal.
 * The site's consent manager must explicitly call PrunusConversions.enable()
 * after analytics consent, and disable() on withdrawal. Only static event names
 * are sent to that site's existing Google tag. No identifiers, phone numbers,
 * WhatsApp messages, enquiry text, names or emails are sent.
 */
(function(){
 'use strict';
 let enabled=false,channel=null;
 const allowed=['organic-search-inferred','paid-search-inferred','social-inferred','referral-inferred','direct-or-unknown','campaign-other'];
 function classify(){
  const u=new URL(location.href),medium=(u.searchParams.get('utm_medium')||'').toLowerCase();
  if(['gclid','msclkid','dclid','gbraid','wbraid'].some(k=>u.searchParams.has(k))||/^(cpc|ppc|paidsearch|paid_search)$/.test(medium))return 'paid-search-inferred';
  if(medium){if(medium==='organic')return 'organic-search-inferred';if(/social/.test(medium))return 'social-inferred';return 'campaign-other';}
  if(u.searchParams.has('utm_source')||u.searchParams.has('utm_campaign'))return 'campaign-other';
  try{const h=new URL(document.referrer).hostname.toLowerCase();if(!h||h===location.hostname)return 'direct-or-unknown';if(/^(?:www\.)?(?:google\.(?:com|co\.uk|[a-z]{2})|bing\.com|search\.yahoo\.com|duckduckgo\.com)$/.test(h))return 'organic-search-inferred';if(/(?:^|\.)(?:facebook\.com|instagram\.com|tiktok\.com|linkedin\.com)$/.test(h))return 'social-inferred';return 'referral-inferred';}catch{return 'direct-or-unknown';}
 }
 function emit(name){if(enabled&&typeof window.gtag==='function')window.gtag('event',name);}
 function click(e){if(!enabled||!e.isTrusted)return;const a=e.target?.closest?.('a[href]');if(!a)return;const href=a.getAttribute('href')||'';if(/^tel:/i.test(href)){emit('phone_click');return;}try{const u=new URL(href,location.href);if(u.protocol==='https:'&&['wa.me','api.whatsapp.com','web.whatsapp.com','www.whatsapp.com'].includes(u.hostname))emit('whatsapp_click');}catch{}}
 function enable(){if(enabled)return;enabled=true;try{const old=sessionStorage.getItem('prunus_conversion_channel');channel=allowed.includes(old)?old:classify();sessionStorage.setItem('prunus_conversion_channel',channel);}catch{channel=classify();}}
 function disable(){enabled=false;channel=null;try{sessionStorage.removeItem('prunus_conversion_channel');}catch{}}
 document.addEventListener('click',click,true);
 window.PrunusConversions=Object.freeze({enable,disable,leadSucceeded:()=>emit('generate_lead'),attribution:()=>enabled&&channel?{attribution_channel:channel,attribution_consented:true}:{}});
})();
