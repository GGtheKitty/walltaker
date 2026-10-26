import copy from './fixtures/original-copy.json' with {type:'json'};
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../src/app.js';
import {Router} from '../src/router.js';
import {addProfileRoutes} from '../src/profile-routes.js';
import {HttpError} from '../src/errors.js';
import {MARKDOWN_MARKER,filterProfileDomains,renderedProfile,sanitizeProfileHTML,dumpMarkdown,normalizeHostname} from '../src/profile-content.js';

const now=new Date().toISOString();
const post=fields=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({authenticity_token:'valid',...fields})});
async function fixture(t,{anonymous=false}={}){
  const state={calls:[],anonymous,users:[{id:7,username:'Alice',mascot:'ki',advanced:false,profile_id:41,set_count:30},{id:8,username:'Bob',mascot:'warren',advanced:true,profile_id:42,set_count:40}],profiles:[{id:41,user_id:7,name:'First style',content:MARKDOWN_MARKER+'# Original\n\n**Biography**',public:true,updated_at:now},{id:42,user_id:8,name:'Private style',content:'<p>Other profile</p>',public:false,updated_at:now},{id:43,user_id:8,name:'Shared style',content:'<div>Shared</div><style>body {--accent:green}</style>',public:true,updated_at:now}],memberships:[{id:1,user_id:7,kink_id:21,is_starred:true}],kinks:[{id:21,name:'test_kink',works_on_e621:false}],links:[{id:12,user_id:7,never_expires:true,friends_only:false,terms:'Link terms',blacklist:'',min_score:0}]};
  const graph=()=>structuredClone({users:state.users,profiles:state.profiles,links:state.links,memberships:state.memberships,kinks:state.kinks,past_links:[],abilities:[],leashes:[],icons:[]});
  const backend=async(group,op,input)=>{
    state.calls.push({group,op,input});
    if(group==='browser'){
      if(op==='context')return {user:state.anonymous?null:structuredClone(state.users[0]),graph:graph(),csrf_token:'valid',flags:{}};
      if(op==='csrf')return {verified:input.tokens.includes('valid')};if(op==='authorize')return {allowed:true};
      if(op==='hydrate')return {graph:graph()};
      if(op==='profile-page'){
        const user=state.users.find(u=>String(u.id)===String(input.username)||u.username===input.username);if(!user)throw new HttpError(404,'User not found.');
        const g=graph();if(input.private&&!state.anonymous&&user.id===7)g.users.find(u=>u.id===7).api_key='OWNER-KEY-SENTINEL';
        return {user_id:user.id,graph:g,is_current_user:!state.anonymous&&user.id===7,has_friendship:false,link_ids:state.links.filter(l=>l.user_id===user.id).map(l=>l.id),past_link_ids:[],profile_ids:!state.anonymous&&user.id===7?state.profiles.filter(p=>p.user_id===7).map(p=>p.id):[],any_links_online:false};
      }
      if(['profile-style','profile-preview'].includes(op)){
        const profile=state.profiles.find(p=>String(p.id)===String(input.profile_id)&&p.public);if(!profile)throw new HttpError(404,'Profile not found.');
        return {profile_id:profile.id,preview_user_id:8,link_ids:[],past_link_ids:[],graph:graph()};
      }
      if(op==='profiles'){const profiles=state.profiles.filter(p=>p.public&&(input.user_id==null||String(p.user_id)===String(input.user_id)));return {graph:graph(),profile_ids:profiles.map(p=>p.id),count:profiles.length,page:1,user_id:input.user_id || null};}
    }
    if(group==='moderation')return op==='domain-rules'?{rules:[{domain:'blocked.invalid',status:2}]}:{recorded:true};
    if(group==='tracker')return op==='form'?{pornlizard:null,friends:[],recent_setters:[]}:(state.statistics?.[input.username] || {days:[],total:0,caused:0,nnn_enabled:false,current:null});
    if(group==='activity')return {visit:{id:1}};
    if(group==='accounts'){
      const owned=()=>{const p=state.profiles.find(p=>String(p.id)===String(input.profile_id)&&p.user_id===7);if(!p)throw new HttpError(403,'Not authorized.');return p;};
      if(op==='profile-content'){if(input.expected_advanced!==state.users[0].advanced)throw new HttpError(409,'Mode changed');state.profiles.find(p=>p.id===state.users[0].profile_id).content=input.content;}
      if(op==='profile-mode'){state.users[0].advanced=!state.users[0].advanced;if(input.html)state.profiles.find(p=>p.id===state.users[0].profile_id).content=input.html;}
      if(op==='profile-create'){state.profiles.push({id:44,user_id:7,name:'New style',content:'',public:false,updated_at:now});state.users[0].profile_id=44;}
      if(op==='profile-rename')owned().name=input.name;
      if(op==='profile-share')owned().public=input.public==='1';
      if(op==='profile-select')state.users[0].profile_id=owned().id;
      if(op==='profile-delete'){const p=owned();state.profiles=state.profiles.filter(row=>row.id!==p.id);if(state.users[0].profile_id===p.id)state.users[0].profile_id=41;}
      if(op==='profile-copy'){const p=state.profiles.find(p=>String(p.id)===String(input.profile_id)&&p.public);if(!p)throw new HttpError(403,'Private style');state.profiles.push({...p,id:45,user_id:7,public:false});state.users[0].profile_id=45;}
      return {};
    }
    if(group==='social'){
      if(op==='notifications')return {notifications:[]};if(op==='friend-requests-count')return {count:0};
      if(op==='kinks'){const u=state.users.find(u=>u.username===input.username);if(!u)throw new HttpError(404,'Missing user');return {user:u,kinks:state.kinks.filter(k=>state.memberships.some(h=>h.user_id===u.id&&h.kink_id===k.id))};}
      if(op==='kink')return {kink:state.kinks.find(k=>String(k.id)===String(input.kink_id)),users:state.users.slice(0,1)};
      if(op==='kink-star'){const h=state.memberships.find(h=>h.user_id===7&&String(h.kink_id)===String(input.kink_id));h.is_starred=!h.is_starred;return {kink_id:h.kink_id};}
      if(op==='kink-add'){state.kinks.push({id:22,name:input.name,works_on_e621:false});state.memberships.push({id:2,user_id:7,kink_id:22,is_starred:false});return {kink_id:22};}
      if(op==='kink-remove'){state.memberships=state.memberships.filter(h=>!(h.user_id===7&&String(h.kink_id)===String(input.kink_id)));return {kink_id:input.kink_id};}
      if(op==='kink-status')return {works:true};
      if(op==='community-interests')return {count:1,page:1,kinks:state.kinks.slice(0,1),previews:{21:{count:1,users:1,links:state.links}}};
      if(op==='community-links')return {count:1,page:1,kink:state.kinks[0],links:state.links};
    }
    if(group==='e621')return [{id:1}];
    throw new Error('Unexpected '+group+'/'+op);
  };
  const router=new Router();addProfileRoutes(router);const server=http.createServer(createApp({baseUrl:'http://localhost',secretKeyBase:'profile-tests',backendUrl:'http://localhost'}, {router,backend,proxy:()=>{throw Error('Rails unavailable');},logger:{error(){}}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {state,get:(path,options={})=>fetch('http://localhost:'+server.address().port+path,{redirect:'manual',...options})};
}
test('profile, editor, style and interest pages all render with the Rails fallback unavailable',async t=>{
  const {get}=await fixture(t);
  for(const path of ['/users/Alice','/users/Alice/edit','/users/7/details','/profiles','/users/7/profiles','/profiles/41','/profiles/43/preview','/users/Alice/kinks','/kinks/new','/kinks/21','/link_lists','/link_lists?filter=mine','/link_lists/21']){const r=await get(path);assert.equal(r.status,200,path);assert.equal(r.headers.get('x-walltaker-renderer'),'node-native',path);const body=await r.text();assert.doesNotMatch(body,/undefined/);}
});
test('custom profile content stays inside its document and report controls remain in the outer shell',async t=>{
  const {get}=await fixture(t,{anonymous:true});
  const shell=await get('/users/Alice');const body=await shell.text();assert.match(body,/class="profile-shell__document"/);assert.match(body,/class="profile-shell__report"/);assert.doesNotMatch(body,/<h1>Original/);assert.doesNotMatch(body,/OWNER-KEY/);
  assert.equal((await get('/users/Alice/profile-document')).headers.get('location'),'/users/Alice');
  const document=await get('/users/Alice/profile-document',{headers:{'sec-fetch-dest':'iframe'}});assert.equal(document.status,200);assert.equal(document.headers.get('x-robots-tag'),'noindex, nofollow');const content=await document.text();assert.match(content,/<base target="_top">/);assert.match(content,/<h1>Original/);assert.doesNotMatch(content,/OWNER-KEY/);
  assert.equal((await get('/users/Alice/edit')).headers.get('location'),'/login');assert.equal((await get('/profiles')).headers.get('location'),'/login');
});
test('own document contains private key only for the owner; foreign writes and private styles stay protected',async t=>{
  const {get}=await fixture(t);
  const own=await get('/users/Alice/profile-document',{headers:{'sec-fetch-dest':'iframe'}});assert.match(await own.text(),/OWNER-KEY-SENTINEL/);
  const other=await get('/users/Bob/profile-document',{headers:{'sec-fetch-dest':'iframe'}});assert.doesNotMatch(await other.text(),/OWNER-KEY-SENTINEL/);
  assert.equal((await get('/users/Bob/edit')).headers.get('location'),'/users/Bob');
  assert.equal((await get('/users/8',post({_method:'patch','user[details]':'Stolen'}))).status,403);
  assert.equal((await get('/profiles/42')).status,404);assert.equal((await get('/profiles/42',post({_method:'patch','profile_adder_form[profile_id]':'42'}))).status,403);
  assert.equal((await get('/profiles/42',post({_method:'patch','profile_rename_form[name]':'Stolen'}))).status,403);
});
test('Markdown saves use Node preparation, filter blocked domains, record seen domains and enforce CSRF',async t=>{
  const {state,get}=await fixture(t);
  const result=await get('/users/7',post({_method:'patch','user[details]':'# Saved\n\n[Blocked](https://blocked.invalid) [OK](https://example.com)','user[advanced]':'true'}));assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/users/Alice');
  const saved=state.profiles[0].content;assert.ok(saved.startsWith(MARKDOWN_MARKER));assert.doesNotMatch(saved,/https:\/\/blocked/);assert.match(saved,/https:\/\/example.com/);assert.ok(state.calls.some(c=>c.group==='moderation'&&c.op==='domain-seen'));
  const invalid=await get('/users/7',post({_method:'patch',authenticity_token:'bad','user[details]':'Must not save'}));assert.equal(invalid.status,422);assert.equal(state.profiles[0].content,saved);
});
test('mode switching excludes prefetch/HEAD/foreign GETs and converts prepared Markdown once',async t=>{
  const {state,get}=await fixture(t);
  await get('/users/Alice/toggle_details_mode',{method:'HEAD'});assert.equal(state.users[0].advanced,false);
  assert.equal((await get('/users/Alice/toggle_details_mode',{headers:{'sec-fetch-site':'cross-site'}})).status,403);assert.equal(state.users[0].advanced,false);
  assert.equal((await get('/users/Alice/toggle_details_mode')).status,302);assert.equal(state.users[0].advanced,true);assert.match(state.profiles[0].content,/<h1>Original/);
  const editor=await get('/users/Alice/edit');const body=await editor.text();assert.match(body,/hey-monaco-editor/);assert.match(body,/data-wall-editor-source-value=/);
  await get('/users/7',post({_method:'patch','user[details]':'<div>HTML</div><!-- EDITORSPLIT --><style>body {--accent:red}</style>'}));assert.match(state.profiles[0].content,/EDITORSPLIT/);
});
test('style create, rename, share, install, select and delete preserve Node ownership and fresh state',async t=>{
  const {state,get}=await fixture(t);
  assert.equal((await get('/profiles',post({}))).status,303);assert.equal(state.users[0].profile_id,44);
  await get('/profiles/44',post({_method:'patch','profile_rename_form[name]':'Renamed','profile_rename_form[profile_id]':'42'}));assert.equal(state.profiles.find(p=>p.id===44).name,'Renamed');
  const invalid=await get('/profiles/44',post({_method:'patch'}));assert.equal(invalid.status,400);assert.equal(state.profiles.find(p=>p.id===44).public,false);
  const share=await get('/profiles/44',post({_method:'patch','profile[public]':'1'}));assert.match(share.headers.get('content-type'),/turbo-stream/);assert.match(await share.text(),/checked/);
  await get('/profiles/43',post({_method:'patch','profile_adder_form[profile_id]':'43'}));assert.equal(state.users[0].profile_id,45);
  await get('/users/7/profile',post({'profile_selector_form[profile_id]':'41'}));assert.equal(state.users[0].profile_id,41);
  await get('/profiles/44',post({_method:'delete'}));assert.ok(!state.profiles.some(p=>p.id===44));
});
test('shared style previews use the signed-in viewer chart instead of mock-user statistics',async t=>{
  const {state,get}=await fixture(t);
  state.statistics={Alice:{days:[{day:'2026-10-24',count:2},{day:'2026-10-25',count:3}],total:5,caused:7,nnn_enabled:true,current:{year:2026}},Bob:{days:[{day:'2026-10-25',count:99}],total:99,caused:99}};
  const response=await get('/profiles/43/preview');assert.equal(response.status,200);
  const body=await response.text(),chart=body.match(/data-dashboard-chart-data-value="([^"]*)"/);
  assert.deepEqual(JSON.parse(chart[1].replaceAll('&quot;','"')),[['2026-10-24',2],['2026-10-25',3]]);
  assert.match(body,/Had 5 orgasms in the last 7 days/);assert.match(body,/Caused 7 orgasms/);
  assert.doesNotMatch(body,/OWNER-KEY|No Nut November|api_key_form/);
  assert.ok(state.calls.some(c=>c.group==='tracker'&&c.op==='statistics'&&c.input.actor_id===7&&c.input.username==='Alice'));
  state.anonymous=true;state.calls=[];
  assert.equal((await get('/profiles/43/preview')).headers.get('location'),'/login');
  assert.ok(!state.calls.some(c=>c.group==='tracker'));
});
test('kink CRUD and stars update frames without stale context; e621 test updates its status',async t=>{
  const {state,get}=await fixture(t);
  const star=await get('/kinks/21/star',post({}));assert.match(star.headers.get('content-type'),/turbo-stream/);const body=await star.text();assert.match(body,/name="star-outline"/);assert.doesNotMatch(body,/name="star"/);
  const added=await get('/kinks',post({'kink[name]':'new_kink'}));assert.match(await added.text(),/new_kink/);
  const removed=await get('/kinks/22',post({_method:'delete'}));assert.match(await removed.text(),/action="remove" target="kink_22"/);assert.ok(!state.memberships.some(h=>h.kink_id===22));
  assert.match(await (await get('/kinks/21/test/e621',post({}))).text(),/target="kink_21_e621_status"/);
});
test('profile sanitization retains layouts but strips scripts, handlers and unsafe URLs',()=>{
  const html=renderedProfile('<style>body {--accent:red}</style><div class="split"><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><a href="javascript:alert(1)">Click</a><iframe src="https://example.com"></iframe></div>',true);
  assert.match(html,/<style>body/);assert.match(html,/class="split"/);assert.doesNotMatch(html,/script|onerror|javascript/);assert.match(html,/iframe/);
  assert.equal(dumpMarkdown('x'.repeat(50001)).length,MARKDOWN_MARKER.length+50000);
});
test('custom CSS preserves scroll-behavior while executable behavior properties remain blocked',()=>{
  const css='html {scroll-behavior: smooth} :root {--accent: #800e5a} .details {border: 3px solid var(--accent)}';
  const source='<div class="details" style="scroll-behavior: smooth">Biography</div><style>'+css+'</style>';
  const rendered=renderedProfile(source,true);
  assert.ok(rendered.includes('<style>'+css+'</style>'));
  assert.match(rendered,/style="scroll-behavior: smooth"/);
  assert.equal(sanitizeProfileHTML(rendered),rendered);
  for(const property of ['behavior','BEHAVIOR','-moz-binding']){
    const dangerous=sanitizeProfileHTML('<style>body {'+property+': url(https://example.com/payload)}</style><p style="'+property+': url(https://example.com/payload)">Biography</p>');
    assert.doesNotMatch(dangerous,/<style|style=|payload/);
    assert.match(dangerous,/<p>Biography<\/p>/);
  }
});
test('custom profile CSS survives document, details, style preview and editor rendering',async t=>{
  const {state,get}=await fixture(t);
  const css='html {scroll-behavior: smooth} :root {--accent: #800e5a} .details {border: 3px solid var(--accent)}';
  const source='<div class="details" style="scroll-behavior: smooth">Custom biography</div><!-- EDITORSPLIT --><style>'+css+'</style>';
  state.users[0].advanced=true;
  state.profiles[0].content=source;
  for(const path of ['/users/Alice/profile-document','/users/7/details','/profiles/41/preview','/users/Alice/edit']){
    const response=await get(path,{headers:path.endsWith('profile-document')?{'sec-fetch-dest':'iframe'}:{}});
    assert.equal(response.status,200,path);
    const body=await response.text();
    assert.ok(body.includes('<style>'+css+'</style>'),path+' retains complete custom stylesheet');
    assert.match(body,/class="details" style="scroll-behavior: smooth"/);
  }
  assert.equal(state.profiles[0].content,source);
});
test('domain filtering covers HTML/CSS, subdomains, overrides, Markdown references and IDN normalization',()=>{
  const rules=[{domain:'blocked.invalid',status:2},{domain:'allowed.blocked.invalid',status:1}];
  const html=filterProfileDomains('<a href="https://sub.blocked.invalid">bad</a><style>body{background:url(https://blocked.invalid/a)} @import "https://blocked.invalid/style";</style><img src="https://allowed.blocked.invalid/ok">',rules);
  assert.deepEqual(html.blocked_domains,['blocked.invalid']);assert.doesNotMatch(html.content,/https:\/\/sub\.blocked/);assert.match(html.content,/https:\/\/allowed.blocked/);assert.match(html.content,/url\(""\)/);
  const md=filterProfileDomains(MARKDOWN_MARKER+'[bad][ref]\n\n[ref]: https://blocked.invalid\n\n![bad](https://blocked.invalid/a)',rules);assert.doesNotMatch(md.content,/https:\/\/blocked.invalid/);
  assert.equal(normalizeHostname('BÜCHER.DE.'),'xn--bcher-kva.de');assert.equal(normalizeHostname('invalid..host'),null);
});

test('native profile editors and style pages preserve original static paragraph wording',async()=>{
  const {readFile}=await import('node:fs/promises');const {profilePages}=await import('../src/templates/profiles.js');
  const u={id:7,username:'Alice',set_count:10,advanced:false,profile_id:41},p={id:41,user_id:7,name:'Style',content:'',public:true,updated_at:now};
  const v={user:u,targetUser:u,profile:p,users:new Map([['7',u]]),graph:{users:[u],profiles:[p],memberships:[],kinks:[],links:[]},profile_ids:[41],link_ids:[],past_link_ids:[],isCurrent:true,editing:false,details:'',renderedDetails:'<p>Biography</p>',statistics:{days:[],total:0,caused:0},orgasmForm:{pornlizard:null,friends:[],recent_setters:[]},csrf:'test',asset:n=>'/node-assets/'+n,stream:()=>'',globalStream:()=>'',flash:{}};
  const plain=s=>String(s).replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
  for(const [source,name,values] of [['app/views/users/show.html.erb','profile-user',v],['app/views/users/_details_edit_advanced.html.erb','profile-user',{...v,editing:true,targetUser:{...u,advanced:true},editorHTML:''}],['app/views/profiles/show.html.erb','profile-style',v],['app/views/profiles/index.html.erb','profile-styles',{...v,count:0,profiles:[],targetUser:null,page:1}]]){
    const output=plain(profilePages[name](values));
    for(const paragraph of copy.paragraphs[source]){if(paragraph.includes('This will delete'))continue;assert.ok(output.includes(plain(paragraph)),source+': '+plain(paragraph));}
  }
});
test('By Kinks filter buttons preserve GET parameters and profile kink forms work inside documents',async()=>{
  const {profilePages}=await import('../src/templates/profiles.js');
  const v={user:{id:7},targetUser:{id:7,username:'Alice'},users:new Map(),graph:{memberships:[],kinks:[]},isCurrent:true,csrf:'test',query:'some kink',mine:false,kinks:[],previews:{},page:1,count:0};
  const output=String(profilePages['profile-community'](v));assert.match(output,/method="get" action="\/link_lists"/);assert.match(output,/name="filter" value="mine"/);assert.match(output,/name="q" value="some kink"/);
  const tools=String(profilePages['profile-interests'](v));assert.match(tools,/id="kink_tools" data-turbo="true"/);assert.match(tools,/id="kink_form" class="kink_form" data-turbo="true"/);
});
