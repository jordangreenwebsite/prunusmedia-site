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
