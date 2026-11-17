// Stripe's signature is calculated over the exact, unmodified request body.
// Return a verified event only; routing, deduplication and account/object ownership
// checks are required separately before any payment or customer mutation.
const encode = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
function equal(a,b) {
  if (a.length !== b.length) return false;
  let n=0; for(let i=0;i<a.length;i++) n |= a.charCodeAt(i)^b.charCodeAt(i);
  return n===0;
}
export async function verifyWebsiteStripeEvent(raw, signature, secret, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > 1_000_000 || typeof signature !== 'string' || !/^whsec_/.test(secret || '')) throw Error('Invalid webhook');
  const parts = signature.split(',').map(x=>x.trim().split('='));
  const timestamps = parts.filter(x=>x[0]==='t');
  const values = parts.filter(x=>x[0]==='v1').map(x=>x[1]).filter(x=>/^[a-f0-9]{64}$/.test(x||''));
  const ts = timestamps[0]?.[1];
  if (timestamps.length !== 1 || !/^\d+$/.test(ts||'') || !values.length || Math.abs(Math.floor(now/1000)-Number(ts)) > 300) throw Error('Invalid webhook');
  const key = await crypto.subtle.importKey('raw', encode.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, encode.encode(ts+'.'+raw)));
  if (!values.some(v=>equal(v,expected))) throw Error('Invalid webhook');
  const event=JSON.parse(raw);
  if (event.livemode !== true || typeof event.id !== 'string' || !event.id.startsWith('evt_') || typeof event.type !== 'string') throw Error('Invalid live event');
  return event;
}
