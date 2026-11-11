import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('customers are linked to tenant leads without duplicate PII',()=>{
 const sql=read('../migrations/0005_lead_customers.sql');
 const worker=read('../src/index.js');
 assert.match(sql,/lead_id TEXT NOT NULL UNIQUE REFERENCES leads/);
 assert.match(sql,/client_id TEXT NOT NULL REFERENCES clients/);
 assert.match(worker,/access\(env,user,lead\.client_id\)/);
 assert.match(worker,/DELETE FROM lead_customers WHERE client_id=\? AND lead_id=\?/);
 assert.match(worker,/\(!phone&&!email\)/);
});
test('customer controls are visible on client enquiry and customer views',()=>{
 const ui=read('../public/app.js'),html=read('../public/index.html'),router=read('../public/portal-pages.js');
 assert.match(ui,/Add to customers/);
 assert.match(ui,/renderCustomers/);
 assert.match(html,/screen-customers/);
 assert.match(router,/customers:'Customers'/);
});
