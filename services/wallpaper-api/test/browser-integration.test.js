import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import{readFileSync}from'node:fs';import{createClient}from'redis';import{randomUUID}from'node:crypto';
import{createBrowserSessions,createBrowserLimiter}from'../src/browser-sessions.js';
import{createAccounts}from'../../accounts/src/accounts.js';
import{createBrowserData}from'../src/browser-data.js';import{createSocial}from'../src/social.js';import{createSessionViewer}from'../src/auth.js';
pg.types.setTypeParser(1114,v=>new Date(v+'Z'));
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/browser-cookies.json',import.meta.url)));
const cookie=doc=>doc.cookies?.map(v=>v.name+'='+encodeURIComponent(v.value)).join('; ') || '';
test('browser session lifecycle and render data use production grants and real PostgreSQL',{skip:!process.env.TEST_DATABASE_URL},async t=>{
 const boot=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});let admin,pool;
 try{
  await boot.query('CREATE DATABASE node_browser_test');const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/node_browser_test';admin=new pg.Pool({connectionString:url.href,max:2});
  for(const file of ['moderation-schema.sql','browser-schema.sql'])await admin.query(readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8'));
  await admin.query(`CREATE ROLE node_browser LOGIN PASSWORD 'test';
   INSERT INTO users(id,username,email,password_digest,api_key,admin,created_at,updated_at) VALUES
    (42,'Alice','private@example.test','private-hash','privkey',false,now(),now()),(43,'Bob','bob@example.test','hash','key',false,now(),now()),
    (44,'Admin','admin@example.test','hash','key',true,now(),now()),(45,'evil','evil@example.test','hash','key',false,now(),now());
   INSERT INTO links(id,user_id,never_expires,friends_only,terms,created_at,updated_at) VALUES(1,42,true,false,'Public',now(),now()),(2,43,true,true,'Private',now(),now()),(3,43,false,false,'Expired',now(),now());
   UPDATE links SET expires=now()-interval '1 day' WHERE id=3;
   INSERT INTO profiles(id,user_id,content,name,public,created_at,updated_at) VALUES(1,42,'Profile content','Style',true,now(),now());UPDATE users SET profile_id=1 WHERE id=42;`);
  await admin.query("CREATE TABLE node_moderation_events(id bigserial PRIMARY KEY,request_key varchar(160) UNIQUE,payload_digest varchar(64),operation text,user_id bigint,result jsonb,effects jsonb,delivered_at timestamp,delivery_attempts integer DEFAULT 0,available_at timestamp DEFAULT now(),created_at timestamp,updated_at timestamp)");
  const script=readFileSync(new URL('../../../scripts/provision-browser.sh',import.meta.url),'utf8');
  for(const line of script.split('\n')){
   const m=/^SELECT format\('(GRANT [^']+)', (.+?)\) \\gexec$/.exec(line);if(!m)continue;
   let sql=m[1];for(const value of m[2].matchAll(/:'([^']+)'/g))sql=sql.replace('%I','"'+({browser_user:'node_browser',database_name:'node_browser_test'}[value[1]])+'"');await admin.query(sql);
  }
  url.username='node_browser';url.password='test';pool=new pg.Pool({connectionString:url.href,max:2});
  const realAccounts=createAccounts({pool:admin,secretKeyBase:fixtures.secret,passwords:{verify:async()=>true,hash:async()=> 'test-hash'}});
  const accounts=async(op,input)=>op==='authenticate'?{user_id:input.password==='valid'?({Alice:'42',Bob:'43',Admin:'44'}[input.identifier] || null):null}:realAccounts(op,input);
  const social=createSocial(admin);let time=Date.now();const sessions=createBrowserSessions({pool,secretKeyBase:fixtures.secret,baseUrl:'https://example.test',accounts,social,now:()=>time});
  const store={connected:async()=>new Set(['1']),onlineIds:async()=>['1']},data=createBrowserData({pool,sessions,accounts,store});
  const login=async(name='Alice',remember=false)=>sessions.request('login',{identifier:name,password:'valid',remember});
  let alice,bob;
  await t.test('browser role cannot read credentials or modify business records or acknowledge receipts',async()=>{
   for(const sql of ['SELECT email FROM users','SELECT password_digest FROM users','SELECT api_key FROM users','SELECT password_reset_token FROM users',"UPDATE users SET admin=true","UPDATE links SET terms='bad'",'DELETE FROM node_browser_sessions','UPDATE node_browser_sessions SET user_id=44','UPDATE node_account_events SET delivered_at=now()','SELECT user_agent FROM ahoy_visits'])await assert.rejects(pool.query(sql),{code:'42501'});
  });
  await t.test('opaque tokens rotate, only hashes are stored, failed logins do not authenticate, logout revokes replay',async()=>{
   assert.equal((await sessions.request('login',{identifier:'Alice',password:'bad'})).user,null);
   alice=await login();assert.equal((await sessions.resolve(cookie(alice))).user.id,'42');assert.equal(alice.cookies[0].expires_at,null);
   const row=(await admin.query('SELECT * FROM node_browser_sessions ORDER BY id DESC LIMIT 1')).rows[0];assert.notEqual(row.token_digest,alice.cookies[0].value);
   assert.equal((await sessions.resolve('walltaker_session='+row.token_digest)).user,null);
   assert.equal((await sessions.resolve('walltaker_session=bad; permanent_session_id='+encodeURIComponent(fixtures.permanent))).user,null);
   const remembered=await login('Bob',true);assert.ok(remembered.cookies[0].expires_at);bob=remembered;
   await sessions.request('logout',{},cookie(alice));assert.equal((await sessions.resolve(cookie(alice))).user,null);alice=await login();
  });
  await t.test('signed and encrypted Rails sessions migrate and logout revokes both original credentials',async()=>{
   const old='permanent_session_id='+encodeURIComponent(fixtures.permanent)+'; _walltaker_session='+encodeURIComponent(fixtures.encrypted)+'; surrender_id='+encodeURIComponent(fixtures.no_surrender);
   const context=await sessions.request('context',{},old);assert.equal(context.user.id,'42');assert.equal(context.clear_legacy,true);assert.ok(context.cookies.some(c=>c.name==='walltaker_session'));
   assert.equal((await sessions.resolve(cookie(context))).user.id,'42');
   await sessions.request('logout',{},cookie(context));assert.equal((await sessions.resolve(old)).user,null);
  });
  await t.test('native CSRF and legacy Rails CSRF keep form validation and reject bad origins and tokens',async()=>{
   const ctx=await sessions.request('context',{},cookie(alice));const combined=cookie(alice)+'; '+cookie(ctx);
   const base={method:'POST',path:'/settings',origin:'https://example.test'};
   assert.equal((await sessions.request('csrf',{...base,tokens:[ctx.csrf_token]},combined)).verified,true);
   assert.equal((await sessions.request('csrf',{...base,tokens:['bad']},combined)).verified,false);
   assert.equal((await sessions.request('csrf',{...base,origin:'https://bad.test',tokens:[ctx.csrf_token]},combined)).verified,false);
   assert.equal((await sessions.request('csrf',{...base,tokens:[fixtures.masked_form]},'_walltaker_session='+encodeURIComponent(fixtures.encrypted))).verified,true);
  });
  await t.test('profile, link, style and render graphs enforce visibility and expose private fields only through self account reads',async()=>{
   const doc=await data('profile-page',{username:'Alice',private:true},cookie(alice));assert.equal(doc.user_id,'42');assert.equal(doc.graph.users.find(u=>u.id==='42').email,'private@example.test');assert.equal(doc.link_ids[0],'1');
   assert.equal((await data('user',{username:'Alice'},cookie(bob))).graph.users.find(u=>u.id==='42').email,undefined);
   assert.equal((await data('link',{identifier:'1'},'')).link_id,'1');
   for(const id of ['2','3'])await assert.rejects(data('link',{identifier:id},cookie(alice)),{status:404});
   await assert.rejects(data('link',{identifier:'1',purpose:'edit'},cookie(bob)),{status:403});
   const offline=createBrowserData({pool,sessions,accounts,store:{...store,onlineIds:async()=>[]}});
   const offlinePage=await offline('profile-page',{username:'Alice'},cookie(alice));assert.equal(offlinePage.any_links_online,false);assert.equal(offlinePage.most_recent_pinged_link_id,'1');
   await admin.query("INSERT INTO wallpaper_clients(id,name,url,section,position,match_position,created_at,updated_at) VALUES(1,'Help client','https://example.test','clients',1,1,now(),now()),(2,'Hidden client',NULL,'hidden',2,2,now(),now())");
   assert.deepEqual((await data('site-clients',{},'')).clients.map(c=>c.id),['1']);
   assert.ok((await data('hydrate',{ids:{clients:['2']}},'')).graph.clients.some(c=>c.id==='2'));
   assert.equal((await data('profiles',{},cookie(alice))).profile_ids[0],'1');await assert.rejects(data('profiles',{},''),{status:403});
   assert.equal((await data('hydrate',{ids:{users:['42'],links:['1']}},'')).graph.users.find(u=>u.id==='42').api_key,undefined);
   await assert.rejects(data('hydrate',{ids:{users:['bad']}},''),{status:422});
  });
  await t.test('account service protects self credentials and reset delivery tokens are tied to pending matching receipts',async()=>{
   assert.equal((await realAccounts('browser-private-user',{actor_id:42,target_id:42})).user.api_key,'privkey');
   await assert.rejects(realAccounts('browser-private-user',{actor_id:43,target_id:42}),{status:403});
   const reset=await realAccounts('reset-request',{email:'private@example.test',request_key:randomUUID()});
   const event=(await admin.query("SELECT id FROM node_account_events WHERE operation='reset-request' ORDER BY id DESC LIMIT 1")).rows[0];
   const delivery=(await realAccounts('delivery-user',{event_id:event.id})).delivery;assert.ok(delivery.token);assert.equal(delivery.user.email,'private@example.test');assert.equal(delivery.user.password_digest,undefined);
   await admin.query('UPDATE users SET password_reset_token=NULL WHERE id=42');assert.equal((await realAccounts('delivery-user',{event_id:event.id})).delivery,null);
  });
  await t.test('API and WebSocket session viewer resolves directly in Node without a Rails callback',async()=>{
   const viewer=createSessionViewer({resolveSession:sessions.resolve,fetchImpl:()=>{throw Error('unexpected Rails call');}});
   assert.equal(await viewer({cookie:cookie(alice)}),'42');assert.equal(await viewer({cookie:'walltaker_session=bad'}),null);
  });
  await t.test('delegation preserves consent, returns to the controller and immediately rejects revoked proof',async()=>{
   await admin.query("INSERT INTO friendships(id,sender_id,receiver_id,confirmed,created_at,updated_at) VALUES(99,42,43,true,now(),now());INSERT INTO surrenders(id,user_id,controller_user_id,friendship_id,pending,accepted_consequences,expires_at,logged_in,created_at,updated_at,token) VALUES(99,42,43,99,false,true,now()+interval '1 hour',false,now(),now(),'test')");
   assert.equal((await sessions.request('authorize',{mode:'standard'},cookie(alice))).redirect,'/surrenders/99');
   const assumed=await sessions.request('surrender-assume',{id:99,request_key:randomUUID()},cookie(bob));assert.equal(assumed.user.id,'42');assert.equal((await sessions.resolve(cookie(assumed))).surrender.id,'99');
   await assert.rejects(sessions.request('authorize',{mode:'admin'},cookie(assumed)),{status:403});
   const returned=await sessions.request('surrender-return',{request_key:randomUUID()},cookie(assumed));assert.equal(returned.user.id,'43');assert.equal((await sessions.resolve(cookie(assumed))).user,null);
   const second=await sessions.request('surrender-assume',{id:99,request_key:randomUUID()},cookie(returned));await admin.query('UPDATE surrenders SET logged_in=false WHERE id=99');assert.equal((await sessions.resolve(cookie(second))).user,null);
   await admin.query('DELETE FROM surrenders;DELETE FROM friendships');
  });
  await t.test('deleted delegation receipts include complete revoked render snapshots without lazy database reads',async()=>{
   const effects={users:['42','43'],notifications:[],surrenders:[{id:'99',user_id:'42',controller_user_id:'43'}]};
   const event=(await admin.query("INSERT INTO node_social_events(request_key,payload_digest,operation,user_id,result,effects,created_at,updated_at) VALUES($1,$2,'surrender-delete',42,'{}',$3,now(),now()) RETURNING id",[randomUUID(),'a'.repeat(64),JSON.stringify(effects)])).rows[0];
   const document=await data('event-data',{kind:'social',event_id:event.id},'');
   assert.deepEqual(document.graph.revoked_surrenders,['99']);const snapshot=document.graph.surrenders.find(s=>s.id==='99');assert.equal(snapshot.expires_at,null);assert.equal(snapshot.friendship_id,null);assert.ok(!document.graph.surrender_valid.includes('99'));
  });
  await t.test('admin assumptions, role changes, invite-only evil access, IP bans, expiry and deletion are checked against current data',async()=>{
   const adminDoc=await login('Admin');await sessions.request('authorize',{mode:'admin'},cookie(adminDoc));await assert.rejects(sessions.request('assume',{user_id:43},cookie(alice)),{status:403});
   const assumed=await sessions.request('assume',{user_id:43},cookie(adminDoc));assert.equal(assumed.user.id,'43');
   const another=await login('Admin');await admin.query('UPDATE users SET admin=false WHERE id=44');await assert.rejects(sessions.request('authorize',{mode:'admin'},cookie(another)),{status:403});
   const evil=await sessions.request('evil',{});assert.equal(evil.user.username,'evil');await admin.query("INSERT INTO site_settings(key,value,created_at,updated_at) VALUES('invite_only','true',now(),now())");assert.equal((await sessions.resolve(cookie(evil))).user,null);await assert.rejects(sessions.request('evil',{}),{status:403});
   await admin.query("INSERT INTO banned_ips(ip_address,created_at,updated_at) VALUES('198.51.100.23',now(),now())");await assert.rejects(sessions.request('authorize',{ip:'198.51.100.23'},cookie(alice)),{status:403});
   await admin.query('UPDATE users SET deleted_at=now() WHERE id=43');assert.equal((await sessions.resolve(cookie(assumed))).user,null);await admin.query('UPDATE users SET deleted_at=NULL WHERE id=43');assert.equal((await sessions.resolve(cookie(assumed))).user,null);
   time+=15*86400000;assert.equal((await sessions.resolve(cookie(alice))).user,null);
  });
 }finally{await pool?.end();await admin?.end();await boot.end();}
});
test('browser Redis throttles use opaque HMAC keys and independent login, request and reset limits',{skip:!process.env.TEST_REDIS_URL},async()=>{
 const redis=createClient({url:process.env.TEST_REDIS_URL});await redis.connect();const marker=randomUUID();
 try{const limit=createBrowserLimiter(redis,'test');for(let i=0;i<5;i++)await limit('login',marker);await assert.rejects(limit('login',marker),{status:429});await limit('request',marker);await limit('reset-email',marker+'@example.test');const keys=await redis.keys('node:browser:limit:*');assert.ok(keys.length>=3);assert.ok(keys.every(k=>!k.includes(marker)));}finally{await redis.quit();}
});
