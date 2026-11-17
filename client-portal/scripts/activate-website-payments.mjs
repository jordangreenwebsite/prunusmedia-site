// Invoked once by the explicitly authorised protected production deployment.
// No secrets or Checkout URLs are logged. No payment method is submitted.
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const token=randomBytes(32).toString('hex'), digest=createHash('sha256').update(token).digest('hex');
function sql(command){
 const r=spawnSync('npx',['wrangler','d1','execute','prunus-website-clients','--remote','--command',command],{encoding:'utf8',stdio:'pipe'});
 if(r.status!==0)throw Error('Could not update the protected production D1 launch settings.');
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const launch='https://portal.prunusmedia.com/api/website-sales/launch-check';
async function call(action){
 const r=await fetch(launch,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action})});
 let data;try{data=await r.json();}catch{throw Error('Portal activation endpoint did not return JSON.');}
 return {status:r.status,data};
}
try{
 // Ensure the actual customer page is available, not an old 404/marketing page.
 let ready=false;
 for(let i=0;i<24;i++){
  try{const r=await fetch('https://prunusmedia.com/buy-now/?launch='+Date.now(),{cache:'no-store'});const h=await r.text();if(r.ok&&/Choose your website package/.test(h)&&/name="robots" content="noindex,nofollow,noarchive"/.test(h)&&h.includes('Continue to secure payment')&&h.includes('data-terms-version="website-packages-2026-11-17"')){ready=true;break;}}catch{}
  await wait(5000);
 }
 if(!ready)throw Error('Production Buy Now page has not been verified; checkout remains disabled.');
 // A scoped, expiring random capability. Only the workflow and the Worker see it.
 sql("DELETE FROM website_sales_settings WHERE key LIKE 'launch_expected_%' OR key LIKE 'launch_seen_%' OR key='launch_all_verified_key'; INSERT INTO website_sales_settings(key,value) VALUES('launch_nonce_hash','"+digest+"'),('launch_nonce_expires','"+(Date.now()+600000)+"') ON CONFLICT(key) DO UPDATE SET value=excluded.value;");
 const probe=await call('probe');if(!probe.data.ok)throw Error(probe.data.error||'Live Stripe probe failed.');
 console.log('All eight live Checkout Sessions created and expired without payment; future schedule created, updated and cancelled.');
 for(let i=0;i<36;i++){
  const result=await call('activate');
  if(result.data.ok&&result.data.enabled){console.log('Verified signed Stripe webhooks; all eight live payment options enabled.');process.exitCode=0;break;}
  if(result.status!==409)throw Error(result.data.error||'Activation failed.');
  if(i===35)throw Error('Signed expiration webhook was not received; deposits remain disabled.');
  await wait(5000);
 }
}catch(e){console.error(String(e.message).replace(/(?:rk_live_|whsec_|cs_live_)[A-Za-z0-9_]+/g,'[redacted]'));process.exitCode=1;}
finally{try{sql("DELETE FROM website_sales_settings WHERE key IN ('launch_nonce_hash','launch_nonce_expires');");}catch{console.error('Launch nonce cleanup failed; its ten-minute expiration still applies.');}}
