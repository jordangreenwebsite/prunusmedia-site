import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('client workspace exposes returning to the authorised website',()=>{
  assert.match(html,/id="back-to-website"/);
  assert.match(html,/Back to my website/);
  assert.match(app,/data\.client\.domain/);
  assert.match(app,/back\.href='https:\/\/'\+domain/);
  assert.match(app,/if\(validDomain\)/);
  assert.match(app,/Create your first client/);
});
test('enquiry cards have contact actions and a saved pipeline',()=>{
  for(const label of ['WhatsApp','Call','Email'])assert.match(app,new RegExp("'"+label+"'"));
  assert.match(app,/https:\/\/wa\.me\//);
  assert.match(app,/^function ukWhatsApp\(phone\)/m);
  assert.match(app,/tel:/);
  assert.match(app,/mailto:/);
  assert.match(app,/\/api\/leads\//);
  assert.match(html,/id="lead-filter"/);
  for(const status of ['new','contacted','dealt-with'])assert.ok(app.includes("'"+status+"'"));
});

test('one working sign-in serves both Prunus Media and UK Trade Websites',()=>{
  assert.match(html,/id="login-panel"[^>]*shared-login/);
  assert.match(html,/brand-half-prunus/);
  assert.match(html,/brand-half-trades/);
  assert.match(html,/UK TRADE WEBSITES/);
  assert.equal((html.match(/id="email-form"/g)||[]).length,1);
  assert.equal((html.match(/id="code-form"/g)||[]).length,1);
  assert.match(app,/\/api\/auth\/request-code/);
  assert.match(app,/\/api\/auth\/verify/);
});


test('cream visual identity, accessible local botanicals and shared sign-in stay intact',()=>{
  const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(css,/--paper:#f8f2e9/);
  assert.match(css,/body\{margin:0;font:16px\/1\.6 Arial,Helvetica,sans-serif/);
  assert.match(css,/h1,h2,h3,h4,h5,h6\{font-family:"EB Garamond"/);
  assert.match(html,/fonts\.googleapis\.com\/css2\?family=EB\+Garamond/);
  assert.match(worker,/font-src https:\/\/fonts\.gstatic\.com/);
  assert.match(html,/prunus-botanical\.svg/);
  assert.match(html,/class="trades-ribbons"/);
  assert.match(html,/id="portal-header-label"/);
  assert.match(app,/label\.textContent='YOUR WEBSITE WORKSPACE'/);
  assert.match(html,/id="portal-footer-label"/);
  assert.equal((html.match(/id="email-form"/g)||[]).length,1);
  assert.equal((html.match(/id="code-form"/g)||[]).length,1);
});



test('agency workspace uses page routing, distinct screens and no scroll-to-sections menu',()=>{
  const script=readFileSync(new URL('../public/portal-pages.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.match(html,/id="workspace-sidebar"/);
  assert.match(html,/id="workspace-mobile-nav"/);
  assert.match(html,/id="screen-dashboard"/);
  for(const id of ['screen-businesses','screen-ai','screen-team','screen-overview','screen-calendar',
    'screen-editorial','screen-content','screen-submissions','screen-change','screen-files',
    'screen-settings','screen-insights','screen-enquiries'])assert.ok(html.includes('id="'+id+'"'));
  assert.match(html,/data-portal-route="dashboard"/);
  assert.match(html,/data-portal-route="submissions"/);
  assert.match(script,/history\.pushState/);
  assert.match(script,/window\.addEventListener\('popstate'/);
  assert.match(script,/portalClearScreens\(\)/);
  assert.match(script,/const clientViews=new Set\(/);
  assert.match(script,/state\.session\?\.admin/);
  assert.match(css,/\[hidden\]\{display:none!important\}/);
  assert.match(css,/\.portal-legacy-hidden\{display:none!important\}/);
});
test('business content form, calendar date planner and GSC admin-only separation',()=>{
  const script=readFileSync(new URL('../public/portal-pages.js',import.meta.url),'utf8');
  const api=readFileSync(new URL('../src/gsc.js',import.meta.url),'utf8');
  assert.match(html,/id="content-request-form"/);
  assert.match(html,/id="content-upload-drop"/);
  assert.match(html,/type="file"[^>]*multiple/);
  assert.match(html,/id="calendar-create-form"/);
  assert.match(html,/id="calendar-create-business"/);
  assert.match(script,/\/api\/content-requests/);
  assert.match(script,/scheduled_at:date\.toISOString\(\)/);
  assert.match(api,/if\(!user\.admin\)return json/);
  assert.match(html,/id="screen-ai"/);
  assert.match(html,/id="publishing-settings-form"/);
  assert.match(html,/id="gbp-connect"/);
});
