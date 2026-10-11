(() => {
  // System theme by default. User selection persists across pages.
  const themeButton = document.getElementById('theme-toggle');
  const themeKey = 'vouchroster-theme';
  const preferred = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => document.documentElement.getAttribute('data-theme') || (preferred.matches ? 'dark' : 'light');
  const updateThemeControl = () => {
    const isDark = currentTheme() === 'dark';
    if (!themeButton) return;
    themeButton.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeButton.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    const label = themeButton.querySelector('.theme-text');
    if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0C1C28' : '#0F2D3D');
  };
  themeButton?.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(themeKey, next); } catch (e) { /* privacy mode */ }
    updateThemeControl();
  });
  preferred.addEventListener?.('change', event => {
    let saved = null;
    try { saved = localStorage.getItem(themeKey); } catch (e) { /* privacy mode */ }
    if (saved !== 'light' && saved !== 'dark') {
      document.documentElement.setAttribute('data-theme', event.matches ? 'dark' : 'light');
      updateThemeControl();
    }
  });
  updateThemeControl();
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('site-menu');
  toggle?.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    toggle.textContent = open ? '×' : '☰';
  });
  document.querySelectorAll('#site-menu a').forEach(link => link.addEventListener('click', () => {
    menu?.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
  }));


})();

(() => {
  const $=s=>document.querySelector(s);
  function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function link(text,href){const el=node('a',text);el.href=href;return el;}
  async function api(path,data){
    let response;
    try{response=await fetch(path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),credentials:'same-origin'});}catch{throw new Error('Unable to connect. Please try again.');}
    const result=await response.json();if(!response.ok){const error=new Error(result.error||'Unable to complete this request.');error.status=response.status;throw error;}return result;
  }
  function status(form,message,error=false){let el=form.querySelector('.form-status');if(!el){el=node('p');el.className='form-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');form.append(el);}el.classList.toggle('error',error);el.textContent=message;}
  function form(selector,handler){const el=$(selector);if(!el)return;el.addEventListener('submit',async event=>{event.preventDefault();if(!el.reportValidity())return;const button=el.querySelector('button[type=submit]');if(button)button.disabled=true;status(el,'Working…');try{await handler(el);}catch(error){status(el,error.message,true);}finally{if(button)button.disabled=false;}});}
  function button(label,handler){const el=node('button',label,'btn btn-secondary');el.type='button';el.addEventListener('click',async()=>{el.disabled=true;try{await handler();}catch(error){const message=node('p',error.message,'form-status error');message.setAttribute('role','alert');el.parentNode.append(message);}finally{el.disabled=false;}});return el;}
  function card(title){const el=node('article',undefined,'workflow-card');el.append(node('h3',title));return el;}
  function input(form,name,label,{type='text',max=120,required=true,textarea=false}={}){const wrap=node('div',undefined,'field');const id=name+'-'+crypto.randomUUID();const labelEl=node('label',label);labelEl.htmlFor=id;const el=node(textarea?'textarea':'input');el.id=id;el.name=name;el.maxLength=max;el.required=required;if(!textarea)el.type=type;wrap.append(labelEl,el);form.append(wrap);return el;}
  function check(form,name,label){const wrap=node('label',undefined,'check-label');const el=node('input');el.type='checkbox';el.name=name;el.required=true;wrap.append(el,node('span',label));form.append(wrap);}
  function values(el){return Object.fromEntries(new FormData(el));}
  function signedOut(message='Please sign in to view the private community.'){const target=$('#access-message');if(target){target.replaceChildren(node('span',message+' '),link('Member Login','/login.html'));}}
  async function mailbox(){const wrapper=$('#local-mailbox');if(!wrapper)return;try{const result=await api('/api/dev/mail');wrapper.hidden=false;$('#mail-list').replaceChildren(...result.mail.map(m=>{const el=link(`${m.recipient} — ${m.purpose==='login'?'Sign-in link':'Nomination verification'}`,m.link);el.className='mail-item';return el;}));}catch{/* Local-only facility is absent in production. */}}
  $('#refresh-mail')?.addEventListener('click',mailbox);
  form('#login-form',async el=>{const r=await api('/api/auth/request',{email:$('#login-email').value});status(el,r.message);await mailbox();});
  if($('#verify-form')){
    const params=new URLSearchParams(location.search);const token=params.get('token');const kind=params.get('kind');history.replaceState({},'','/verify.html');
    $('#verify-description').textContent=kind==='nomination'?'Verify your email to send this nomination for independent review.':'Confirm your email to sign in or accept your membership invitation.';
    form('#verify-form',async el=>{if(!token||!['login','nomination'].includes(kind))throw new Error('Open the complete verification link from your email.');const result=await api(kind==='login'?'/api/auth/verify':'/api/nominations/verify',{token});if(kind==='login')location.assign('/member.html');else{status(el,result.message);el.querySelector('button').remove();el.append(link('Return to the directory','/directory.html'));}});
  }
  form('#nomination-form',async el=>{const d=values(el);d.consent=el.elements.consent.checked;const result=await api('/api/nominations',d);status(el,result.message);el.reset();});
  let directoryPage=1,directoryGeneration=0;
  async function directory(){
    const generation=++directoryGeneration;const q=$('#what').value.trim(),category=$('#category').value,county=$('#county').value;
    const params=new URLSearchParams({q,category,county,page:String(directoryPage)});history.replaceState({},'',`${location.pathname}?${params}`);
    $('#directory-response').textContent='Searching reviewed listings…';
    const result=await api('/api/directory?'+params);if(generation!==directoryGeneration)return;
    $('#directory-response').textContent=county!=='douglas'?'This county is planned for a future chapter. Douglas County is our only active community.':result.total?`${result.total} reviewed ${result.total===1?'professional':'professionals'}.`:q||category?'No approved listings match this search.':'We’re gathering firsthand recommendations. There are no approved public listings yet.';
    $('#directory-list').replaceChildren(...result.listings.map(l=>{const c=card(l.business);c.append(node('p',`${l.service} · ${l.location}`),node('p',l.recommendation),link('Read the recommendation →','/professionals/'+l.slug));return c;}));
    $('#previous-page').disabled=directoryPage<=1;$('#next-page').disabled=directoryPage*20>=result.total;$('#page-label').textContent=result.total?'Page '+directoryPage:'';$('.pagination').hidden=result.total<=20;
  }
  if($('#directory-form')){
    const params=new URLSearchParams(location.search);$('#what').value=(params.get('q')||'').slice(0,100);const category=params.get('category');const found=[...$('#category').options].find(o=>o.value.toLowerCase()===category?.toLowerCase());if(found)$('#category').value=found.value;
    if([...$('#county').options].some(o=>o.value===params.get('county')))$('#county').value=params.get('county');directoryPage=Math.floor(Math.min(10000,Math.max(1,Number(params.get('page'))||1)));
    form('#directory-form',async el=>{directoryPage=1;await directory();status(el,'');});
    $('#previous-page').addEventListener('click',()=>{directoryPage--;directory().catch(e=>$('#directory-response').textContent=e.message);});$('#next-page').addEventListener('click',()=>{directoryPage++;directory().catch(e=>$('#directory-response').textContent=e.message);});
    directory().catch(e=>$('#directory-response').textContent=e.message);
  }
  async function members(){const r=await api('/api/members');$('#members-list').replaceChildren(...r.members.map(m=>{const c=card(m.name);c.append(node('p',m.business),node('p',m.bio),node('p',m.interests));if(m.contact)c.append(node('p','Contact: '+m.contact));return c;}));}
  async function posts(){const r=await api('/api/posts');$('#posts-list').replaceChildren(...r.posts.map(p=>{
    const c=card(p.title);c.append(node('p',p.body),node('p',p.author||'Community member','small'));
    const replies=node('div');const replyForm=node('form');const reply=input(replyForm,'body','Your reply',{textarea:true,max:2000});const send=node('button','Reply','btn btn-primary');send.type='submit';replyForm.append(send);
    async function refresh(){const r=await api('/api/posts/'+p.id+'/replies');replies.replaceChildren(...r.replies.map(x=>{const section=node('div',undefined,'workflow-card');section.append(node('p',x.body),node('p',x.author||'Community member','small'));return section;}));}
    c.append(button('Read replies',refresh),replies,replyForm);
    replyForm.addEventListener('submit',async event=>{event.preventDefault();if(!replyForm.reportValidity())return;send.disabled=true;try{await api('/api/posts/'+p.id+'/replies',{body:reply.value});reply.value='';await refresh();status(replyForm,'Reply shared.');}catch(e){status(replyForm,e.message,true);}finally{send.disabled=false;}});return c;
  }));if(!r.posts.length)$('#posts-list').append(node('p','Introduce yourself or ask a thoughtful local question.'));}
  async function events(){const r=await api('/api/events');$('#events-list').replaceChildren(...r.events.map(e=>{const c=card(e.title);c.append(node('p',e.description),node('p',`${new Date(e.starts_at).toLocaleString()} · ${e.location}`),node('p','Shared by '+(e.author||'a member')+'. Participation is optional.','small'));return c;}));if(!r.events.length)$('#events-list').append(node('p','No upcoming gatherings. Feel free to suggest a coffee or shop visit.'));}
  form('#profile-form',async el=>{await api('/api/profile',values(el));status(el,'Your private member profile is saved. Public listings are reviewed separately.');await members();});
  form('#post-form',async el=>{await api('/api/posts',{title:$('#post-title').value,body:$('#post-body').value});el.reset();status(el,'Conversation shared.');await posts();});
  form('#event-form',async el=>{await api('/api/events',{title:$('#event-title').value,description:$('#event-description').value,location:$('#event-location').value,starts_at:new Date($('#event-start').value).toISOString()});el.reset();status(el,'Gathering shared. Attendance is always optional.');await events();});
  async function nominations(){const r=await api('/api/admin/nominations');$('#nominations-list').replaceChildren(...r.nominations.map(n=>{
    const c=card(n.business+' · '+n.status);c.append(node('p',n.service+' · '+n.location),node('p',n.reason),node('p',`Nominated by ${n.nominator} (${n.email}). Relationship: ${n.relationship}.`),node('p',n.business_email?'Business contact: '+n.business_email:''),node('p',n.notes||''));
    if(n.status==='pending'){
      const f=node('form',undefined,'review-form');const notes=input(f,'review_notes','Review notes: firsthand basis, disclosures, applicable credential checks and permission evidence',{textarea:true,max:1500});notes.minLength=10;
      input(f,'contact_url','Business website (optional; HTTPS)',{type:'url',max:500,required:false});check(f,'independent','I am independent of this recommendation/business and have checked any disclosed conflicts.');check(f,'permission','I have permission to publish the business details and recommendation text.');
      const approve=node('button','Approve public listing','btn btn-primary');approve.type='submit';const decline=button('Decline nomination',async()=>{if(notes.value.trim().length<10)throw new Error('Please record at least 10 characters of review notes.');await api('/api/admin/nominations/'+n.id+'/review',{decision:'decline',review_notes:notes.value});await adminRefresh();});f.append(approve,decline);
      f.addEventListener('submit',async event=>{event.preventDefault();if(!f.reportValidity())return;approve.disabled=true;try{await api('/api/admin/nominations/'+n.id+'/review',{decision:'approve',review_notes:notes.value,contact_url:f.elements.contact_url.value,independent:f.elements.independent.checked,permission:f.elements.permission.checked});await adminRefresh();}catch(e){status(f,e.message,true);}finally{approve.disabled=false;}});c.append(f);
    }else c.append(node('p',n.review_notes||'','small'));return c;
  }));if(!r.nominations.length)$('#nominations-list').append(node('p','No verified nominations awaiting review.'));}
  async function adminMembers(){const r=await api('/api/admin/members');$('#admin-members').replaceChildren(...r.members.map(m=>{const c=card(m.name||m.email);c.append(node('p',`${m.email} · ${m.role} · ${m.status}`));if(m.status!=='invited')c.append(button(m.status==='active'?'Suspend membership':'Restore membership',async()=>{await api('/api/admin/members/status',{id:m.id,status:m.status==='active'?'suspended':'active'});await adminRefresh();}));return c;}));}
  async function adminListings(){const r=await api('/api/admin/listings');$('#admin-listings').replaceChildren(...r.listings.map(l=>{const c=card(l.business+' · '+l.status);if(l.status==='published')c.append(link('View listing','/professionals/'+l.slug),button('Suspend listing',async()=>{if(!confirm('Suspend this public listing?'))return;await api('/api/admin/listings/status',{id:l.id,status:'suspended'});await adminRefresh();}));return c;}));}
  async function adminAudit(){const r=await api('/api/admin/audit');$('#admin-audit').replaceChildren(...r.events.map(e=>node('p',`${new Date(e.created_at*1000).toLocaleString()} · ${e.actor} · ${e.action}`)));}
  async function adminRefresh(){await Promise.all([nominations(),adminMembers(),adminListings(),adminAudit()]);}
  form('#invite-form',async el=>{await api('/api/admin/invitations',{name:$('#invite-name').value,email:$('#invite-email').value});el.reset();status(el,'Invitation sent. Membership does not publish a listing.');await adminRefresh();});
  async function initialize(){
    if($('#login-form'))await mailbox();
    let current;try{current=(await api('/api/me')).user;}catch(e){if($('#member-content')||$('#admin-content'))signedOut(e.status===401?undefined:e.message);return;}
    const menu=$('#site-menu');const loginLink=menu?.querySelector('a[href="login.html"]');if(loginLink){loginLink.href='/member.html';loginLink.textContent='Member Space';}
    if(current.role==='admin'&&menu)menu.append(link('Admin','/admin.html'));
    if(menu)menu.append(button('Sign out',async()=>{await api('/api/auth/logout',{});location.assign('/login.html');}));
    if($('#member-content')){
      $('#access-message').textContent='Welcome, '+(current.name||'friend')+'. This space is private to active members.';$('#member-content').hidden=false;
      for(const key of ['name','business','bio','interests','contact'])$('#'+key).value=current[key]||'';
      await Promise.all([members(),posts(),events()]);
    }
    if($('#admin-content')){if(current.role!=='admin'){signedOut('Administrator access is required.');return;}$('#access-message').textContent='Signed in as '+current.name;$('#admin-content').hidden=false;await adminRefresh();}
  }
  initialize().catch(e=>{const target=$('#access-message');if(target)target.textContent=e.message;});
})();
