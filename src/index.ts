interface Env {
 DB: D1Database; ASSETS: Fetcher; ENVIRONMENT: string; APP_ORIGIN: string;
 LOCAL_MAILBOX?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string; PUBLIC_SUBMISSIONS?: string; STAGING?: string;
}
interface User {id:string; email:string; role:'member'|'admin'; status:string; county:string; name:string; business:string; bio:string; interests:string; contact:string}
interface Nomination {id:string; nominator:string; email:string; business:string; business_email:string; service:string; category:string; location:string; relationship:string; reason:string; status:string; verified_at:number|null}
const CATEGORIES=['Home','Insurance','Legal','Automotive','Real','Health','Local','Other'];
const now=()=>Math.floor(Date.now()/1000);
const uuid=()=>crypto.randomUUID();
class Failure extends Error {constructor(public status:number,message:string){super(message);}}
function insist(condition:unknown,status:number,message:string):asserts condition {if(!condition)throw new Failure(status,message);}
function json(value:unknown,status=200){return Response.json(value,{status});}
function text(value:unknown,max:number,min=0){insist(typeof value==='string',400,'Please complete all required fields.'); const s=value.trim(); insist(s.length>=min&&s.length<=max,400,`Please use between ${min} and ${max} characters.`);return s;}
function email(value:unknown){const s=text(value,180,3).toLowerCase();insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),400,'Please enter a valid email address.');return s;}
function safeURL(value:unknown){const s=text(value??'',500);if(!s)return '';let u:URL;try{u=new URL(s);}catch{throw new Failure(400,'Use a complete HTTPS website address.');}insist(u.protocol==='https:'&&!u.username&&!u.password,400,'Use a complete HTTPS website address.');return u.href;}
async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const escape=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function development(env:Env,url:URL){return env.ENVIRONMENT==='development'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);}
function validateEnvironment(env:Env,url:URL){
 const origin=new URL(env.APP_ORIGIN);
 if(env.ENVIRONMENT==='development')insist(development(env,url),503,'Development mode is restricted to loopback hosts.');
 else insist(env.ENVIRONMENT==='production'&&origin.protocol==='https:'&&env.LOCAL_MAILBOX!=='true',503,'Production configuration is incomplete.');
 insist(url.origin===origin.origin,503,'The application origin is not configured for this host.');
}
async function body(req:Request):Promise<Record<string,unknown>> {
 insist(req.headers.get('content-type')?.split(';')[0]==='application/json',415,'Send JSON.');
 insist(Number(req.headers.get('content-length')??0)<=16000,413,'Request is too large.');
 // Count bytes while reading; a missing Content-Length must not permit an unbounded body.
 const reader=req.body?.getReader();insist(reader,400,'Missing request body.');let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();throw new Failure(413,'Request is too large.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{const result=JSON.parse(new TextDecoder().decode(bytes));insist(result&&typeof result==='object'&&!Array.isArray(result),400,'Invalid request.');return result;}catch{throw new Failure(400,'Invalid JSON request.');}
}
async function rate(env:Env,req:Request,bucket:string,limit=20){
 const ip=req.headers.get('CF-Connecting-IP')??'local';const key=await hash(`${bucket}:${ip}`);const time=now();
 const row=await env.DB.prepare('INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING count').bind(key,time+3600,time,time,time+3600).first<{count:number}>();
 insist(row&&row.count<=limit,429,'Too many requests. Please try again later.');
}
async function issue(env:Env,kind:'login'|'nomination',subject:string,recipient:string){
 const raw=crypto.randomUUID()+crypto.randomUUID();const digest=await hash(raw);const expires=now()+(kind==='login'?900:86400);
 await env.DB.prepare('INSERT INTO tokens (hash,kind,subject,expires_at,created_at) VALUES (?,?,?,?,?)').bind(digest,kind,subject,expires,now()).run();
 const link=`${env.APP_ORIGIN}/verify.html?kind=${kind}&token=${encodeURIComponent(raw)}`;
 try{
  if(development(env,new URL(env.APP_ORIGIN))&&env.LOCAL_MAILBOX==='true'){
   await env.DB.prepare('INSERT INTO local_mail (id,recipient,purpose,link,created_at) VALUES (?,?,?,?,?)').bind(uuid(),recipient,kind,link,now()).run();
  }else{
   insist(env.RESEND_API_KEY&&env.EMAIL_FROM,503,'Email delivery is not configured.');
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[recipient],subject:kind==='login'?'Your VouchRoster sign-in link':'Verify your VouchRoster nomination',text:`${kind==='login'?'Sign in to VouchRoster':'Verify your nomination'} using this one-time link:\n${link}\n\n${kind==='login'?'This link expires in 15 minutes.':'This link expires in 24 hours.'} If you did not request this, ignore this email.`})});
   insist(response.ok,503,'Email delivery is temporarily unavailable.');
  }
 }catch(error){await env.DB.prepare('DELETE FROM tokens WHERE hash=?').bind(digest).run();throw error;}
}
async function consume(env:Env,raw:unknown,kind:string){
 const token=text(raw,200,30);const row=await env.DB.prepare('DELETE FROM tokens WHERE hash=? AND kind=? AND expires_at>? RETURNING subject').bind(await hash(token),kind,now()).first<{subject:string}>();
 insist(row,400,'This link is invalid, expired, or already used. Request a new link.');return row.subject;
}
async function user(env:Env,req:Request){
 const token=req.headers.get('Cookie')?.match(/(?:^|;\s*)vr_session=([^;]+)/)?.[1];if(!token)return null;
 return env.DB.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires_at>? AND u.status=\'active\'').bind(await hash(token),now()).first<User>();
}
async function member(env:Env,req:Request,admin=false){const u=await user(env,req);insist(u,401,'Please sign in to the community.');insist(!admin||u.role==='admin',403,'Administrator access is required.');return u;}
async function audit(env:Env,actor:string,action:string,subject:string){await env.DB.prepare('INSERT INTO audit_log (id,actor_id,action,subject,created_at) VALUES (?,?,?,?,?)').bind(uuid(),actor,action,subject,now()).run();}
function cookie(env:Env,value:string,maxAge:number){return `vr_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${env.ENVIRONMENT==='production'?'; Secure':''}`;}
async function api(req:Request,env:Env,url:URL){
 const path=url.pathname;const method=req.method;
 if(method!=='GET'&&method!=='HEAD'){
  insist(method==='POST',405,'Method not allowed.');
  insist(req.headers.get('Origin')===env.APP_ORIGIN,403,'Request origin is not permitted.');
 }
 if(path==='/api/health'&&method==='GET'){await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first();return json({ok:true,county:'douglas',development:development(env,url)});}
 if(path==='/api/dev/mail'&&method==='GET'){
  insist(development(env,url)&&env.LOCAL_MAILBOX==='true',404,'Not found.');
  const result=await env.DB.prepare('SELECT recipient,purpose,link,created_at FROM local_mail ORDER BY created_at DESC,rowid DESC LIMIT 30').all();return json({mail:result.results});
 }
 if(path==='/api/auth/request'&&method==='POST'){
  await rate(env,req,'login',12);const data=await body(req);const address=email(data.email);
  const found=await env.DB.prepare('SELECT id FROM users WHERE email=? AND status IN (\'invited\',\'active\')').bind(address).first<{id:string}>();
  // Every caller gets the same response, including when delivery for a recognized account fails.
  if(found){try{await issue(env,'login',found.id,address);}catch{/* The user can retry; no token or recipient is logged. */}}
  return json({message:'If this email has an invitation or active account, a sign-in link will arrive shortly.'});
 }
 if(path==='/api/auth/verify'&&method==='POST'){
  await rate(env,req,'verify',30);const data=await body(req);const id=await consume(env,data.token,'login');
  const found=await env.DB.prepare('SELECT * FROM users WHERE id=? AND status IN (\'invited\',\'active\')').bind(id).first<User>();insist(found,403,'This membership is unavailable.');
  const raw=uuid()+uuid();const digest=await hash(raw);const time=now();
  await env.DB.batch([env.DB.prepare('UPDATE users SET status=\'active\' WHERE id=? AND status=\'invited\'').bind(id),env.DB.prepare('INSERT INTO sessions (hash,user_id,expires_at) VALUES (?,?,?)').bind(digest,id,time+86400*7)]);
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':cookie(env,raw,86400*7)}});
 }
 if(path==='/api/auth/logout'&&method==='POST'){
  const raw=req.headers.get('Cookie')?.match(/(?:^|;\s*)vr_session=([^;]+)/)?.[1];if(raw)await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(raw)).run();
  return new Response('{"ok":true}',{headers:{'Content-Type':'application/json','Set-Cookie':cookie(env,'',0)}});
 }
 if(path==='/api/me'&&method==='GET'){const u=await member(env,req);return json({user:{id:u.id,name:u.name,business:u.business,bio:u.bio,interests:u.interests,contact:u.contact,email:u.email,role:u.role}});}
 if(path==='/api/profile'&&method==='POST'){
  const u=await member(env,req);const d=await body(req);
  await env.DB.prepare('UPDATE users SET name=?,business=?,bio=?,interests=?,contact=? WHERE id=?').bind(text(d.name,100,2),text(d.business??'',120),text(d.bio??'',1500),text(d.interests??'',500),text(d.contact??'',180),u.id).run();return json({ok:true});
 }
 if(path==='/api/directory'&&method==='GET'){
  const county=url.searchParams.get('county')??'douglas';if(county!=='douglas')return json({listings:[],total:0,page:1});
  const category=url.searchParams.get('category')??'';insist(!category||CATEGORIES.includes(category),400,'Unknown category.');
  const query=text(url.searchParams.get('q')??'',100);const page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1));insist(Number.isInteger(page),400,'Invalid page.');
  const filter=`status='published' AND county='douglas' AND (?='' OR category=?) AND (?='' OR instr(lower(business||' '||service||' '||location),lower(?))>0)`;
  const args=[category,category,query,query];const count=await env.DB.prepare(`SELECT count(*) AS total FROM listings WHERE ${filter}`).bind(...args).first<{total:number}>();
  const listings=await env.DB.prepare(`SELECT slug,business,service,category,location,recommendation,contact_url,reviewed_at FROM listings WHERE ${filter} ORDER BY business COLLATE NOCASE,id LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20).all();return json({listings:listings.results,total:count?.total??0,page});
 }
 if(path==='/api/nominations'&&method==='POST'){
  insist(env.PUBLIC_SUBMISSIONS!=='false',503,'This staging preview is not accepting nominations yet.');
  await rate(env,req,'nomination',8);const d=await body(req);insist(d.consent===true,400,'Consent is required to submit and review this nomination.');
  const address=email(d.email);const businessEmail=d.business_email?email(d.business_email):'';const category=text(d.category,30,1);insist(CATEGORIES.includes(category),400,'Choose a category.');
  const id=uuid();
  await env.DB.prepare('INSERT INTO nominations (id,nominator,email,business,business_email,service,category,location,relationship,reason,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,\'unverified\',?)').bind(id,text(d.nominator,100,2),address,text(d.pro,120,2),businessEmail,text(d.service,100,2),category,text(d.location,90,2),text(d.relationship,120,3),text(d.why,1500,20),text(d.notes??'',800),now()).run();
  try{await issue(env,'nomination',id,address);}catch(error){await env.DB.prepare('DELETE FROM nominations WHERE id=? AND status=\'unverified\'').bind(id).run();throw error;}
  return json({message:'Check your email to verify your nomination. Verification sends it for review; it does not publish a listing.'},201);
 }
 if(path==='/api/nominations/verify'&&method==='POST'){
  await rate(env,req,'verify',30);const d=await body(req);const id=await consume(env,d.token,'nomination');
  const result=await env.DB.prepare('UPDATE nominations SET status=\'pending\',verified_at=? WHERE id=? AND status=\'unverified\'').bind(now(),id).run();insist(result.meta.changes===1,409,'Nomination is no longer awaiting verification.');return json({message:'Your email is verified. Your nomination is now awaiting independent review.'});
 }
 if(path==='/api/members'&&method==='GET'){
  const u=await member(env,req);const rows=await env.DB.prepare('SELECT id,name,business,bio,interests,contact FROM users WHERE status=\'active\' AND county=? AND name<>\'\' ORDER BY name COLLATE NOCASE').bind(u.county).all();return json({members:rows.results});
 }
 if(path==='/api/posts'&&method==='GET'){
  const u=await member(env,req);const rows=await env.DB.prepare('SELECT p.id,p.title,p.body,p.created_at,u.name AS author FROM posts p JOIN users u ON u.id=p.author_id WHERE p.county=? ORDER BY p.created_at DESC,p.rowid DESC LIMIT 50').bind(u.county).all();return json({posts:rows.results});
 }
 if(path==='/api/posts'&&method==='POST'){
  const u=await member(env,req);await rate(env,req,'community',50);const d=await body(req);const id=uuid();await env.DB.prepare('INSERT INTO posts (id,author_id,county,title,body,created_at) VALUES (?,?,?,?,?,?)').bind(id,u.id,u.county,text(d.title,120,3),text(d.body,3000,5),now()).run();return json({id},201);
 }
 const replies=path.match(/^\/api\/posts\/([^/]+)\/replies$/);
 if(replies){
  const u=await member(env,req);const post=await env.DB.prepare('SELECT id FROM posts WHERE id=? AND county=?').bind(replies[1],u.county).first();insist(post,404,'Conversation not found.');
  if(method==='GET'){const rows=await env.DB.prepare('SELECT r.id,r.body,r.created_at,u.name AS author FROM replies r JOIN users u ON u.id=r.author_id WHERE r.post_id=? ORDER BY r.created_at,r.rowid').bind(replies[1]).all();return json({replies:rows.results});}
  if(method==='POST'){await rate(env,req,'community',50);const d=await body(req);await env.DB.prepare('INSERT INTO replies (id,post_id,author_id,body,created_at) VALUES (?,?,?,?,?)').bind(uuid(),replies[1],u.id,text(d.body,2000,2),now()).run();return json({ok:true},201);}
 }
 if(path==='/api/events'&&method==='GET'){
  const u=await member(env,req);const rows=await env.DB.prepare('SELECT e.id,e.title,e.description,e.location,e.starts_at,u.name AS author FROM events e JOIN users u ON u.id=e.author_id WHERE e.county=? AND e.starts_at>=? ORDER BY e.starts_at LIMIT 50').bind(u.county,new Date().toISOString()).all();return json({events:rows.results});
 }
 if(path==='/api/events'&&method==='POST'){
  const u=await member(env,req);await rate(env,req,'community',50);const d=await body(req);const start=text(d.starts_at,40,10);insist(Number.isFinite(Date.parse(start))&&Date.parse(start)>Date.now(),400,'Choose a future date and time.');
  await env.DB.prepare('INSERT INTO events (id,author_id,county,title,description,location,starts_at,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(uuid(),u.id,u.county,text(d.title,120,3),text(d.description,1500,5),text(d.location,180,3),new Date(start).toISOString(),now()).run();return json({ok:true},201);
 }
 if(path.startsWith('/api/admin/')){
  const admin=await member(env,req,true);
  if(path==='/api/admin/nominations'&&method==='GET'){const rows=await env.DB.prepare('SELECT * FROM nominations WHERE status<>\'unverified\' ORDER BY created_at DESC,rowid DESC LIMIT 100').all();return json({nominations:rows.results});}
  if(path==='/api/admin/members'&&method==='GET'){const rows=await env.DB.prepare('SELECT id,email,name,business,role,status FROM users ORDER BY created_at DESC,rowid DESC LIMIT 100').all();return json({members:rows.results});}
  if(path==='/api/admin/listings'&&method==='GET'){const rows=await env.DB.prepare('SELECT id,slug,business,status FROM listings ORDER BY business').all();return json({listings:rows.results});}
  if(path==='/api/admin/audit'&&method==='GET'){const rows=await env.DB.prepare('SELECT a.action,a.subject,a.created_at,u.name AS actor FROM audit_log a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.rowid DESC LIMIT 100').all();return json({events:rows.results});}
  if(path==='/api/admin/invitations'&&method==='POST'){
   const d=await body(req);const address=email(d.email);const id=uuid();const name=text(d.name,100,2);
   const existing=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(address).first();insist(!existing,409,'This person already has an account.');
   await env.DB.prepare('INSERT INTO users (id,email,role,status,name,created_at) VALUES (?,?,\'member\',\'invited\',?,?)').bind(id,address,name,now()).run();
   try{await issue(env,'login',id,address);}catch(error){await env.DB.prepare('DELETE FROM users WHERE id=? AND status=\'invited\'').bind(id).run();throw error;}
   await audit(env,admin.id,'member.invited',id);return json({ok:true},201);
  }
  if(path==='/api/admin/members/status'&&method==='POST'){
   const d=await body(req);const id=text(d.id,100,1);insist(id!==admin.id,400,'You cannot suspend yourself.');insist(d.status==='active'||d.status==='suspended',400,'Invalid status.');
   const found=await env.DB.prepare('SELECT id,status FROM users WHERE id=?').bind(id).first<{id:string;status:string}>();insist(found,404,'Member not found.');insist(found.status!=='invited',409,'An invitation must first be accepted by verified email.');
   await env.DB.batch([env.DB.prepare('UPDATE users SET status=? WHERE id=?').bind(d.status,id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),env.DB.prepare('DELETE FROM tokens WHERE kind=\'login\' AND subject=?').bind(id)]);await audit(env,admin.id,`member.${d.status}`,id);return json({ok:true});
  }
  const review=path.match(/^\/api\/admin\/nominations\/([^/]+)\/review$/);
  if(review&&method==='POST'){
   const d=await body(req);const n=await env.DB.prepare('SELECT * FROM nominations WHERE id=?').bind(review[1]).first<Nomination>();insist(n,404,'Nomination not found.');insist(n.status==='pending'&&n.verified_at,409,'Only verified pending nominations can be reviewed.');
   const notes=text(d.review_notes,1500,10);insist(d.decision==='approve'||d.decision==='decline',400,'Choose approve or decline.');
   if(d.decision==='approve'){
    insist(n.email.toLowerCase()!==admin.email.toLowerCase()&&n.business_email.toLowerCase()!==admin.email.toLowerCase(),403,'Your own recommendation or business needs another independent administrator.');
    insist(d.independent===true&&d.permission===true,400,'Confirm independent review and permission to publish.');
    const contact=safeURL(d.contact_url);const id=uuid();const slug=(n.business.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'professional')+'-'+id.slice(0,8);
    // The conditional INSERT and UPDATE run in one D1 transaction. A concurrent review cannot publish twice.
    const result=await env.DB.batch([
     env.DB.prepare('INSERT INTO listings (id,nomination_id,slug,business,service,category,location,recommendation,contact_url,status,reviewed_at,reviewer_id) SELECT ?,id,?,business,service,category,location,reason,?,\'published\',?,? FROM nominations WHERE id=? AND status=\'pending\'').bind(id,slug,contact,now(),admin.id,n.id),
     env.DB.prepare('UPDATE nominations SET status=\'approved\',reviewed_by=?,review_notes=? WHERE id=? AND status=\'pending\'').bind(admin.id,notes,n.id),
     env.DB.prepare('INSERT INTO audit_log (id,actor_id,action,subject,created_at) SELECT ?,?,\'listing.published\',?,? WHERE EXISTS (SELECT 1 FROM listings WHERE id=?)').bind(uuid(),admin.id,n.id,now(),id)
    ]);insist(result[0].meta.changes===1,409,'This nomination has already been reviewed.');return json({ok:true,slug});
   }
   const result=await env.DB.prepare('UPDATE nominations SET status=\'declined\',reviewed_by=?,review_notes=? WHERE id=? AND status=\'pending\'').bind(admin.id,notes,n.id).run();insist(result.meta.changes===1,409,'This nomination has already been reviewed.');await audit(env,admin.id,'nomination.declined',n.id);return json({ok:true});
  }
  if(path==='/api/admin/listings/status'&&method==='POST'){
   const d=await body(req);const id=text(d.id,100,1);insist(d.status==='suspended',400,'Only suspension is supported here. Re-publication requires a separate review.');const result=await env.DB.prepare('UPDATE listings SET status=\'suspended\' WHERE id=? AND status=\'published\'').bind(id).run();insist(result.meta.changes===1,404,'Published listing not found.');await audit(env,admin.id,'listing.suspended',id);return json({ok:true});
  }
 }
 throw new Failure(404,'Not found.');
}
async function profile(env:Env,req:Request,url:URL,slug:string){
 const l=await env.DB.prepare('SELECT business,service,category,location,recommendation,contact_url,reviewed_at FROM listings WHERE slug=? AND status=\'published\'').bind(slug).first<Record<string,string|number>>();
 insist(l,404,'This professional is not currently listed.');
 const template=await env.ASSETS.fetch(new Request(new URL('/profile-preview.html',url),req));let html=await template.text();
 const content=`<div class="page-intro"><div class="container"><div class="eyebrow">Reviewed public directory · Douglas County</div><h1>${escape(l.business)}</h1><p>${escape(l.service)} · ${escape(l.location)}</p></div></div><section class="section-tight"><div class="container"><a class="text-link" href="/directory.html">← Back to directory</a><article class="demo-profile" style="margin-top:24px"><h2>Why someone recommends them</h2><p class="preserve-lines">${escape(l.recommendation)}</p><p class="small">Firsthand recommendation independently reviewed ${escape(new Date(Number(l.reviewed_at)*1000).toLocaleDateString('en-US',{timeZone:'UTC'}))}. Recommender contact details remain private.</p>${l.contact_url?`<a class="btn btn-primary" rel="noopener noreferrer" href="${escape(l.contact_url)}">Visit their website</a>`:''}<p class="small">A recommendation is not a guarantee. Confirm applicable credentials directly before hiring.</p></article></div></section>`;
 html=html.replace(/<main id="main">[\s\S]*?<\/main>/,`<main id="main">${content}</main>`).replace(/<title>[^<]*<\/title>/,`<title>${escape(l.business)} | VouchRoster</title>`).replace(/<meta name="description"[^>]*\/>/,`<meta name="description" content="${escape(`${l.business}: ${l.service} in ${l.location}. An independently reviewed local recommendation.`)}"/>`).replace(/<meta name="robots"[^>]*>/g,'');
 const canonical=`${env.APP_ORIGIN}/professionals/${slug}`;
 const structured=JSON.stringify({'@context':'https://schema.org','@type':'LocalBusiness',name:l.business,description:l.service,url:canonical,areaServed:{'@type':'AdministrativeArea',name:'Douglas County, Oregon'}}).replace(/</g,'\\u003c');
 html=html.replace('</head>',`<link rel="canonical" href="${escape(canonical)}"/><meta property="og:title" content="${escape(l.business)} | VouchRoster"/><script type="application/ld+json">${structured}</script></head>`).replace(/(["'])assets\//g,'$1/assets/');
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
}
function headers(response:Response,path:string,staging=false){
 const r=new Response(response.body,response);if(staging){r.headers.set('X-Robots-Tag','noindex, nofollow');r.headers.set('Cache-Control','no-store');}r.headers.set('X-Content-Type-Options','nosniff');r.headers.set('Referrer-Policy','no-referrer');r.headers.set('X-Frame-Options','DENY');r.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 // Theme initialization is external; layout styles retain the established prototype presentation.
 r.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
 if(path.startsWith('/api/')||['/member.html','/admin.html','/login.html','/verify.html'].includes(path)){r.headers.set('Cache-Control','no-store');r.headers.set('X-Robots-Tag','noindex, nofollow');}
 return r;
}
export default {
 async fetch(req:Request,env:Env):Promise<Response>{
  const url=new URL(req.url);try{
   validateEnvironment(env,url);
   if(url.pathname.startsWith('/api/'))return headers(await api(req,env,url),url.pathname);
   if(req.method!=='GET'&&req.method!=='HEAD')throw new Failure(405,'Method not allowed.');
   const match=url.pathname.match(/^\/professionals\/([a-z0-9-]+)$/);if(match)return headers(await profile(env,req,url,match[1]),url.pathname,env.STAGING==='true');
   if(url.pathname==='/sitemap.xml'){
    const rows=await env.DB.prepare('SELECT slug FROM listings WHERE status=\'published\' ORDER BY slug').all<{slug:string}>();
    const paths=['/','/directory.html','/community.html','/standards.html',...rows.results.map(r=>'/professionals/'+r.slug)];
    return headers(new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${escape(env.APP_ORIGIN+p)}</loc></url>`).join('')}</urlset>`,{headers:{'Content-Type':'application/xml'}}),url.pathname);
   }
   if(url.pathname==='/robots.txt'&&env.STAGING==='true')return new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain','X-Robots-Tag':'noindex'}});
   if(url.pathname==='/robots.txt')return new Response(`User-agent: *\nDisallow: /api/\nDisallow: /admin.html\nDisallow: /member.html\nDisallow: /verify.html\nDisallow: /login.html\nDisallow: /*-preview.html\nSitemap: ${env.APP_ORIGIN}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain'}});
   let assetRequest=url.pathname==='/'?new Request(new URL('/index.html',url),req):req;
   if(env.STAGING==='true'){assetRequest=new Request(assetRequest);assetRequest.headers.delete('If-None-Match');assetRequest.headers.delete('If-Modified-Since');}
   const assetResponse=await env.ASSETS.fetch(assetRequest);
   if(env.STAGING==='true'&&assetResponse.headers.get('content-type')?.includes('text/html')){
    const html=(await assetResponse.text()).replace('<body>','<body><aside role="note" style="padding:12px 20px;background:#F7F4ED;color:#0F2D3D;text-align:center;border-bottom:1px solid #C79A64">Staging preview · Public nominations are paused. No local test accounts are available here.</aside>');
    const response=new Response(html,assetResponse);response.headers.set('Cache-Control','no-store');response.headers.set('X-Robots-Tag','noindex, nofollow');response.headers.delete('Content-Length');return headers(response,url.pathname);
   }
   return headers(assetResponse,url.pathname);
  }catch(error){
   const status=error instanceof Failure?error.status:500;const message=error instanceof Failure?error.message:'Something went wrong. Please try again.';
   // Do not log request bodies, verification links, cookies, or private records.
   if(!(error instanceof Failure))console.error('Request failed:',url.pathname);
   return headers(url.pathname.startsWith('/api/')?json({error:message},status):new Response(message,{status,headers:{'Content-Type':'text/plain'}}),url.pathname);
  }
 }
};
