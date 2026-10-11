import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {createHash} from 'node:crypto';
const origin='http://127.0.0.1:8787';
let mf,db,adminCookie,memberCookie,slug,postId;
const nom={nominator:'Firsthand Customer',email:'customer@example.test',pro:'Test Repair Shop',business_email:'owner@example.test',service:'Auto repair',category:'Automotive',location:'Roseburg',relationship:'I am a customer',why:'They repaired my vehicle and explained the work clearly.',notes:'Synthetic test record',consent:true};
async function request(path,data,cookie,options={}){
 const r=await mf.dispatchFetch(origin+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json',Origin:origin}),...(cookie?{Cookie:cookie}:{}),...options.headers},body:data===undefined?undefined:JSON.stringify(data)});
 const content=await r.text();let value;try{value=JSON.parse(content);}catch{value=content;}return {status:r.status,data:value,headers:r.headers};
}
async function tokenFor(address,purpose='login'){
 const r=await request('/api/dev/mail');const message=r.data.mail.find(m=>m.recipient===address&&m.purpose===purpose);assert.ok(message,'local delivery exists');return new URL(message.link).searchParams.get('token');
}
async function login(address){await request('/api/auth/request',{email:address});const r=await request('/api/auth/verify',{token:await tokenFor(address)});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);return r.headers.get('set-cookie').split(';')[0];}
before(async()=>{
 mf=new Miniflare({modules:true,scriptPath:'dist/worker.js',compatibilityDate:'2026-08-01',bindings:{ENVIRONMENT:'development',APP_ORIGIN:origin,LOCAL_MAILBOX:'true'},d1Databases:{DB:'tests'},serviceBindings:{ASSETS:async req=>{try{const path=new URL(req.url).pathname;return new Response(await readFile('public'+(path==='/'?'/index.html':path)),{headers:{'Content-Type':path.endsWith('.js')?'text/javascript':'text/html'}});}catch{return new Response('Not found',{status:404});}}}});
 db=await mf.getD1Database('DB');const sql=await readFile('migrations/0001_foundation.sql','utf8');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 await db.prepare("INSERT INTO users (id,email,role,status,name,created_at) VALUES ('admin','admin@example.test','admin','active','Administrator',unixepoch())").run();
});
after(async()=>{await mf?.dispose();});
test('private endpoints require authentication; mutations require the configured origin',async()=>{
 for(const path of ['/api/me','/api/members','/api/posts','/api/events','/api/admin/nominations'])assert.equal((await request(path)).status,401,path);
 assert.equal((await request('/api/auth/request',{email:'admin@example.test'},null,{headers:{Origin:'https://other.example'}})).status,403);
 assert.equal((await request('/api/health')).data.county,'douglas');
 const devRemote=await mf.dispatchFetch('https://vouchroster.example/api/dev/mail');assert.equal(devRemote.status,503);
});
test('unknown account response matches known account; login is one-time and session token is hashed',async()=>{
 const known=await request('/api/auth/request',{email:'admin@example.test'});const unknown=await request('/api/auth/request',{email:'outsider@example.test'});assert.deepEqual(known.data,unknown.data);
 const token=await tokenFor('admin@example.test');const verified=await request('/api/auth/verify',{token});assert.equal(verified.status,200);adminCookie=verified.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/auth/verify',{token})).status,400);
 const raw=adminCookie.split('=')[1];const session=await db.prepare('SELECT hash FROM sessions').first();assert.equal(session.hash,createHash('sha256').update(raw).digest('hex'));assert.notEqual(session.hash,raw);
 const expired='expired-token-with-enough-characters';await db.prepare("INSERT INTO tokens VALUES (?,'login','admin',1,1)").bind(createHash('sha256').update(expired).digest('hex')).run();assert.equal((await request('/api/auth/verify',{token:expired})).status,400);
});
test('invitation creates membership without any listing, verified login activates it, member cannot administer',async()=>{
 const r=await request('/api/admin/invitations',{name:'Invited Professional',email:'member@example.test'},adminCookie);assert.equal(r.status,201);
 assert.equal((await request('/api/directory')).data.total,0);
 const accepted=await request('/api/auth/verify',{token:await tokenFor('member@example.test')});assert.equal(accepted.status,200);memberCookie=accepted.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/me',undefined,memberCookie)).data.user.role,'member');
 assert.equal((await request('/api/admin/nominations',undefined,memberCookie)).status,403);
 await request('/api/profile',{name:'Member Name',business:'Independent business',bio:'Here to meet people',interests:'Coffee and local knowledge',contact:'Shared contact'},memberCookie);
 const members=await request('/api/members',undefined,memberCookie);assert.ok(members.data.members.some(m=>m.name==='Member Name'));assert.ok(members.data.members.every(m=>!('email' in m)));
 assert.equal((await request('/api/directory')).data.total,0);
});
test('nomination needs consent and verification before review, independent permission-backed approval creates a public listing',async()=>{
 assert.equal((await request('/api/nominations',{...nom,consent:false})).status,400);
 const submission=await request('/api/nominations',nom);assert.equal(submission.status,201);
 let record=await db.prepare('SELECT * FROM nominations WHERE email=?').bind(nom.email).first();assert.equal(record.status,'unverified');
 assert.equal((await request('/api/admin/nominations',undefined,adminCookie)).data.nominations.length,0);
 const review={decision:'approve',review_notes:'Checked firsthand work, disclosures and permission.',independent:true,permission:true,contact_url:'https://example.test/repair'};
 assert.equal((await request(`/api/admin/nominations/${record.id}/review`,review,adminCookie)).status,409);
 const token=await tokenFor(nom.email,'nomination');assert.equal((await request('/api/nominations/verify',{token})).status,200);assert.equal((await request('/api/nominations/verify',{token})).status,400);
 assert.equal((await request(`/api/admin/nominations/${record.id}/review`,{...review,permission:false},adminCookie)).status,400);
 assert.equal((await request(`/api/admin/nominations/${record.id}/review`,{...review,contact_url:'javascript:alert(1)'},adminCookie)).status,400);
 const approval=await request(`/api/admin/nominations/${record.id}/review`,review,adminCookie);assert.equal(approval.status,200);slug=approval.data.slug;
 assert.equal((await request(`/api/admin/nominations/${record.id}/review`,review,adminCookie)).status,409);
 const results=await request('/api/directory?q=repair&category=Automotive');assert.equal(results.data.total,1);assert.equal(results.data.listings[0].slug,slug);
 const serialized=JSON.stringify(results.data);assert.ok(!serialized.includes(nom.email));assert.ok(!serialized.includes(nom.nominator));assert.ok(!serialized.includes('review_notes'));
 assert.equal((await request('/api/directory?county=lane')).data.total,0);assert.equal((await request('/api/directory?category=Legal')).data.total,0);
 const profile=await request('/professionals/'+slug);assert.equal(profile.status,200);assert.match(profile.data,/<title>Test Repair Shop/);assert.match(profile.data,/application\/ld\+json/);assert.ok(!profile.data.includes('noindex'));assert.match(profile.headers.get('content-security-policy'),/script-src 'self';/);
 assert.match((await request('/sitemap.xml')).data,new RegExp(slug));
});
test('administrators cannot approve their own recommendations',async()=>{
 const own={...nom,email:'admin@example.test',pro:'Own recommendation'};assert.equal((await request('/api/nominations',own)).status,201);await request('/api/nominations/verify',{token:await tokenFor(own.email,'nomination')});
 const n=await db.prepare('SELECT id FROM nominations WHERE business=?').bind(own.pro).first();
 assert.equal((await request(`/api/admin/nominations/${n.id}/review`,{decision:'approve',review_notes:'A valid review note but conflicted.',independent:true,permission:true},adminCookie)).status,403);
 assert.equal((await request('/api/directory')).data.total,1);
});
test('private conversations, replies and gatherings persist but remain inaccessible anonymously',async()=>{
 const post=await request('/api/posts',{title:'Meet your neighbors',body:'Anyone interested in a shop visit?'},memberCookie);assert.equal(post.status,201);postId=post.data.id;
 assert.equal((await request(`/api/posts/${postId}/replies`,{body:'I would enjoy that.'},adminCookie)).status,201);
 const replies=await request(`/api/posts/${postId}/replies`,undefined,memberCookie);assert.equal(replies.data.replies[0].body,'I would enjoy that.');assert.equal((await request(`/api/posts/${postId}/replies`)).status,401);
 assert.equal((await request('/api/events',{title:'Optional coffee',description:'An informal local gathering',location:'Roseburg',starts_at:new Date(Date.now()+86400000).toISOString()},memberCookie)).status,201);
 assert.equal((await request('/api/events',undefined,memberCookie)).data.events.length,1);
 assert.equal((await request('/api/events',{title:'Old date',description:'Should not save',location:'Roseburg',starts_at:'2000-01-01'},memberCookie)).status,400);
});
test('listing suspension removes directory, profile and sitemap publication; membership suspension revokes access',async()=>{
 const listing=await db.prepare('SELECT id FROM listings WHERE slug=?').bind(slug).first();assert.equal((await request('/api/admin/listings/status',{id:listing.id,status:'suspended'},adminCookie)).status,200);
 assert.equal((await request('/api/directory')).data.total,0);assert.equal((await request('/professionals/'+slug)).status,404);assert.ok(!(await request('/sitemap.xml')).data.includes(slug));
 const outstanding='outstanding-login-token-for-suspended-member';const userId=(await db.prepare('SELECT id FROM users WHERE email=?').bind('member@example.test').first()).id;await db.prepare("INSERT INTO tokens (hash,kind,subject,expires_at,created_at) VALUES (?,'login',?,?,?)").bind(createHash('sha256').update(outstanding).digest('hex'),userId,Math.floor(Date.now()/1000)+900,Math.floor(Date.now()/1000)).run();
 const u=await db.prepare('SELECT id FROM users WHERE email=?').bind('member@example.test').first();assert.equal((await request('/api/admin/members/status',{id:u.id,status:'suspended'},adminCookie)).status,200);
 assert.equal((await request('/api/posts',undefined,memberCookie)).status,401);assert.equal((await request('/api/auth/verify',{token:outstanding})).status,400);
 assert.equal((await request('/api/admin/members/status',{id:'admin',status:'suspended'},adminCookie)).status,400);
 assert.ok((await request('/api/admin/audit',undefined,adminCookie)).data.events.some(x=>x.action==='listing.suspended'));
});
test('rate limiting rejects repeated sign-in requests, logout revokes the session',async()=>{
 for(let i=0;i<15;i++)await request('/api/auth/request',{email:'outsider@example.test'});
 assert.equal((await request('/api/auth/request',{email:'outsider@example.test'})).status,429);
 assert.equal((await request('/api/auth/logout',{},adminCookie)).status,200);assert.equal((await request('/api/me',undefined,adminCookie)).status,401);
});
