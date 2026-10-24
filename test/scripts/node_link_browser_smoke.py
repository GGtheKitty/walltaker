# Manual HTTPS lifecycle smoke check. Requires a disposable NodeMgmtCheck account.
from pathlib import Path
import argparse
from html.parser import HTMLParser
import http.cookiejar
import json
import secrets
import string
import urllib.request
import urllib.error
import urllib.parse

arguments = argparse.ArgumentParser()
arguments.add_argument('--base-url', required=True)
arguments.add_argument('--fixture', type=Path, required=True)
options = arguments.parse_args()
root = Path(__file__).resolve().parents[2]
fixture_path = options.fixture.resolve()
fixture = json.loads(fixture_path.read_text())
assert fixture['username'].startswith('NodeMgmtCheck'), 'Use a disposable test account'
base = options.base_url.rstrip('/')
assert urllib.parse.urlsplit(base).scheme == 'https', 'HTTPS is required'
jar = http.cookiejar.CookieJar()
name, value = fixture['cookie'].split('=',1)
jar.set_cookie(http.cookiejar.Cookie(0,name,value,None,False,urllib.parse.urlsplit(base).hostname,False,False,'/',True,True,None,True,None,None,{},False))
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.csrf=None; self.inputs={}; self.feed(text)
    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag=='meta' and attrs.get('name')=='csrf-token': self.csrf=attrs.get('content')
        if tag=='input' and attrs.get('name'): self.inputs[attrs['name']]=attrs.get('value')

token = None
def request(path, data=None, expected=200):
    global token
    headers = {'User-Agent':'Walltaker-Management-Migration-Check'}
    encoded = None
    if data is not None:
        headers['X-CSRF-Token'] = token or ''
        encoded = urllib.parse.urlencode(data,doseq=True).encode()
    req = urllib.request.Request(base+path,data=encoded,headers=headers)
    try: response = opener.open(req,timeout=30)
    except urllib.error.HTTPError as error: response=error
    body = response.read().decode()
    if response.status not in (expected if isinstance(expected, tuple) else (expected,)):
        with (root/'tmp/node-link-browser-error.html').open('w') as stream: stream.write(body)
        raise AssertionError(f'{path}: expected {expected}, got {response.status}')
    page = Page(body)
    if page.csrf: token=page.csrf
    return body,response.geturl(),response.headers,page

body,_,_,_ = request('/links/new')
assert token and fixture['username'] in body,'Browser session was not authenticated'
for key in ('link_id', 'wizard_id'):
    if fixture.get(key):
        request('/links/'+fixture.pop(key),{'_method':'delete'},expected=(200,404))
fixture_path.write_text(json.dumps(fixture))
slug = 'node-mgmt-check-'+''.join(secrets.choice(string.ascii_lowercase) for _ in range(12))
body,url,_,_ = request('/links',{'link[never_expires]':'1','link[min_score]':'0','link[terms]':'Temporary management migration check','link[custom_url]':slug})
link_id = urllib.parse.urlsplit(url).path.split('/')[-1]
assert link_id.isdigit(), 'Link creation did not redirect to a link'
fixture['link_id']=link_id
fixture_path.write_text(json.dumps(fixture))
print('Browser creation and signed-session/CSRF checks passed.')

request('/links/'+link_id,{'_method':'patch','link[theme]':'forest','link[min_score]':'42','link[terms]':'Updated migration check'})
body,_,_,page = request('/links/'+link_id+'/edit')
assert page.inputs.get('link[theme]')=='forest'
body,_,_,_ = request('/links/'+link_id,{'_method':'patch','link[theme]':'two tags'},expected=422)
assert 'must be only 1 tag.' in body
_,_,_,page = request('/links/'+link_id+'/edit')
assert page.inputs.get('link[theme]')=='forest','Invalid edit changed saved settings'
request('/links/'+slug)
print('Settings, custom URL lookup and validation rollback passed.')

body,_,_,_ = request('/links/'+link_id+'/abilities/can_show_videos',{})
assert 'Disable videos' in body
body,_,_,_ = request('/links/'+link_id+'/abilities/can_show_videos',{})
assert 'Enable videos' in body
request('/links/'+link_id+'/abilities/is_master_only',{},expected=403)
text,_,headers,_ = request('/links/'+link_id+'/walltaker')
assert 'application/toml' in headers['Content-Type']
assert f'feed = {link_id}' in text and 'mode = "crop"' in text
print('Ability toggles, leash-owner restriction and client export passed.')

_,url,_,_ = request('/links/wizard')
wizard_id = urllib.parse.urlsplit(url).path.split('/')[2]
assert wizard_id.isdigit()
fixture['wizard_id']=wizard_id
fixture_path.write_text(json.dumps(fixture))
steps = [('intro',{'gooner':'false'},'summon'),('summon',{'impatient':'true'},'control'),
         ('control',{'protect':'3'},'kinks'),('kinks',{'terms':'Wizard migration check'},'gender'),
         ('gender',{'blacklisted_genders[]':['female']},'surprise'),('surprise',{'theme':'forest'},'no_fun'),
         ('no_fun',{'friends_only':'true'},'orgasmic_conclusion')]
for step,data,next_step in steps:
    _,url,_,_=request(f'/links/{wizard_id}/wizard/{step}/apply',data)
    assert urllib.parse.urlsplit(url).path.endswith('/'+next_step),f'Wizard did not advance after {step}'
print('Entire browser wizard completed through Node.')
body,_,_,_=request('/links')
assert '/links/'+link_id in body and '/links/'+wizard_id in body
for current in [link_id,wizard_id]: request('/links/'+current,{'_method':'delete'})
body,_,_,_=request('/links')
assert '/links/'+link_id not in body and '/links/'+wizard_id not in body
print('Personal link listing and deletion passed; temporary links were removed.')

fixture.pop('link_id', None)
fixture.pop('wizard_id', None)
fixture_path.write_text(json.dumps(fixture))
