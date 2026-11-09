// This runs only on the explicitly triggered GitHub production workflow.
// Never commit or print the generated secrets file.
import { readFileSync, writeFileSync } from 'node:fs';

const required = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'PORTAL_D1_DATABASE_ID',
  'PORTAL_AUTH_PEPPER',
  'PORTAL_RESEND_API_KEY',
  'PORTAL_ADMIN_EMAILS',
  'PORTAL_OTP_FROM_EMAIL'
];
const missing = required.filter(key => !String(process.env[key] || '').trim());
if (missing.length) throw new Error('Missing portal-production secrets or variables: ' + missing.join(', '));
const d1Id = String(process.env.PORTAL_D1_DATABASE_ID).trim();
if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d1Id)) {
  throw new Error('PORTAL_D1_DATABASE_ID must be a Cloudflare D1 UUID.');
}
if (process.env.PORTAL_AUTH_PEPPER.length < 32) {
  throw new Error('PORTAL_AUTH_PEPPER must contain at least 32 random characters.');
}
const emails = process.env.PORTAL_ADMIN_EMAILS.split(',').map(s=>s.trim().toLowerCase());
if (!emails.every(email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
  throw new Error('PORTAL_ADMIN_EMAILS must contain valid comma-separated email addresses.');
}
const from=String(process.env.PORTAL_OTP_FROM_EMAIL).trim().toLowerCase();
if (!/^[^@<>\s]+@([a-z0-9-]+\.)*prunusmedia\.com$/.test(from)) {
  throw new Error('PORTAL_OTP_FROM_EMAIL must use a verified Prunus Media sender domain.');
}
const notify=String(process.env.PORTAL_ADMIN_NOTIFY_EMAIL||'').trim().toLowerCase();
if (notify && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notify)) {
  throw new Error('PORTAL_ADMIN_NOTIFY_EMAIL must be a valid email address.');
}
const file='wrangler.jsonc';
const config=readFileSync(file,'utf8');
const placeholder='REPLACE_WITH_REAL_CLOUDFLARE_D1_DATABASE_ID';
if (!config.includes(placeholder)) throw new Error('Expected D1 UUID placeholder was not found.');
writeFileSync(file,config.replace(placeholder,d1Id));
const secrets = {
  AUTH_PEPPER: process.env.PORTAL_AUTH_PEPPER,
  RESEND_API_KEY: process.env.PORTAL_RESEND_API_KEY,
  OTP_FROM_EMAIL: from,
  ADMIN_EMAILS: emails.join(',')
};
if (notify) secrets.ADMIN_NOTIFY_EMAIL=notify;
writeFileSync('.portal-secrets.json',JSON.stringify(secrets),{mode:0o600});
console.log('Portal deployment configuration validated, without printing secrets.');
