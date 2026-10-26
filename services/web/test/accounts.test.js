import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../src/app.js';
import {HttpError} from '../src/errors.js';
import {createFlashCodec} from '../src/cookies.js';

const secret='account-browser-tests';
const post=fields=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({authenticity_token:'valid',...fields})});
const flash=response=>{
  const value=response.headers.getSetCookie().find(s=>s.startsWith('_walltaker_session='));
  return value?createFlashCodec(secret).read(decodeURIComponent(value.split(';')[0].slice('_walltaker_session='.length))).flash.flashes:{};
};
async function fixture(t,{anonymous=false,inviteOnly=false,delegated=false}={}){
  const state={calls:[],anonymous,inviteOnly,delegated,users:[{id:7,username:'Alice',colour_preference:0,username_changed_at:null},{id:8,username:'Chris',colour_preference:2,username_changed_at:null}],password:'current-secret',token:'valid-reset-token'};
  const auth=()=>({user:state.anonymous?null:{...state.users[0]},surrender:state.delegated?{id:12,controller_user_id:8}:null,flags:{invite_only:state.inviteOnly},csrf_token:'valid',graph:{users:structuredClone(state.users)},cookies:[]});
  const backend=async(group,op,input)=>{
    state.calls.push({group,op,input});
    if(group==='browser'){
      if(op==='context')return auth();
      if(op==='csrf')return {verified:input.tokens.includes('valid')&&input.origin!=='https://foreign.invalid'};
      if(op==='authorize')return state.surrendered?{allowed:false,redirect:'/surrenders/12'}:{allowed:true};
      if(op==='settings')return {user_id:state.delegated?8:7,graph:{users:structuredClone(state.users)}};
      if(op==='user'){const user=state.users.find(u=>u.username===input.username);if(!user)throw new HttpError(404,'User not found.');return {user_id:user.id,graph:{users:[user]}};}
      if(op==='signup'){
        if(state.signupUnavailable)throw new HttpError(503,'Please retry.');
        if(state.banned)throw new HttpError(403,'Not authorized.');
        if(!input.username || input.password!==input.password_confirmation || state.inviteOnly&&input.invite_code!=='INVITE'){
          const error=new HttpError(422,'Invalid signup.');error.errors=state.inviteOnly?{base:['Invite code is invalid or has already been used.']}:{password_confirmation:["doesn't match Password."]};throw error;
        }
        state.users[0]={id:9,username:input.username,colour_preference:0};state.anonymous=false;
        return {...auth(),clear_legacy:true,cookies:[{name:'walltaker_session',value:'rotated-session'},{name:'walltaker_csrf',value:'rotated-csrf'}]};
      }
      if(op==='reset-request'){if(state.limited)throw new HttpError(429,'Please wait.',{'retry-after':'20'});return {status:input.email==='known@example.test'?'queued':'ignored'};}
      if(op==='logout'){state.anonymous=true;return {...auth(),surrender:null,clear_session:true,clear_legacy:true,cookies:[{name:'walltaker_csrf',value:'anonymous-csrf'}]};}
    }
    if(group==='accounts'){
      if(op==='reset-complete'){
        if(!state.token || input.token!==state.token || state.expired || input.password!==input.password_confirmation)throw new HttpError(422,'Invalid or expired password reset link.');
        state.token=null;return {user_id:7};
      }
      const user=state.users.find(u=>u.id===(input.target_id || input.actor_id));
      if(state.accountUnavailable)throw new HttpError(503,'Accounts unavailable.');
      if(user.system_account || user.username==='evil')throw new HttpError(422,'System accounts cannot be deleted.');
      if(op==='username'){if(user.username_changed_at)throw new HttpError(422,'Username can only be changed once a week.');user.username=input.username.trim();user.username_changed_at=new Date().toISOString();}
      if(op==='colour')user.colour_preference=['auto','light','dark'].indexOf(input.colour_preference);
      if(['password','account-delete'].includes(op)){
        if(input.current_password!==state.password)throw new HttpError(422,'Current password is incorrect.');
        if(op==='password'){if(input.password!==input.password_confirmation)throw new HttpError(422,"Password confirmation doesn't match Password.");state.password=input.password;}
        else state.deleted=true;
      }
      return {user_id:user.id};
    }
    if(group==='social')return op==='notifications'?{notifications:[]}:{count:0};
    if(group==='activity')return {visit:{id:1}};
    throw new Error('Unexpected '+group+'/'+op);
  };
  const app=createApp({baseUrl:'http://localhost',secretKeyBase:secret,backendUrl:'http://localhost'},{backend,proxy:()=>{throw Error('Rails unavailable');},logger:{error(){}}});
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {state,get:(path,options={})=>fetch('http://localhost:'+server.address().port+path,{redirect:'manual',...options})};
}
test('account pages render natively without Rails; settings and key changes require login',async t=>{
  const {get}=await fixture(t,{anonymous:true});
  for(const path of ['/signup','/users/new','/i-forgor','/i-forgor/commit/token']){
    const response=await get(path);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-walltaker-renderer'),'node-native');
    const body=await response.text();assert.match(body,/name="authenticity_token" value="valid"/);assert.doesNotMatch(body,/undefined/);
  }
  for(const path of ['/settings','/settings/index'])assert.equal((await get(path)).headers.get('location'),'/login');
  assert.equal((await get('/users/Alice/key',post({}))).headers.get('location'),'/login');
});
test('signup preserves safe fields and invite validation, whitelists attributes, rotates identity and authenticates the visit',async t=>{
  const {state,get}=await fixture(t,{anonymous:true,inviteOnly:true});
  const form=await get('/signup?invite_code=INVITE');assert.match(await form.text(),/id="invite_code" value="INVITE" autocomplete="one-time-code" required/);
  const bad=await get('/users',post({'user[email]':'person@example.test','user[username]':'NewUser','user[password]':'secret-not-rendered','user[password_confirmation]':'mismatch',invite_code:'BAD'}));
  assert.equal(bad.status,422);const body=await bad.text();assert.match(body,/Invite code is invalid/);assert.match(body,/value="person@example.test"/);assert.match(body,/value="NewUser"/);assert.doesNotMatch(body,/secret-not-rendered|mismatch/);
  const good=await get('/users',post({'user[email]':'person@example.test','user[username]':'NewUser','user[password]':'secret','user[password_confirmation]':'secret','user[admin]':'1','user[system_account]':'1',invite_code:'INVITE'}));
  assert.equal(good.status,303);assert.equal(good.headers.get('location'),'/links');assert.equal(flash(good).notice,'Thank you for signing up!');
  assert.ok(good.headers.getSetCookie().some(c=>c.startsWith('walltaker_session=rotated-session')));
  const signup=state.calls.filter(c=>c.op==='signup').at(-1).input;assert.equal(signup.admin,undefined);assert.equal(signup.system_account,undefined);assert.match(signup.request_key,/^web:.*:signup$/);assert.ok(signup.ip);
  assert.ok(state.calls.some(c=>c.op==='visit-authenticate'&&c.input.user_id===9));
  assert.ok(!JSON.stringify(state.calls.filter(c=>c.group==='activity')).includes('secret'));
});
test('CSRF failures and malformed forms never reach account mutations; GET aliases do not mutate',async t=>{
  const {state,get}=await fixture(t);
  for(const path of ['/users','/settings','/i-forgor','/i-forgor/commit/token','/users/Alice/key'])assert.equal((await get(path,post({authenticity_token:'bad'}))).status,422);
  assert.equal((await get('/settings',post({'user[]':'malformed'}))).status,400);
  assert.equal((await get('/users',post({'user[email][]':'malformed'}))).status,400);
  assert.equal((await get('/settings/save?user[colour_preference]=light')).headers.get('location'),'/settings');
  assert.equal((await get('/signup',{method:'HEAD'})).status,200);
  assert.ok(!state.calls.some(c=>c.group==='accounts'||['signup','reset-request'].includes(c.op)));
});
test('reset requests have identical known/unknown notices, use browser rate limiting, and never return reset secrets',async t=>{
  const {state,get}=await fixture(t,{anonymous:true});
  for(const email of ['known@example.test','missing@example.test']){
    const response=await get('/i-forgor',post({email}));assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/login');
    assert.equal(flash(response).notice,'If an account exists for that email, a password reset email has been sent.');assert.doesNotMatch(JSON.stringify(response.headers.getSetCookie()),/queued|ignored|valid-reset-token/);
  }
  const request=state.calls.find(c=>c.op==='reset-request').input;assert.ok(request.ip);assert.match(request.request_key,/:reset-request$/);
  state.limited=true;const limited=await get('/i-forgor',post({email:'known@example.test'}));assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'20');
});
test('reset completion handles mismatch, expiry and replay, clears own revoked session, and never echoes passwords',async t=>{
  const {state,get}=await fixture(t);
  const fields={password:'replacement-secret',password_confirmation:'different'};
  let response=await get('/i-forgor/commit/valid-reset-token',post(fields));assert.equal(response.headers.get('location'),'/i-forgor/commit/valid-reset-token');assert.match(flash(response).alert,/Something went wrong/);assert.doesNotMatch(JSON.stringify(response.headers.getSetCookie()),/replacement-secret/);
  state.expired=true;response=await get('/i-forgor/commit/valid-reset-token',post({...fields,password_confirmation:fields.password}));assert.equal(response.headers.get('location'),'/i-forgor/commit/valid-reset-token');state.expired=false;
  response=await get('/i-forgor/commit/valid-reset-token',post({...fields,password_confirmation:fields.password}));assert.equal(response.headers.get('location'),'/login');assert.equal(flash(response).notice,'Password reset successfully!');assert.ok(state.anonymous);
  response=await get('/i-forgor/commit/valid-reset-token',post({...fields,password_confirmation:fields.password}));assert.match(flash(response).alert,/Something went wrong/);
});
test('settings preserve original form controls and use server-selected identity for theme, username and password changes',async t=>{
  const {state,get}=await fixture(t);
  const page=await get('/settings');const body=await page.text();assert.match(body,/Alice&#39;s settings/);assert.match(body,/settings__field-grid settings__password-fields/);assert.match(body,/id="user_colour_preference_auto" value="auto" checked/);assert.match(body,/data-turbo-confirm="Delete your account\?/);assert.doesNotMatch(body,/current-secret/);
  let response=await get('/settings',post({'user[colour_preference]':'dark','user[admin]':'1',target_id:'8'}));assert.equal(response.headers.get('location'),'/users/Alice');assert.equal(flash(response).notice,'Settings changed successfully!');
  const colour=state.calls.find(c=>c.op==='colour').input;assert.equal(colour.target_id,7);assert.equal(colour.admin,undefined);
  response=await get('/settings',post({settings_action:'username','user[username]':' NewAlice '}));assert.equal(response.headers.get('location'),'/users/NewAlice');assert.equal(flash(response).notice,'Username changed successfully!');
  response=await get('/settings',post({settings_action:'username','user[username]':'Another'}));assert.equal(response.headers.get('location'),'/settings');assert.equal(flash(response).alert,'Username can only be changed once a week.');
  assert.match(await (await get('/settings')).text(),/Username changes are available once a week/);
  response=await get('/settings',post({settings_action:'password','user[current_password]':'wrong','user[password]':'new','user[password_confirmation]':'new'}));assert.equal(flash(response).alert,'Current password is incorrect.');
  response=await get('/settings',post({settings_action:'password','user[current_password]':'current-secret','user[password]':'new','user[password_confirmation]':'new'}));assert.equal(response.headers.get('location'),'/settings');assert.equal(flash(response).notice,'Password changed successfully!');
});
test('delegated settings use the controller and surrendered accounts retain their authorization redirect',async t=>{
  const {state,get}=await fixture(t,{delegated:true});
  assert.match(await (await get('/settings')).text(),/Chris&#39; settings/);
  await get('/settings',post({'user[colour_preference]':'light',target_id:'7'}));const call=state.calls.find(c=>c.op==='colour').input;
  assert.equal(call.actor_id,7);assert.equal(call.surrender_id,12);assert.equal(call.target_id,8);
  state.surrendered=true;assert.equal((await get('/settings')).headers.get('location'),'/surrenders/12');
});
test('API key rotation is owner-only, CSRF protected and never returns the generated key',async t=>{
  const {state,get}=await fixture(t);
  assert.equal((await get('/users/Chris/key',post({}))).status,403);assert.ok(!state.calls.some(c=>c.op==='api-key'));
  const response=await get('/users/Alice/key',post({actor_id:'8'}));assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/users/Alice');
  const call=state.calls.find(c=>c.op==='api-key').input;assert.equal(call.actor_id,7);assert.equal(await response.text(),'');
});
test('deletion requires the current password and authorization, protects system accounts, and clears all identities on success',async t=>{
  const {state,get}=await fixture(t);
  let response=await get('/settings',post({_method:'delete','account[password]':'wrong'}));assert.equal(flash(response).alert,'Current password is incorrect.');assert.ok(!state.deleted);
  state.users[0].system_account=true;assert.doesNotMatch(await (await get('/settings')).text(),/Danger Zone|Change password|Change username/);
  response=await get('/settings',post({_method:'delete','account[password]':'current-secret'}));assert.equal(flash(response).alert,'System accounts cannot be deleted.');assert.ok(!state.deleted);state.users[0].system_account=false;
  response=await get('/settings',post({_method:'delete','account[password]':'current-secret','account[target_id]':'8'}));assert.equal(response.headers.get('location'),'/login');assert.equal(flash(response).notice,'Your account has been deleted.');assert.ok(state.deleted&&state.anonymous);
  for(const name of ['walltaker_session','permanent_session_id','surrender_id'])assert.ok(response.headers.getSetCookie().some(c=>c.startsWith(name+'=')&&c.includes('Max-Age=0')),name);
});
test('unavailable account services produce retryable errors without changing session or claiming success',async t=>{
  const {state,get}=await fixture(t,{anonymous:true});state.signupUnavailable=true;
  let response=await get('/users',post({'user[username]':'Alice','user[password]':'private-secret'}));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private-secret|Thank you/);assert.ok(state.anonymous);
  state.anonymous=false;state.accountUnavailable=true;response=await get('/settings',post({_method:'delete','account[password]':'current-secret'}));assert.equal(response.status,503);assert.ok(!state.deleted);assert.ok(!state.calls.some(c=>c.op==='logout'));
});
