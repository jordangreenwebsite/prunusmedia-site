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


test('desktop sidebar and mobile app navigation are role-scoped and linked to real sections',()=>{
  const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../public/workspace-ui.js',import.meta.url),'utf8');
  assert.match(html,/id="workspace-sidebar"/);
  assert.match(html,/id="workspace-mobile-nav"/);
  assert.match(html,/id="mobile-more-sheet"[^>]*hidden/);
  assert.match(html,/id="mobile-more-toggle"[^>]*aria-expanded="false"/);
  for(const id of ['overview','calendar','agency-clients','enquiries','editorial','uploads','changes','blogs','profile','admin-panel','research-queue']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/href="#agency-clients"[^>]*data-role="admin"/);
  assert.match(html,/href="#enquiries"[^>]*data-role="client"/);
  assert.match(workspace,/entry\.hidden=\(role && role!==/);
  assert.match(workspace,/aria-current/);
  assert.match(css,/position:sticky;top:17px/);
  assert.match(css,/\.workspace-mobile-nav\{/);
  assert.match(css,/position:fixed;left:0;right:0;bottom:0/);
  assert.match(css,/safe-area-inset-bottom/);
});
test('compact calendar is navigable, backed by tenant-scoped API and never invents due dates',()=>{
  const workspace=readFileSync(new URL('../public/workspace-ui.js',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../src/editorial.js',import.meta.url),'utf8');
  assert.match(html,/id="calendar-prev"/);
  assert.match(html,/id="calendar-next"/);
  assert.match(html,/id="calendar-day-grid"/);
  assert.match(html,/id="calendar-upcoming"/);
  assert.match(html,/id="calendar-client-filter"/);
  assert.match(workspace,/\/api\/calendar\?month=/);
  assert.match(worker,/if\(!user\.admin && !\(await canRead/);
  assert.match(worker,/research=\(await env\.DB\.prepare/);
  assert.match(html,/Unscheduled work isn't shown as a deadline/);
});
