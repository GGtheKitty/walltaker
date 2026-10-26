import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp, clientIp, createServer} from '../src/app.js';
import {createBackend} from '../src/backend.js';
import {Cookies, Flash, createFlashCodec} from '../src/cookies.js';
import {parseFields, formMethod} from '../src/forms.js';
import {Router, requestPath, redirectLocation} from '../src/router.js';
import {HttpError} from '../src/errors.js';
import {mergeGraphs} from '../src/pages.js';
import {nativeAssets,assetUrl} from '../src/native-assets.js';
import {html,safeUrl,button} from '../src/templates/html.js';

const config = {secretKeyBase:'web-test-secret', baseUrl:'http://localhost', backendUrl:'http://localhost', legacyUrl:'http://localhost', trustProxyHops:0};
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return 'http://localhost:' + server.address().port;
}
const auth = () => ({user:null, csrf_token:'masked-token', flags:{}, cookies:[], graph:{}});
function fakeBackend(overrides = {}) {
  const calls = [];
  const backend = async (group, op, input, options) => {
    calls.push({group,op,input,options});
    if (overrides[group + '/' + op]) return overrides[group + '/' + op](input, options);
    if (group === 'browser' && op === 'context') return auth();
    if (group === 'browser' && op === 'csrf') return {verified:input.tokens.includes('valid')};
    if (group === 'browser' && op === 'login') return input.password === 'correct' ? {...auth(), user:{id:7,username:'Alice'}, graph:{users:[{id:7,username:'Alice'}]}, clear_legacy:true, cookies:[{name:'walltaker_session',value:'new-session'},{name:'walltaker_csrf',value:'new-csrf'}]} : {user:null};
    if (group === 'browser' && op === 'logout') return {...auth(), clear_session:true, clear_legacy:true, cookies:[{name:'walltaker_csrf',value:'rotated-csrf'}]};
    if (group === 'browser' && op === 'hydrate') return {graph:{users:[{id:7,username:'Alice'},{id:9,username:'Newest'}]}};
    if (group === 'discovery') return {clients:[],recent_posts:[],viewers:[],days:[],today:[],total:9,your_total:2,online:0,newest_user:{id:9,username:'Newest'}};
    if (group === 'activity' && op === 'visit') return {visit:{id:1}};
    if (group === 'activity' && op === 'visit-create') return {visit:{id:1}};
    if (group === 'activity') return {};
    if (group === 'social') return op === 'notifications' ? {notifications:[]} : op === 'leaderboard' ? {users:[]} : {count:0};
    if (group === 'tracker') return {nnn_enabled:false,current:null};
    if (group === 'browser' && op === 'authorize') return {allowed:true};
    if (group === 'accounts') return {};
    throw Error('Unexpected operation ' + group + '/' + op);
  };
  return {backend, calls};
}
async function web(t, overrides = {}, extra = {}) {
  const fake = fakeBackend(overrides);
  const app = createApp({...config,...extra}, {...fake, proxy:async (req,res) => { let body=''; for await (const chunk of req) body += chunk; res.writeHead(200, {'x-walltaker-web':'node-proxy'}); res.end(body || 'Legacy'); }, logger:{error(){}}});
  const url = await listen(t, http.createServer(app));
  return {...fake, url, get:(path, options = {}) => fetch(url + path, {redirect:'manual', ...options})};
}
const post = fields => ({method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(fields)});
const cookieHeader = cookies => cookies.map(value => value.split(';')[0]).join('; ');

