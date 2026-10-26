import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import copy from './fixtures/original-copy.json' with {type:'json'};
import {createApp} from '../src/app.js';
import {Router} from '../src/router.js';
import {addModerationRoutes} from '../src/moderation-routes.js';
import {addBlazerRoutes} from '../src/blazer-routes.js';
import {HttpError} from '../src/errors.js';
import {blazerVariables,bindBlazer,createBlazer} from '../../wallpaper-api/src/blazer.js';
const now=new Date().toISOString();
const post=fields=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({authenticity_token:'valid',...fields})});
async function fixture(t,{anonymous=false,admin=true,lizard=false}={}){
  const current={id:7,username:lizard?'PornLizardKi':'AdminAlice',admin,mascot:'ki'},target={id:8,username:'Bob',email:'private-bob@example.test',advanced:false,details:'',set_count:3,created_at:now};
  const state={calls:[],anonymous,admin,lizard,delegated:false,target,profile:{id:31,content:'<!-- walltaker:markdown -->\n# Bio'},query:{id:41,name:'Saved Query',statement:'SELECT 1 AS total',creator_id:7,data_source:'main'},dashboard:{id:51,name:'Dashboard'},check:{id:61,query_id:41,check_type:'bad_data',schedule:'1 day',emails:'',state:'new'}};
  const list=records=>({records,page:1,per:100,count:records.length});
  const reports=[{id:21,reporter_id:7,reportable_id:8,reportable_type:'User',reason:'Report <script>reason</script>',snapshot:'PRIVATE-SNAPSHOT <img src=x>',created_at:now,is_closed:false}];
  const backend=async(group,op,input)=>{
    state.calls.push({group,op,input});
    if(group==='browser'){
      if(op==='context')return {user:state.anonymous?null:current,surrender:state.delegated?{id:11}:null,csrf_token:'valid',graph:{users:[current]},flags:{}};
      if(op==='csrf')return {verified:input.tokens.includes('valid')};
      if(op==='authorize'){if(state.delegated&&['admin','lizard'].includes(input.mode))throw new HttpError(403,'Delegated sessions cannot use administration tools.');if(input.mode==='admin'&&!state.admin||input.mode==='lizard'&&!state.admin&&!state.lizard)throw new HttpError(403,'Administrator access required.');return {allowed:true};}
      if(op==='site-clients')return {clients:[{id:1,name:'Client',url:'https://example.test',platform:'Desktop'}]};
      if(op==='hydrate')return {graph:{links:[],users:[current,target],abilities:[],memberships:[],kinks:[]}};
      if(op==='assume')return {user:target,graph:{users:[target]},csrf_token:'rotated',clear_legacy:true,cookies:[{name:'walltaker_session',value:'assumed-session'}]};
    }
    if(group==='social')return op==='notifications'?{notifications:[]}:{count:0};if(group==='activity'&&op.startsWith('visit'))return {visit:{id:1}};
    if(group==='activity')return op==='system'?{captured_at:now,machine:{unavailable:true},database:{healthy:false},redis:{healthy:false},queue:{unavailable:true}}:{activity:{},hours:[]};
    if(group==='moderation'){
      if(state.unavailable)throw new HttpError(503,'Unavailable');
      if(op==='dashboard')return {open_reports:1,pending_domains:1,settings:{nnn_enabled:false}};
      if(op==='invites')return {invites:list([{id:1,code:'INVITE',created_at:now,generated_by_id:7}]),users:[current],settings:{invite_only:false}};
      if(op==='emoji-links')return {decorations:list([{id:1,link_id:12,emoji:'✨'}])};
      if(op==='user-icons')return {icons:list([{id:1,user_id:8,icon_name:'person'}]),users:[target]};
      if(op==='clients')return {clients:list([{id:1,name:'Client',section:'clients',url:'https://example.test',device_type:'desktop'}])};
      if(op==='domains')return {pending:list([{id:1,domain:'pending.invalid',first_seen_at:now,last_seen_at:now,seen_count:1}]),approved:list([]),blocked:list([]),users:[]};
      if(op==='user')return {user:input.query==='missing'?null:target,profile:state.profile};
      if(op==='deleted-users')return {users:list([{...target,deleted_at:now,deleted_username:'Bob'}])};
      if(op==='quarantine')return {users:[target],stats:{8:{sets:0,visits:1}},visits:[{id:1,user_id:8,ip:'192.0.2.8',user_agent:'Fake',started_at:now}],bans:[],moderators:[]};
      if(op==='events')return {events:[{id:1,user_id:8,visit_id:1,name:'nefarious:test',properties:'{"attempted_post_id":123}'}],users:[target],visits:[{id:1,ip:'192.0.2.8'}],bans:[],moderators:[],previews:[]};
      if(op==='reports'||op==='report')return {reports,users:[current,target],links:[]};
      if(op==='report-target')return {target:{id:input.reportable_id,username:'Bob'}};
      if(op==='lizard-index')return {};
      if(op==='lizard-browse')return {links:[],users:[],page:1,has_more:false};
      if(op==='domain-rules')return {rules:[{domain:'blocked.invalid',status:2}]};
      if(op==='user-update'){if(input.attributes.username==='invalid!')throw new HttpError(422,'Username must contain only letters and numbers.');Object.assign(target,input.attributes);if(input.attributes.details)state.profile.content=input.attributes.details;return {user_id:8};}
      if(op==='password-reset'){if(input.email==='short')throw new HttpError(422,'Email does not exist in database.');return {username:'Bob',token:'PRIVATE-RESET-TOKEN'};}
      if(op==='setting-toggle')return {enabled:true};if(op==='domain-update')return {domain:'pending.invalid',status:input.status};
      if(op==='report-create'&&input.reason==='invalid')throw new HttpError(422,'Report could not be created.');
      return {user_id:8,restored_original:true};
    }
    if(group==='blazer'){
      if(op==='home')return {queries:[{...state.query,creator:'AdminAlice',variables:[]}],dashboards:[state.dashboard]};
      if(op==='query')return {query:state.query,editable:true,variables:[],checks:[],dashboards:[]};
      if(op==='schema')return {columns:[{table_name:'links',column_name:'id',data_type:'bigint',is_nullable:'NO'}]};
      if(op==='run')return {columns:['value'],rows:[[input.variables?.value || 'hello,"world"']],column_types:[25],duration_ms:1};
      if(op==='query-save')return {id:41};
      if(op==='checks')return {checks:[{...state.check,query_name:'Saved Query'}]};
      if(op==='check')return {check:input.id?state.check:null,queries:[state.query]};
      if(op==='check-save'||op==='check-run')return {id:61,query_id:41};
      if(op==='dashboard')return {dashboard:input.id?state.dashboard:null,queries:[state.query],available:[state.query],variables:[]};
      if(op==='dashboard-save')return {id:51};
      return {};
    }
    throw Error('Unexpected '+group+'/'+op);
  };
  const router=new Router();addModerationRoutes(router);addBlazerRoutes(router);const server=http.createServer(createApp({baseUrl:'http://localhost',secretKeyBase:'moderation-tests',backendUrl:'http://localhost'},{router,backend,proxy:()=>{throw Error('Rails unavailable');},logger:{error(){}}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {state,get:(path,options={})=>fetch('http://localhost:'+server.address().port+path,{redirect:'manual',...options})};
}
test('all help, moderation, lizard and configured Blazer pages render natively without Rails',async t=>{
  const {get}=await fixture(t);
  for(const path of ['/help','/help/faq','/help/client_guide','/help/deprecated_client_guide','/users/8/reports/new','/links/12/reports/new','/mod_tools','/mod_tools/invites','/mod_tools/emoji_links','/mod_tools/user_icons','/mod_tools/clients','/mod_tools/profile_domains','/mod_tools/users?query=Bob','/mod_tools/users/deleted','/mod_tools/quarantine','/mod_tools/events','/mod_tools/passwords','/mod_tools/reports','/mod_tools/reports/21','/mod_tools/analytics/system','/mod_tools/analytics/activity','/lizard_tools','/lizard_tools/ki','/blazer','/blazer/queries/new','/blazer/queries/41-name','/blazer/queries/41/edit','/blazer/queries/docs','/blazer/queries/schema','/blazer/checks','/blazer/checks/new','/blazer/checks/61/edit','/blazer/dashboards/new','/blazer/dashboards/51','/blazer/dashboards/51/edit']){
    const response=await get(path);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-walltaker-renderer'),'node-native',path);assert.doesNotMatch(await response.text(),/undefined|<%/);
  }
});
test('public help stays public; reports require login; staff and Blazer pages reject ordinary and delegated users',async t=>{
  const {state,get}=await fixture(t,{anonymous:true,admin:false});
  assert.equal((await get('/help')).status,200);assert.equal((await get('/users/8/reports/new')).headers.get('location'),'/login');assert.equal((await get('/blazer')).headers.get('location'),'/login');
  state.anonymous=false;for(const path of ['/mod_tools','/mod_tools/users?query=Bob','/mod_tools/reports/21','/blazer','/blazer/queries/schema','/lizard_tools'])assert.equal((await get(path)).status,403,path);
  assert.ok(!state.calls.some(c=>c.group==='moderation'||c.group==='blazer'));
  state.admin=true;state.delegated=true;assert.equal((await get('/blazer')).status,403);assert.equal((await get('/mod_tools')).status,403);
});
test('named lizard staff can browse tools but cannot enter administration or SQL pages',async t=>{
  const {get}=await fixture(t,{admin:false,lizard:true});assert.equal((await get('/lizard_tools/ki')).status,200);assert.equal((await get('/mod_tools')).status,403);assert.equal((await get('/blazer')).status,403);
});
test('report snapshots/reasons are escaped and reports create/close through actor-scoped commands',async t=>{
  const {state,get}=await fixture(t);
  const response=await get('/users/8/reports',{...post({'report[reason]':'Report reason','report[reporter_id]':'99'}),headers:{...post({}).headers,'turbo-frame':'report_button'}});assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/users/8/reports/new');
  const call=state.calls.find(c=>c.op==='report-create').input;assert.equal(call.actor_id,7);assert.equal(call.reporter_id,undefined);assert.equal(call.reportable_type,'User');
  const body=await (await get('/mod_tools/reports/21')).text();assert.match(body,/Report &lt;script&gt;reason&lt;\/script&gt;/);assert.match(body,/PRIVATE-SNAPSHOT &lt;img/);assert.match(body,/name="email" value="private-bob@example.test"/);assert.doesNotMatch(body,/<img src=x/);
  assert.equal((await get('/mod_tools/reports/21',post({_method:'delete'}))).headers.get('location'),'/mod_tools/reports/21');
});
test('admin editing keeps the current identity, prepares Markdown/domain filtering and rejects privilege injection',async t=>{
  const {state,get}=await fixture(t);const body=await (await get('/mod_tools/users?query=Bob')).text();assert.match(body,/class="username" href="\/users\/AdminAlice"/);assert.match(body,/name="user\[id\]" value="8"/);
  const result=await get('/mod_tools/users/update',post({'user[id]':'8','user[username]':'NewBob','user[details]':'[Blocked](https://blocked.invalid) [OK](https://example.test)','user[admin]':'1','user[password_digest]':'private'}));assert.match(result.headers.get('content-type'),/turbo-stream/);assert.equal(result.status,200);
  const call=state.calls.find(c=>c.op==='user-update').input;assert.equal(call.attributes.admin,undefined);assert.equal(call.attributes.password_digest,undefined);assert.ok(call.attributes.details.startsWith('<!-- walltaker:markdown -->'));assert.doesNotMatch(call.attributes.details,/https:\/\/blocked.invalid/);assert.ok(state.calls.some(c=>c.op==='domain-seen'));
  const bad=await get('/mod_tools/users/update',post({'user[id]':'8','user[username]':'invalid!'}));assert.equal(bad.status,422);assert.match(await bad.text(),/Username must contain only letters/);
});
test('moderation writes preserve command fields, safe return URLs and reset tokens only in authenticated POST output',async t=>{
  const {state,get}=await fixture(t);
  await get('/mod_tools/clients',post({'wallpaper_client[name]':'Test','wallpaper_client[section]':'hidden','wallpaper_client[admin]':'1'}));assert.equal(state.calls.find(c=>c.op==='client-create').input.attributes.admin,undefined);
  const r=await get('/mod_tools/quarantine/update/8',post({return_to:'https://foreign.invalid/'}));assert.equal(r.headers.get('location'),'/mod_tools/quarantine#user_8');
  let body=await (await get('/mod_tools/passwords?link=FORGED-TOKEN')).text();assert.doesNotMatch(body.split('<main')[1],/FORGED-TOKEN|PRIVATE-RESET-TOKEN/);
  const reset=await get('/mod_tools/passwords/update',post({email:'private-bob','commit':'Try to generate a reset link (case sensitive)'}));assert.equal(reset.status,200);body=await reset.text();assert.match(body,/PRIVATE-RESET-TOKEN/);assert.equal(reset.headers.get('location'),null);assert.ok(state.calls.some(c=>c.op==='password-reset'&&c.input.case_sensitive));
  const assume=await get('/mod_tools/users/assume/8',post({}));assert.equal(assume.headers.get('location'),'/');assert.ok(assume.headers.getSetCookie().some(c=>c.startsWith('walltaker_session=assumed-session')));
});
test('all moderation and SQL mutations reject invalid CSRF before business services are touched',async t=>{
  const {state,get}=await fixture(t);
  for(const [path,extra] of [['/users/8/reports',{}],['/mod_tools/global_toggles/nnn',{}],['/mod_tools/invites',{}],['/mod_tools/users/8/purge',{_method:'delete'}],['/mod_tools/profile_domains/1',{_method:'patch'}],['/mod_tools/events/ban/1',{}],['/blazer/queries/run',{}],['/blazer/queries/cancel',{}],['/blazer/checks',{}],['/blazer/dashboards',{}]])assert.equal((await get(path,post({authenticity_token:'bad',...extra}))).status,422,path);
  assert.ok(!state.calls.some(c=>['moderation','blazer'].includes(c.group)));
});
test('Blazer routes save/fork queries, retain variables, export quoted CSV and edit checks/dashboards',async t=>{
  const {state,get}=await fixture(t);
  assert.equal((await get('/blazer/queries',post({'query[name]':'Saved','query[statement]':'SELECT 1'}))).headers.get('location'),'/blazer/queries/41');
  await get('/blazer/queries/41',post({_method:'patch',commit:'Fork','query[statement]':'SELECT 2'}));assert.ok(state.calls.some(c=>c.op==='query-save'&&c.input.fork));
  const result=await get('/blazer/queries/run.csv',post({'variables[value]':'hello,"world"',statement:'SELECT {value}'}));assert.equal(result.headers.get('content-type'),'text/csv; charset=utf-8');assert.equal(await result.text(),'value\r\n"hello,""world"""\r\n');
  assert.equal((await get('/blazer/checks',post({'check[query_id]':'41','check[check_type]':'bad_data','check[schedule]':'1 day'}))).headers.get('location'),'/blazer/queries/41');
  assert.equal((await get('/blazer/dashboards',post({'dashboard[name]':'Board','query_ids[]':'41'}))).headers.get('location'),'/blazer/dashboards/51');
});
test('SQL variables bind as parameters, including quoted templates; comments, identifiers and quantifiers are left alone',()=>{
  const input="SELECT {id}::integer, '%{name}%'::text, '{day}'::date -- {ignored}\n/* {ignored2} */";
  assert.deepEqual(blazerVariables(input),['id','name','day']);const bound=bindBlazer(input,{id:'7',name:"a' OR true --",day:'2026-10-25'});assert.deepEqual(bound.values,['7',"%a' OR true --%",'2026-10-25']);assert.doesNotMatch(bound.statement,/OR true/);assert.match(bound.statement,/\$1::integer/);
  assert.deepEqual(blazerVariables('SELECT "{literal}", $$ {literal2} $$, x ~ \'a{1,2}\''),[]);assert.throws(()=>bindBlazer('SELECT {missing}',{}),{status:422});assert.throws(()=>bindBlazer('SELECT {id}',{id:['7']}),{status:422});
});
test('SQL service checks authority before metadata/queries and always rolls back bounded extended-mode executions',async()=>{
  const calls=[],client={processID:123,async query(sql){calls.push(sql);if(typeof sql==='object')return {fields:[{name:'x',dataTypeID:23}],rows:[[1]]};return {rows:[]};},release(){calls.push('release');}},pool={async query(sql){calls.push(sql);return {rows:[]};}},queryPool={async connect(){return client;}};
  const denied=createBlazer({pool,queryPool,authorize:async()=>{throw new HttpError(403,'No');}});await assert.rejects(denied.request('run',{statement:'SELECT 1'}),{status:403});assert.equal(calls.length,0);
  const service=createBlazer({pool,queryPool,authorize:async()=>{}});const result=await service.request('run',{actor_id:7,statement:'SELECT {id}::integer AS x',variables:{id:'1'}});assert.deepEqual(result.rows,[[1]]);assert.ok(calls.includes('BEGIN READ ONLY'));assert.ok(calls.includes('ROLLBACK'));const sql=calls.find(c=>typeof c==='object');assert.equal(sql.queryMode,'extended');assert.deepEqual(sql.values,['1']);assert.match(sql.text,/LIMIT 1001/);
  await assert.rejects(service.request('run',{actor_id:7,statement:'DELETE FROM users'}),{status:422});
  client.query=async sql=>{calls.push(sql);if(typeof sql==='object')throw Object.assign(Error('Canceled'),{code:'57014'});return {rows:[]};};const failure=await service.request('run',{actor_id:7,statement:'SELECT 1'});assert.match(failure.error,/canceled or timed out/);assert.equal(calls.at(-2),'release');
});
test('native help preserves original static paragraphs, hosts its images natively, and generates origin-specific guide examples',async t=>{
  const {get}=await fixture(t,{anonymous:true});
  for(const name of ['index','faq','client_guide','deprecated_client_guide']){
    const response=await get('/help'+(name==='index'?'':'/'+name));const output=await response.text(),plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
    for(const paragraph of copy.help[name])assert.ok(plain(output).includes(paragraph),name+': '+paragraph);
    if(name==='index')assert.match(output,/\/node-assets\/images\/help\//);
    if(name==='client_guide'){assert.match(output,/ws:\/\/localhost\/cable/);assert.match(output,/data-example="reaction-response"/);assert.match(output,/class="client-guide"/);}
  }
});
