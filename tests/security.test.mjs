import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
const origin='https://vouchroster.example';let mf,db;
before(async()=>{
 mf=new Miniflare({modules:true,scriptPath:'dist/worker.js',compatibilityDate:'2026-08-01',d1Databases:{DB:'security'},bindings:{ENVIRONMENT:'production',APP_ORIGIN:origin,LOCAL_MAILBOX:'false'},serviceBindings:{ASSETS:async()=>new Response('<html><head><title>Template</title></head><body><main id="main">Template</main></body></html>')}});
 db=await mf.getD1Database('DB');for(const sql of (await readFile('migrations/0001_foundation.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 await db.prepare("INSERT INTO users (id,email,role,status,name,created_at) VALUES ('user','private@example.test','member','active','Private Member',unixepoch())").run();
});
after(async()=>{await mf?.dispose();});
test('production does not expose the local mailbox, rejects cross-origin requests and sets secure private sessions',async()=>{
 const mailbox=await mf.dispatchFetch(origin+'/api/dev/mail');assert.equal(mailbox.status,404);assert.match(mailbox.headers.get('cache-control'),/no-store/);
 const token='synthetic-production-cookie-test-token';await db.prepare("INSERT INTO tokens (hash,kind,subject,expires_at,created_at) VALUES (?,'login','user',?,?)").bind(createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+900,Math.floor(Date.now()/1000)).run();
 const invalid=await mf.dispatchFetch(origin+'/api/auth/verify',{method:'POST',headers:{Origin:'https://elsewhere.example','Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(invalid.status,403);
 const valid=await mf.dispatchFetch(origin+'/api/auth/verify',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(valid.status,200);assert.match(valid.headers.get('set-cookie'),/; Secure/);assert.match(valid.headers.get('set-cookie'),/HttpOnly/);
 const cookie=valid.headers.get('set-cookie').split(';')[0];
 const large=await mf.dispatchFetch(origin+'/api/profile',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({name:'x'.repeat(20000)})});assert.equal(large.status,413);
 const noOrigin=await mf.dispatchFetch(origin+'/api/profile',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:'{}'});assert.equal(noOrigin.status,403);
 const member=await mf.dispatchFetch(origin+'/api/members',{headers:{Cookie:cookie}});assert.equal(member.status,200);assert.ok(!(await member.text()).includes('private@example.test'));assert.match(member.headers.get('x-robots-tag'),/noindex/);
});
test('rendered listings escape untrusted recommendation text and cannot expose private nomination fields',async()=>{
 await db.prepare("UPDATE users SET role='admin' WHERE id='user'").run();
 await db.prepare("INSERT INTO nominations (id,nominator,email,business,service,category,location,relationship,reason,status,created_at) VALUES ('nom','Private Nominator','nominator@example.test','Business','Repair','Automotive','Roseburg','Customer','Experience','approved',unixepoch())").run();
 await db.prepare("INSERT INTO listings (id,nomination_id,slug,business,service,category,location,recommendation,status,reviewed_at,reviewer_id) VALUES ('listing','nom','example-business','Business','Repair','Automotive','Roseburg',?,'published',unixepoch(),'user')").bind('<img src=x onerror=alert(1)><script>alert(1)</script>').run();
 const response=await mf.dispatchFetch(origin+'/professionals/example-business');assert.equal(response.status,200);const html=await response.text();
 // Test template must include the insertion markers used by the actual retained branded page.
 assert.ok(html.includes('&lt;img src=x'));assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('nominator@example.test'));
});