test('footer links retain spacing and identify the exact configured commit',async t=>{
  const hash='abcdef0123456789abcdef0123456789abcdef01';
  const {get}=await web(t,{'browser/context':()=>({...auth(),user:{id:7,username:'Admin',admin:true}})},{publicEnv:{COMMIT_HASH:hash}});
  const response=await get('/');assert.equal(response.status,200);
  const footer=(await response.text()).match(/<footer>([\s\S]*?)<\/footer>/)[1];
  assert.ok(footer.includes('href="https://github.com/GGtheKitty/walltaker/commit/'+hash+'">#abcdef012'));
  assert.match(footer,/Stats<\/a>\s+<a href="\/mod_tools">/);
  assert.match(footer,/Mod Tools<\/a>\s+<a href="\/lizard_tools">/);
});
test('footer handles missing metadata and respects explicit deployment links',async t=>{
  const missing=await web(t),page=await missing.get('/login');
  const body=await page.text();assert.match(body,/Commit unavailable/);assert.doesNotMatch(body,/>#\s*<\/a>/);
  const configured=await web(t,{}, {publicEnv:{COMMIT_HASH:'123456789abcdef',COMMIT_LINK:'https://example.com/releases/123456789'}});
  assert.match(await (await configured.get('/login')).text(),/href="https:\/\/example.com\/releases\/123456789">#123456789/);
});

test('nested forms support checkboxes, arrays and grouped records without prototype pollution', () => {
  const form = parseFields([['user[name]','Alice'],['user[active]','0'],['user[active]','1'],['tags[]','a'],['tags[]','b'],['rows[][name]','one'],['rows[][value]','1'],['rows[][name]','two']]);
  assert.equal(form.user.active, '1'); assert.deepEqual(form.tags, ['a','b']); assert.equal(form.rows[0].value, '1'); assert.equal(form.rows[1].name, 'two');
  for (const entries of [[['__proto__[x]','1']],[['x[constructor]','1']],[['x','1'],['x[y]','2']],[['x[]','1'],['x','2']],[['x[y]','1'],['x[]','2']],[['x[','1']]]) assert.throws(() => parseFields(entries), HttpError);
  assert.equal({}.x, undefined);
});
test('forms and method overrides have bounded shape', () => {
  assert.throws(() => parseFields(Array.from({length:1001},(_,i) => ['f'+i,'x'])), {status:413});
  assert.throws(() => parseFields([['a[b][c][d][e][f][g][h][i]','x']]), {status:400});
  assert.equal(formMethod('POST', {_method:'patch'}), 'PATCH'); assert.equal(formMethod('GET', {_method:'delete'}), 'GET');
  assert.throws(() => formMethod('POST', {_method:'GET'}), {status:400});
});
test('routing resolves params, HEAD, method errors, and protects private paths', () => {
  const router = new Router().add('GET', '/users/:id', () => {});
  assert.equal(router.match('HEAD','/users/Alice').params.id, 'Alice');
  assert.throws(() => router.match('POST','/users/Alice'), {status:405, headers:{allow:'GET, HEAD'}});
  assert.equal(router.match('GET','/missing'), null);
  for (const path of ['/_internal/browser/login','/%5finternal/test','/x/../_internal/test','/x/%252e%252e/%255finternal/test','/_anycable','/%2f_internal/test']) assert.throws(() => requestPath(path), {status:404}, path);
  for (const path of ['//evil.invalid/x','/bad%xx','/x%5cy','/x%00']) assert.throws(() => requestPath(path), {status:400});
});
test('redirects stay on the configured public origin', () => {
  assert.equal(redirectLocation('http://localhost/next?q=a#b',config.baseUrl), '/next?q=a#b');
  for (const value of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/x%0d%0aLocation:evil','javascript:alert(1)','http://user@localhost/']) assert.throws(() => redirectLocation(value,config.baseUrl), {status:400});
});
test('only configured proxy hops determine the client address', () => {
  const req = {headers:{'x-forwarded-for':'198.51.100.66, 203.0.113.8, 172.18.0.1'}, socket:{remoteAddress:'::ffff:172.18.0.5'}};
  assert.equal(clientIp(req,0), '172.18.0.5'); assert.equal(clientIp(req,2), '203.0.113.8');
  assert.throws(() => clientIp({headers:{'x-forwarded-for':'spoof'},socket:req.socket},1), {status:400});
  assert.throws(() => createApp({...config,trustProxyHops:NaN}), /Invalid web configuration/);
});
test('flash uses authenticated Rails-compatible cookies, preserves session fields and resists tampering', () => {
  const codec = createFlashCodec(config.secretKeyBase);
  const encoded = codec.write({session_id:'test-session',_csrf_token:'old-token',flash:{discard:[],flashes:{notice:'Saved <script>'}}});
  const cookies = new Cookies('_walltaker_session='+encodeURIComponent(encoded), true), flash = new Flash(cookies,codec);
  assert.equal(flash.values.notice, 'Saved <script>'); flash.consume(); flash.commit();
  const next = codec.read(cookies.values._walltaker_session); assert.equal(next._csrf_token,'old-token'); assert.equal(next.flash,undefined);
  assert.match(cookies.headers()[0], /HttpOnly; Secure/);
  assert.equal(codec.read(encoded.slice(0,-3)+'xxx'), undefined);
  flash.reset();flash.set('notice','Logged in!');flash.commit();
  assert.equal(codec.read(cookies.values._walltaker_session)._csrf_token, undefined);
  assert.equal(new Flash(cookies,codec).values.notice,'Logged in!');
  const nextFlash = new Flash(cookies,codec);nextFlash.set('alert','Check this');nextFlash.set('notice','Updated');
  assert.equal(nextFlash.values.notice,'Updated');nextFlash.consume();nextFlash.commit();
  assert.deepEqual(new Flash(cookies,codec).values,{notice:'Updated',alert:'Check this'});
});
test('health and native error pages do not depend on authentication or rendering', async t => {
  const w = await web(t, {'browser/context':() => { throw Error('secret-password'); }});
  assert.equal((await w.get('/up')).status,200);
  const r = await w.get('/500'); assert.equal(r.status,500); assert.match(await r.text(),/500/); assert.equal(w.calls.length,0);
  assert.equal((await w.get('/404',{method:'HEAD'})).status,404);
});
test('homepage renders through Node services and HEAD has no response body or analytics', async t => {
  const w = await web(t); const r = await w.get('/');
  assert.equal(r.status,200); assert.equal(r.headers.get('x-walltaker-web'),'node'); assert.equal(r.headers.get('x-walltaker-rails-reads'),'0');
  const body = await r.text();assert.match(body,/<h2>What is it/);assert.match(body,/<header>/);assert.match(body,/node-assets/);assert.equal(r.headers.get('x-walltaker-renderer'),'node-native');assert(!w.calls.some(c => c.group === 'rendering'));
  const previous = w.calls.filter(c => c.group === 'activity').length;
  const head = await w.get('/',{method:'HEAD'}); assert.equal(await head.text(),'');
  assert.equal(w.calls.filter(c => c.group === 'activity').length, previous);
});
test('authenticated dashboard uses native templates and contains no lazy Rails frame requests', async t => {
  const w = await web(t, {'browser/context':() => ({...auth(),user:{id:7,username:'Alice'},graph:{users:[{id:7,username:'Alice'}]},flags:{$html:'<script>untrusted</script>'}})});
  const r = await w.get('/');assert.equal(r.status,200);const body = await r.text();
  assert.match(body,/Walltaker Dashboard/);assert.match(body,/>Alice</);assert.match(body,/>Newest</);
  assert.doesNotMatch(body,/<script>untrusted<\/script>|<turbo-frame[^>]* src=/);
  assert(!w.calls.some(c => c.group === 'rendering' || c.op === 'hydrate'));
});
test('login page consumes flash exactly once; HEAD and prefetch preserve it', async t => {
  const codec = createFlashCodec(config.secretKeyBase), w = await web(t);
  const cookie = '_walltaker_session='+encodeURIComponent(codec.write({session_id:'old',flash:{discard:[],flashes:{notice:'From Rails'}}}));
  const head = await w.get('/login',{method:'HEAD',headers:{cookie}}); assert.equal(head.headers.getSetCookie().length,0);
  const prefetch = await w.get('/login',{headers:{cookie,purpose:'prefetch'}}); assert.equal(prefetch.headers.getSetCookie().length,0);
  const result = await w.get('/login',{headers:{cookie}}); assert.match(await result.text(),/From Rails/);
  const consumed = cookieHeader(result.headers.getSetCookie());
  const next = await w.get('/login',{headers:{cookie:consumed}});assert.doesNotMatch(await next.text(),/From Rails/);
});
test('invalid CSRF never reaches login; origin, path and method reach the shared verifier', async t => {
  const w = await web(t);
  const options = post({email:'Alice',password:'do-not-echo',authenticity_token:'invalid'});
  options.headers.origin = 'https://evil.invalid';options.headers.cookie = 'walltaker_csrf=original';
  const r = await w.get('/session', options); assert.equal(r.status,422); assert.doesNotMatch(await r.text(),/do-not-echo/);
  assert.deepEqual(w.calls.map(c => c.op),['csrf']); assert.equal(w.calls[0].input.origin,'https://evil.invalid'); assert.equal(w.calls[0].input.path,'/session'); assert.equal(w.calls[0].options.cookie,'walltaker_csrf=original');
});
test('valid login rotates cookies, redirects with 303 and emits Rails-readable flash', async t => {
  const w = await web(t); const r = await w.get('/session',post({email:'Alice',password:'correct',authenticity_token:'valid',keep_me_logged_in:'1'}));
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/');
  const cookies = r.headers.getSetCookie(); assert(cookies.some(c => c.startsWith('walltaker_session=new-session;')));
  const jar = new Cookies(cookieHeader(cookies),false); assert.equal(new Flash(jar,createFlashCodec(config.secretKeyBase)).values.notice,'Logged in!');
  assert.equal(w.calls.find(c => c.op === 'login').input.remember,true);
  assert.equal(w.calls.find(c => c.op === 'visit-authenticate').input.user_id,7);
});
test('failed login renders 422, preserves identifier and excludes submitted credentials', async t => {
  const w = await web(t); const r = await w.get('/session',post({email:'Alice',password:'wrong-secret',authenticity_token:'valid'}));
  assert.equal(r.status,422);const body = await r.text();assert.match(body,/value="Alice"/);assert.match(body,/Wrong email, username, or password/);
  assert.doesNotMatch(body,/wrong-secret/);assert(!w.calls.some(c => c.group === 'rendering'));
});
test('logout revokes through Node; speculative and foreign GETs do not revoke sessions', async t => {
  const w = await web(t);
  for (const options of [{method:'HEAD'},{headers:{purpose:'prefetch'}},{headers:{'sec-purpose':'prefetch;prerender'}}]) assert.equal((await w.get('/logout',options)).status,302);
  assert.equal(w.calls.filter(c => c.op === 'logout').length,0);
  assert.equal((await w.get('/logout',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal((await w.get('/logout',{headers:{referer:'https://evil.invalid/'}})).status,403);
  assert.equal(w.calls.filter(c => c.op === 'logout').length,0);
  const r = await w.get('/logout'); assert.equal(r.status,302); assert(r.headers.getSetCookie().some(c => c.startsWith('walltaker_session=;')));
  assert.equal(w.calls.filter(c => c.op === 'logout').length,1);
});
test('logout forms support method override and shared CSRF verification', async t => {
  const w = await web(t);
  const r = await w.get('/session/9',post({_method:'delete',authenticity_token:'valid'}));
  assert.equal(r.status,303); assert.equal(w.calls.find(c => c.op === 'csrf').input.method,'DELETE');
});
test('owned routes reject invalid, oversized, polluted and unsupported request bodies', async t => {
  const w = await web(t);
  for (const [body,type,status] of [['{','application/json',400],['[]','application/json',400],['{"__proto__":{"x":1}}','application/json',400],['abc','text/plain',415],['x'.repeat(1048577),'application/json',413]]) {
    const r = await w.get('/session',{method:'POST',headers:{'content-type':type},body}); assert.equal(r.status,status);
  }
  assert.equal(w.calls.length,0);
});
test('multipart and JSON submissions use the same login and CSRF services', async t => {
  const w = await web(t); const form = new FormData(); form.set('email','Alice'); form.set('password','correct');form.set('authenticity_token','valid');
  assert.equal((await w.get('/session',{method:'POST',body:form})).status,303);
  assert.equal((await w.get('/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'Alice',password:'correct',authenticity_token:'valid'})})).status,303);
});
test('backend failures produce safe HTML or JSON errors and rate-limit headers', async t => {
  const w = await web(t, {'browser/context':() => { throw Error('database-password'); }});
  const r = await w.get('/login'); assert.equal(r.status,500); assert.doesNotMatch(await r.text(),/database-password|Error:/);
  const rate = await web(t, {'browser/context':() => { throw new HttpError(429,'Please wait.',{'retry-after':'20'}); }});
  const limited = await rate.get('/login',{headers:{accept:'application/json'}}); assert.equal(limited.headers.get('retry-after'),'20');assert.equal((await limited.json()).message,'Please wait.');
});
test('unknown routes return local 404 errors and bypass session handling', async t => {
  const w = await web(t);
  const r = await w.get('/legacy-fallback-check',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'link%5Bterms%5D=one+two&_method=patch'});
  assert.equal(r.status,404); assert.equal(w.calls.length,0);
  assert.equal((await w.get('/_internal/browser/context')).status,404);
});
test('backend RPC authenticates each namespace and only forwards browser cookies', async t => {
  const seen = [];
  const url = await listen(t,http.createServer(async (req,res) => { let body='';for await(const chunk of req)body+=chunk;seen.push({url:req.url,headers:req.headers,body:JSON.parse(body)});res.writeHead(200,{'content-type':'application/json'});res.end('{}'); }));
  const backend = createBackend({secretKeyBase:config.secretKeyBase,baseUrl:url});
  for (const [group,op] of [['browser','context'],['discovery','dashboard'],['social','notifications'],['tracker','pledge-status'],['activity','visit']]) await backend(group,op,{test:true},{cookie:'walltaker_session=private',requestId:'test-id'});
  assert.equal(seen[0].headers.authorization,'Bearer '+createHmac('sha256',config.secretKeyBase).update('walltaker:browser:commands:v1').digest('hex'));
  assert.equal(seen[0].headers.cookie,'walltaker_session=private');assert.equal(seen[1].headers.cookie,undefined);
  assert.notEqual(seen[0].headers.authorization,seen[1].headers.authorization);
  for(const op of ['bots','bot-update','bot-start','bot-stop']){
    await backend('moderation',op,{actor_id:7,bot:'ki',revision:'1'},{cookie:'walltaker_session=private'});
    const request=seen.at(-1);
    assert.equal(request.url,'/_internal/moderation/'+op);
    assert.equal(request.headers.authorization,'Bearer '+createHmac('sha256',config.secretKeyBase).update('walltaker:moderation:commands:v1').digest('hex'));
    assert.equal(request.headers.cookie,undefined);assert.equal(request.body.actor_id,7);
  }
  await assert.rejects(backend('browser','../../evil'),/Unsupported/);
});
test('RPC timeout, malformed JSON, private 500 details and redirects are contained', async t => {
  for (const mode of ['timeout','json','error','redirect']) {
    const url = await listen(t,http.createServer((req,res) => { req.resume();if(mode==='timeout')return;if(mode==='redirect'){res.writeHead(302,{location:'http://evil.invalid'});return res.end();}res.writeHead(mode==='error'?500:200);res.end(mode==='json'?'oops':'{"message":"private database password"}'); }));
    const backend = createBackend({secretKeyBase:config.secretKeyBase,baseUrl:url,timeout:50});
    await assert.rejects(backend('browser','context'), error => error.status===503 && !error.message.includes('password'));
  }
});
test('unknown URLs never contact a configured legacy upstream',async t=>{
  let calls=0;const legacy=await listen(t,http.createServer((_req,res)=>{calls++;res.end('old upstream');}));
  const url=await listen(t,createServer({...config,legacyUrl:legacy},{logger:{error(){}}}));
  for(const path of ['/move','/missing','/api/fail','/stream'])assert.equal((await fetch(url+path)).status,404);
  assert.equal(calls,0);
});
test('template interpolation escapes data and graph overlays preserve associations', () => {
  const attack = '<script>alert(1)</script>';
  assert.equal(String(html`<div>${attack}</div>`),'<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>');
  assert.equal(String(html`<div>${{$html:attack}}</div>`),'<div>[object Object]</div>');
  assert.equal(safeUrl('javascript:alert(1)'),'#');assert.equal(safeUrl('//evil.invalid'),'#');
  assert.doesNotMatch(String(button('Next','/next','csrf')), /data-turbo-confirm=/);
  assert.match(String(button('Delete','/next','csrf',{confirm:'Are you sure?'})), /data-turbo-confirm="Are you sure\?"/);
  const graph = mergeGraphs({users:[{id:1,username:'Alice',profile_id:9}]},{users:[{id:1,viewing_link_id:3}]});
  assert.equal(graph.users.length,1);assert.equal(graph.users[0].profile_id,9);
});
test('native asset manifest is independent of Sprockets and rejects traversal', async t => {
  const directory = await mkdtemp(join(tmpdir(),'walltaker-web-assets-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  await assert.rejects(nativeAssets({assetsDirectory:directory}),{status:503});
  const assets = {'application.js':'application.0123456789abcdefabcd.js','application.css':'application.0123456789abcdefabcd.css'};
  await writeFile(join(directory,'manifest.json'),JSON.stringify({version:1,assets}));
  assert.equal(assetUrl((await nativeAssets({assetsDirectory:directory})).assets,'application.js'),'/node-assets/'+assets['application.js']);
  const other = await mkdtemp(join(tmpdir(),'walltaker-web-bad-assets-'));t.after(() => rm(other,{recursive:true,force:true}));
  await writeFile(join(other,'manifest.json'),JSON.stringify({version:1,assets:{...assets,'application.js':'../../outside.0123456789abcdefabcd.js'}}));
  await assert.rejects(nativeAssets({assetsDirectory:other}),{status:503});
});
test('native assets support GET, HEAD and caching without authentication or Rails',async t => {
  const w = await web(t);const {assets} = await nativeAssets();const path = assetUrl(assets,'application.js');
  const response = await w.get(path);assert.equal(response.status,200);assert.equal(response.headers.get('x-walltaker-assets'),'node');
  assert.match(response.headers.get('content-type'),/javascript/);assert.match(response.headers.get('cache-control'),/immutable/);assert((await response.text()).length>1000);
  const cached = await w.get(path,{headers:{'if-none-match':response.headers.get('etag')}});assert.equal(cached.status,304);
  const head = await w.get(path,{method:'HEAD'});assert.equal(await head.text(),'');
  assert.equal((await w.get('/node-assets/nope.js')).status,404);assert.equal((await w.get(path,{method:'POST'})).status,405);assert.equal(w.calls.length,0);
});
test('original public files are native aliases without session access',async t=>{
  const w=await web(t);
  for(const path of ['/robots.txt','/favicon.ico','/base.css']){
    const response=await w.get(path);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-walltaker-assets'),'node');assert.equal(response.headers.get('cache-control'),'public, max-age=3600');
    assert.equal((await w.get(path,{method:'HEAD'})).status,200);
    assert.equal((await w.get(path,{headers:{'if-none-match':response.headers.get('etag')}})).status,304);
  }
  assert.equal((await w.get('/assets/removed-rails.css')).status,404);assert.equal(w.calls.length,0);
});
test('native mascot forms use CSRF, verified actor and Node account commands',async t => {
  const current = {...auth(),user:{id:7,username:'Alice',mascot:'warren'},graph:{users:[{id:7,username:'Alice'}]}};
  const w = await web(t,{'browser/context':() => current});
  assert.equal((await w.get('/api/mascot/next',post({authenticity_token:'invalid'}))).status,422);
  const result = await w.get('/api/mascot/next',post({authenticity_token:'valid',actor_id:'99'}));assert.equal(result.status,200);
  assert.match(result.headers.get('content-type'),/turbo-stream/);assert.match(await result.text(),/target="mascot_picker"/);
  const command = w.calls.find(c => c.group === 'accounts');assert.equal(command.input.actor_id,7);assert.equal(command.op,'mascot');
});
test('the native site works with no fallback service',async t => {
  let loggedIn = false;
  const user = {id:7,username:'Alice',mascot:'ki'};
  const fake = fakeBackend({
    'browser/context':() => ({...auth(),csrf_token:'valid',user:loggedIn ? user : null,graph:{users:loggedIn ? [user] : []}}),
    'browser/login':() => { loggedIn=true;return {...auth(),user,clear_legacy:true,cookies:[{name:'walltaker_session',value:'native-only'}]}; },
    'browser/logout':() => { loggedIn=false;return {...auth(),clear_session:true,clear_legacy:true}; },
  });
  const url = await listen(t,createServer({...config,legacyUrl:'http://127.0.0.1:9'},{...fake,logger:{error(){}}}));
  let response = await fetch(url+'/login');const login = await response.text();assert.match(login,/name="authenticity_token" value="valid"/);
  response = await fetch(url+'/session',{...post({email:'Alice',password:'secret',authenticity_token:'valid'}),redirect:'manual'});assert.equal(response.status,303);
  const cookie = cookieHeader(response.headers.getSetCookie());
  response = await fetch(url+'/',{headers:{cookie}});assert.equal(response.headers.get('x-walltaker-renderer'),'node-native');
  const home = await response.text();assert.match(home,/Walltaker Dashboard/);assert.match(home,/Logged in!/);
  for (const path of [...home.matchAll(/(?:src|href)="(\/node-assets\/[^" ]+)"/g)].map(match => match[1])) assert.equal((await fetch(url+path)).status,200);
  response = await fetch(url+'/logout',{headers:{cookie},redirect:'manual'});assert.equal(response.status,302);
  assert.equal(loggedIn,false);assert(!fake.calls.some(call => call.group==='rendering'));
  assert.equal((await fetch(url+'/unknown-page')).status,404);
});
test('shared-account login is native, guarded against speculative navigation and respects backend policy',async t => {
  const w = await web(t,{'browser/evil':() => ({...auth(),user:{id:8,username:'evil'},cookies:[{name:'walltaker_session',value:'shared'}],clear_legacy:true})});
  assert.equal((await w.get('/login/evilly',{method:'HEAD'})).status,302);
  assert.equal((await w.get('/login/evilly',{headers:{purpose:'prefetch'}})).status,302);
  assert.equal((await w.get('/login/evilly',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal(w.calls.filter(call => call.op==='evil').length,0);
  const response = await w.get('/login/evilly');assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/');
  assert.equal(w.calls.filter(call => call.op==='evil').length,1);
  const blocked = await web(t,{'browser/evil':() => { throw new HttpError(403,'Invite-only mode.'); }});
  const result = await blocked.get('/login/evilly');assert.equal(result.headers.get('location'),'/login');
  const next = await blocked.get('/login',{headers:{cookie:cookieHeader(result.headers.getSetCookie())}});assert.match(await next.text(),/Invite-only mode/);
});
