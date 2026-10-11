"""Run against npm run dev. Uses synthetic data only; suspends its listing at the end."""
import json,time,os
from pathlib import Path
from datetime import datetime,timedelta,timezone
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:8787'
stamp=str(time.time_ns())
report={'errors':[], 'layouts':[], 'journeys':[]}
output=Path('test-results');output.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 admin=b.new_context();page=admin.new_page()
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 def mail(address,purpose):
  data=page.request.get(BASE+'/api/dev/mail').json()
  return next(x['link'] for x in data['mail'] if x['recipient']==address and x['purpose']==purpose)
 page.goto(BASE+'/login.html');page.locator('#login-email').fill('admin@vouchroster.test');page.locator('#login-form button[type=submit]').click()
 expect(page.locator('#login-form .form-status')).to_contain_text('sign-in link')
 page.goto(mail('admin@vouchroster.test','login'));page.locator('#verify-form button').click();page.wait_for_url('**/member.html')
 expect(page.locator('#member-content')).to_be_visible()
 page.goto(BASE+'/admin.html');expect(page.locator('#admin-content')).to_be_visible()
 address=f'member-{stamp}@example.test'
 page.locator('#invite-name').fill('Synthetic Founding Member');page.locator('#invite-email').fill(address);page.locator('#invite-form button').click()
 expect(page.locator('#invite-form .form-status')).to_contain_text('Invitation sent')
 member=b.new_context();mp=member.new_page();mp.on('pageerror',lambda e:report['errors'].append(str(e)))
 mp.goto(mail(address,'login'));mp.locator('#verify-form button').click();mp.wait_for_url('**/member.html')
 expect(mp.locator('#member-content')).to_be_visible()
 mp.locator('#name').fill('Synthetic Member');mp.locator('#business').fill('Local testing only');mp.locator('#bio').fill('A synthetic profile for workflow validation.');mp.locator('#profile-form button').click();expect(mp.locator('#profile-form .form-status')).to_contain_text('profile is saved')
 mp.locator('#post-title').fill('Synthetic introduction '+stamp);mp.locator('#post-body').fill('An introduction for local validation only.');mp.locator('#post-form button').click();expect(mp.locator('#post-form .form-status')).to_contain_text('Conversation shared')
 post=mp.locator('#posts-list article').filter(has_text='Synthetic introduction '+stamp)
 post.locator('textarea').fill('A local test reply.');post.locator('button[type=submit]').click();expect(post.locator('.form-status')).to_contain_text('Reply shared')
 mp.locator('#event-title').fill('Synthetic optional coffee');mp.locator('#event-description').fill('Test gathering. No real event.');mp.locator('#event-location').fill('Local test only');mp.locator('#event-start').fill((datetime.now()+timedelta(days=3)).strftime('%Y-%m-%dT%H:%M'));mp.locator('#event-form button').click();expect(mp.locator('#event-form .form-status')).to_contain_text('Gathering shared')
 report['journeys'].append('Invited member verified email, edited private profile, posted introduction/reply and shared gathering')
 mp.goto(BASE+'/admin.html');expect(mp.locator('#access-message')).to_contain_text('Administrator access is required');expect(mp.locator('#admin-content')).not_to_be_visible()
 visitor=b.new_context();vp=visitor.new_page();vp.on('pageerror',lambda e:report['errors'].append(str(e)))
 vp.goto(BASE+'/nominate.html')
 customer=f'customer-{stamp}@example.test';business='Synthetic Test Business '+stamp
 for field,value in {'nominator':'Synthetic Customer','email':customer,'pro':business,'service':'Local testing only','location':'Roseburg','why':'A synthetic recommendation to validate independent review. Not a real endorsement.'}.items():vp.locator('#'+field).fill(value)
 vp.locator('#nomination-category').select_option('Automotive');vp.locator('#relationship').select_option(index=1);vp.locator('input[name=consent]').check();vp.locator('#nomination-form button[type=submit]').click();expect(vp.locator('#nomination-form .form-status')).to_contain_text('Check your email')
 assert all(x['business']!=business for x in vp.request.get(BASE+'/api/directory').json()['listings'])
 vp.goto(mail(customer,'nomination'));vp.locator('#verify-form button').click();expect(vp.locator('#verify-form .form-status')).to_contain_text('awaiting independent review')
 page.reload();review=page.locator('#nominations-list article').filter(has_text=business)
 expect(review).to_be_visible();review.locator('textarea').fill('Synthetic test. Firsthand basis, conflicts, permission and checks reviewed for workflow validation only.');review.locator('input[name=independent]').check();review.locator('input[name=permission]').check();review.locator('button[type=submit]').click();expect(page.locator('#admin-listings')).to_contain_text(business)
 vp.goto(BASE+'/directory.html');vp.locator('#what').fill(stamp);vp.locator('#directory-form button[type=submit]').click();expect(vp.locator('#directory-list')).to_contain_text(business)
 vp.locator('#directory-list a').click();expect(vp.locator('h1')).to_have_text(business);assert len(vp.content())>5000
 assert vp.locator('link[rel=canonical]').count()==1
 report['journeys'].append('Public nomination verified, independently approved, searched and server-rendered as a business profile')
 for width in [320,375,768,1440]:
  page.set_viewport_size({'width':width,'height':900})
  for theme in ['light','dark']:
   page.goto(BASE+'/');page.evaluate('(t)=>localStorage.setItem("vouchroster-theme",t)',theme)
   for path in ['/','/directory.html','/nominate.html','/community.html','/standards.html','/login.html','/member.html','/admin.html']:
    response=page.goto(BASE+path,wait_until='domcontentloaded')
    page.wait_for_timeout(100)
    if path in ['/member.html','/admin.html']:expect(page.locator('#'+('member' if path=='/member.html' else 'admin')+'-content')).to_be_visible()
    size=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme})')
    report['layouts'].append({'path':path,'status':response.status,**size})
 page.set_viewport_size({'width':375,'height':900});page.goto(BASE+'/');page.locator('#nav-toggle').click();expect(page.locator('#site-menu')).to_be_visible();page.locator('#site-menu a').first.click();expect(page.locator('#nav-toggle')).to_have_attribute('aria-expanded','false')
 before=page.locator('html').get_attribute('data-theme');page.locator('#theme-toggle').click();assert page.locator('html').get_attribute('data-theme')!=before
 page.goto(BASE+'/member.html');page.screenshot(path=str(output/'member-mobile.png'),full_page=True)
 page.goto(BASE+'/admin.html');listing=page.locator('#admin-listings article').filter(has_text=business);page.once('dialog',lambda d:d.accept());listing.get_by_role('button',name='Suspend listing').click();expect(page.locator('#admin-listings')).to_contain_text(business+' · suspended')
 assert not any(x['business']==business for x in vp.request.get(BASE+'/api/directory').json()['listings'])
 report['journeys'].append('Suspended synthetic listing removed from public directory; no fake test listing remains published')
 # Keep local development data unmistakably synthetic; do not create public endorsements in the seed.
 b.close()
(output/'browser-smoke.json').write_text(json.dumps(report,indent=2))
overflow=[x for x in report['layouts'] if x['scroll']>x['width']]
print(json.dumps({'layout_checks':len(report['layouts']),'overflow':overflow,'errors':report['errors'],'journeys':report['journeys']},indent=2))
assert not report['errors'],'Browser JavaScript exceptions'
assert not overflow,'Responsive layout overflow'
