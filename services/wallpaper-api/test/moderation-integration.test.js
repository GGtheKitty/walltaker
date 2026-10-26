import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createModeration} from '../src/moderation.js';
import {normalizeDomain,domainDecision} from '../src/moderation-domains.js';
import {createAccounts} from '../../accounts/src/accounts.js';

const READS=['admin-session','dashboard','invites','emoji-links','user-icons','clients','domains','system','activity','user','deleted-users','quarantine','events','reports','report','bots'];
const WRITES=['setting-toggle','invite-create','invite-delete','emoji-create','emoji-update','emoji-delete','icon-create','icon-update','icon-delete','client-create','client-update','client-delete','client-move','domain-update','user-update','user-restore','user-purge','user-assume','user-quarantine','user-ipban','event-ipban','password-reset','report-close','link-delete','bot-update','bot-start','bot-stop'];

test('domain normalization and most-specific decisions preserve policy',()=>{
 assert.equal(normalizeDomain(' CDN.Example.TEST. '),'cdn.example.test');assert.equal(normalizeDomain('BÜCHER.example'),'xn--bcher-kva.example');assert.equal(normalizeDomain('[::1]'),'::1');
 for(const value of ['',[],{},'a..test','https://bad.test','x\0test','-x.test'])assert.throws(()=>normalizeDomain(value),{status:422});
 const rules=[{domain:'example.test',status:2},{domain:'safe.example.test',status:1}];assert.equal(domainDecision(rules,'cdn.example.test').status,2);assert.equal(domainDecision(rules,'sub.safe.example.test').status,1);assert.equal(domainDecision(rules,'elsewhere.test'),null);
});

test('moderation with production grants, schema foreign keys, concurrency and recovery', {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const bootstrap=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let admin,pool;
 try {
  await bootstrap.query('CREATE DATABASE node_moderation_test');
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/node_moderation_test';admin=new pg.Pool({connectionString:url.href,max:2});
  await admin.query(readFileSync(new URL('./fixtures/moderation-schema.sql',import.meta.url),'utf8'));
  await admin.query(readFileSync(new URL('./fixtures/automation-schema.sql',import.meta.url),'utf8'));
  await admin.query(readFileSync(new URL('../../../db/migrations/20261026050000_add_bot_controls.sql',import.meta.url),'utf8'));
  await admin.query(`CREATE TABLE node_moderation_events(id bigserial PRIMARY KEY,request_key varchar(160) NOT NULL UNIQUE CHECK(request_key<>'force-failure'),payload_digest varchar(64) NOT NULL,operation text NOT NULL,user_id bigint,result jsonb NOT NULL,effects jsonb NOT NULL,delivered_at timestamp,delivery_attempts integer DEFAULT 0,available_at timestamp DEFAULT now(),created_at timestamp NOT NULL,updated_at timestamp NOT NULL);
   CREATE ROLE node_moderation LOGIN PASSWORD 'test';
   REVOKE ALL ON FUNCTION public.walltaker_api_authenticate(text) FROM PUBLIC;
   INSERT INTO users(id,username,email,password_digest,api_key,admin,created_at,updated_at) VALUES
    (1,'Admin','admin@example.test','private-hash','adminapi',true,now(),now()),
    (2,'Alice','alice@example.test','alice-hash','aliceapi',false,now(),now()),
    (3,'Bob','bob@example.test','bob-hash','bobapi',false,now(),now()),
    (4,'Gone','gone@example.test','gone-hash','goneapi',true,now(),now()),
    (5,'PornLizardKi','ki@example.test','system-hash','sysapi',false,now(),now()),
    (6,'SecondAdmin','secondadmin@example.test','other-hash','otherapi',true,now(),now());
   UPDATE users SET deleted_at=now(),deleted_username='GoneOriginal' WHERE id=4;
   UPDATE users SET system_account=true WHERE id=5; UPDATE users SET mascot='ki'; SELECT setval('users_id_seq',6);
   INSERT INTO links(id,user_id,set_by_id,never_expires,friends_only,created_at,updated_at,min_score,last_ping,terms,blacklist,post_url) VALUES
    (1,2,3,true,false,now(),now(),0,now(),'forest','', 'https://example.test/current.jpg'),
    (2,3,2,true,true,now(),now(),0,now(),'private','', 'https://example.test/private.jpg');
   INSERT INTO past_links(id,user_id,link_id,set_by_id,post_url,post_thumbnail_url,created_at,updated_at) VALUES(1,2,1,3,'https://example.test/current.jpg','https://example.test/thumb.jpg',now(),now());
   INSERT INTO ahoy_visits(id,user_id,ip,user_agent,started_at) VALUES(1,2,'198.51.100.42','Moderation test',now()),(2,2,'198.51.100.42','Moderation test',now()),(3,2,'','Empty IP',now());
   INSERT INTO ahoy_events(id,visit_id,user_id,name,properties,time) VALUES(1,1,2,'nefarious:example','{"past_link_id":1}',now()),(2,NULL,NULL,'nefarious:orphan','{}',now());`);
  const script=readFileSync(new URL('../../../scripts/provision-moderation.sh',import.meta.url),'utf8');
  for(const line of script.split('\n')) {
   const m=/^SELECT format\('(GRANT [^']+)', (.+)\) \\gexec$/.exec(line);if(!m)continue;
   let sql=m[1];for(const name of m[2].matchAll(/:'([^']+)'/g))sql=sql.replace('%I','"'+(name[1]==='database_name'?'node_moderation_test':'node_moderation')+'"');await admin.query(sql);
  }
  url.username='node_moderation';url.password='test';pool=new pg.Pool({connectionString:url.href,max:2});
  const store={onlineIds:async()=>['2']},redis={ping:async()=>true,info:async()=>'used_memory:1234\r\nused_memory_peak:2345\r\n'};
  const manage=createModeration({pool,store,redis,secretKeyBase:'test-secret',baseUrl:'https://example.test'});
  const cmd=(op,input={})=>manage(op,{actor_id:1,request_key:randomUUID(),...input});
  const denied=(promise,status)=>assert.rejects(promise,e=>e.status===status);
  const count=async table=>Number((await admin.query('SELECT count(*) FROM '+table)).rows[0].count);
  await t.test('bot controls preserve defaults, validate settings, reject stale edits, and audit idempotent start/stop commands',async()=>{
   const initial=await cmd('bots');assert.equal(initial.bots.length,4);assert.equal(initial.worker.healthy,false);
   const ki=initial.bots.find(b=>b.name==='ki');assert.equal(ki.enabled,true);assert.equal(ki.interval_seconds,60);assert.equal(ki.cooldown_seconds,600);assert.equal(ki.round_limit,4);assert.equal(ki.account_available,true);
   const attributes={normal_tags:'forest\n rating:e',perverted_tags:'latex rating:e',interval_seconds:180,cooldown_seconds:0,round_limit:2,enabled:false};
   const input={actor_id:1,bot:'ki',revision:ki.revision,attributes,request_key:'custom-bot-settings'};
   const saved=await manage('bot-update',input);assert.equal(saved.revision,'2');assert.equal(saved.enabled,true);
   assert.deepEqual(await manage('bot-update',input),saved);await denied(cmd('bot-update',{bot:'ki',revision:'1',attributes}),409);
   for(const invalid of [{interval_seconds:59},{interval_seconds:'1.5'},{cooldown_seconds:-1},{round_limit:61},{normal_tags:'x'.repeat(2001)}])
    await denied(cmd('bot-update',{bot:'ki',revision:'2',attributes:{...attributes,...invalid}}),422);
   await denied(cmd('bot-start',{bot:'__proto__',revision:'1'}),404);
   const stopped=await cmd('bot-stop',{bot:'ki',revision:saved.revision});assert.equal(stopped.enabled,false);
   const started=await cmd('bot-start',{bot:'ki',revision:stopped.revision});assert.equal(started.enabled,true);
   const current=(await cmd('bots')).bots.find(b=>b.name==='ki');assert.equal(current.normal_tags,'forest rating:e');assert.equal(current.perverted_tags,'latex rating:e');assert.equal(current.cooldown_seconds,0);
   assert.equal((await admin.query("SELECT count(*) FROM node_moderation_events WHERE operation='bot-update'")).rows[0].count,'1');
   const races=await Promise.allSettled([cmd('bot-stop',{bot:'ki',revision:started.revision}),cmd('bot-update',{actor_id:6,bot:'ki',revision:started.revision,attributes})]);
   assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.find(r=>r.status==='rejected').reason.status,409);
   await admin.query("UPDATE node_automation_schedules SET last_checked_at=now() WHERE name='ki'");assert.equal((await cmd('bots')).worker.healthy,true);
   await admin.query("UPDATE node_automation_schedules SET last_checked_at=now()-interval '1 minute' WHERE name='ki'");assert.equal((await cmd('bots')).worker.healthy,false);
  });
  await t.test('role can administer intended data but cannot read hashes/API keys, promote users, or acknowledge receipts',async()=>{
   for(const sql of ['SELECT password_digest FROM users','SELECT api_key FROM users','UPDATE users SET admin=true','UPDATE users SET system_account=false','UPDATE users SET password_digest=\'x\'','UPDATE users SET api_key=\'x\'','UPDATE node_moderation_events SET delivered_at=now()','INSERT INTO users(username) VALUES(\'x\')'])await assert.rejects(pool.query(sql),{code:'42501'});
  });
  await t.test('every administrative operation rechecks active admin status and rejects delegated or forged privileges',async()=>{
   const before=await count('node_moderation_events');
   for(const op of [...READS,...WRITES]) {
    await denied(cmd(op,{actor_id:2,admin:true}),403);
    await denied(cmd(op,{surrender_id:999}),403);
    await denied(manage(op,{request_key:randomUUID()}),403);
    await denied(cmd(op,{actor_id:4}),403);
   }
   assert.equal(await count('node_moderation_events'),before);
  });
  await t.test('settings toggle atomically; replay does not retoggle and conflicting retries roll back',async()=>{
   const input={actor_id:1,request_key:'toggle-once',key:'nnn_enabled'};
   const [a,b]=await Promise.all([manage('setting-toggle',input),manage('setting-toggle',input)]);assert.deepEqual(a,b);assert.equal(a.enabled,true);
   await denied(manage('setting-toggle',{...input,key:'invite_only'}),409);await denied(cmd('setting-toggle',{key:'admin'}),422);
   assert.equal((await cmd('dashboard')).settings.nnn_enabled,true);
   await cmd('setting-toggle',{key:'nnn_enabled'});assert.equal((await cmd('dashboard')).settings.nnn_enabled,false);
   await assert.rejects(cmd('setting-toggle',{key:'invite_only',request_key:'force-failure'}));assert.equal((await cmd('dashboard')).settings.invite_only,undefined);
  });
  await t.test('invites generate once, are paged, retain redemption attribution and delete without changing users',async()=>{
   const input={actor_id:1,request_key:'invite-once'};const a=await manage('invite-create',input);assert.deepEqual(await manage('invite-create',input),a);
   const data=await cmd('invites');assert.equal(data.invites.count,1);assert.match(data.invites.records[0].code,/^[A-F0-9]{16}$/);assert.equal(data.users[0].username,'Admin');
   await admin.query('UPDATE invite_codes SET redeemed_by_id=2,redeemed_at=now() WHERE id=$1',[a.invite_id]);assert.equal((await cmd('invites')).users.length,2);
   await cmd('invite-delete',{id:a.invite_id});assert.equal(await count('invite_codes'),0);assert.equal(await count('users'),6);
  });
  await t.test('emoji and icons validate input, uniqueness and ownership fields under concurrent requests',async()=>{
   const e=await cmd('emoji-create',{link_id:1,emoji:'👩‍💻'});await denied(cmd('emoji-create',{link_id:1,emoji:'🐱'}),422);
   for(const emoji of ['A','🐱🐶',''])await denied(cmd('emoji-update',{id:e.id,link_id:1,emoji}),422);
   await cmd('emoji-update',{id:e.id,link_id:1,emoji:'🐱'});assert.equal((await cmd('emoji-links')).decorations.records[0].emoji,'🐱');await cmd('emoji-delete',{id:e.id});
   await denied(cmd('icon-create',{username:'Missing',icon_name:'rocket-outline'}),422);await denied(cmd('icon-create',{username:'Alice',icon_name:'<script>'}),422);
   const i=await cmd('icon-create',{username:' aLiCe ',icon_name:'rocket-outline'});await denied(cmd('icon-create',{username:'Alice',icon_name:'planet-outline'}),422);
   await cmd('icon-update',{id:i.id,username:'Bob',icon_name:'planet-outline'});const result=await cmd('user-icons');assert.equal(result.icons.records[0].user_id,'2');assert.equal(result.users[0].username,'Alice');await cmd('icon-delete',{id:i.id});
  });
  let clientA,clientB;
  await t.test('client catalogue edits preserve validation, recognition order, listing and atomic moves',async()=>{
   await denied(cmd('client-create',{attributes:{name:'No URL',section:'clients'}}),422);
   clientA=(await cmd('client-create',{attributes:{name:'One',section:'clients',url:'https://example.test/client',match_text:'Client/',icon_name:'rocket-outline',device_type:'desktop'}})).id;
   clientB=(await cmd('client-create',{attributes:{name:'Two',section:'hidden'}})).id;
   let list=(await cmd('clients')).clients.records;assert.deepEqual(list.map(c=>c.id),[clientA,clientB]);assert.deepEqual(list.map(c=>c.position),[10,20]);
   await cmd('client-move',{id:clientB,direction:'up'});list=(await cmd('clients')).clients.records;assert.deepEqual(list.map(c=>c.id),[clientB,clientA]);assert.equal(list[0].position,list[0].match_position);
   await cmd('client-move',{id:clientB,direction:'down'});await cmd('client-update',{id:clientA,attributes:{section:'companion_apps',link_name:'Renamed',deprecated:'1'}});
   assert.equal((await cmd('clients')).clients.records[0].link_name,'Renamed');await denied(cmd('client-update',{id:clientA,attributes:{url:'javascript:alert(1)'}}),422);
  });
  await t.test('admin lookup is deterministic and literal, includes deleted names and never exposes credential columns',async()=>{
   assert.equal((await cmd('user',{query:'ALICE'})).user.id,'2');assert.equal((await cmd('user',{query:'goneoriginal'})).user.id,'4');assert.equal((await cmd('user',{query:'%'})).user,null);
   const result=await cmd('user',{user_id:2});for(const field of ['password_digest','api_key','password_reset_token','password_reset_sent_at'])assert.equal(field in result.user,false);
   const deleted=await cmd('deleted-users');assert.equal(deleted.users.records.length,1);assert.equal('password_digest' in deleted.users.records[0],false);
  });
  await t.test('admin edits bypass the username cooldown but enforce case-insensitive identity uniqueness and system protections',async()=>{
   await admin.query("UPDATE users SET username_changed_at=now(),advanced=false WHERE id=2");
   await cmd('user-update',{user_id:2,attributes:{username:'AliceRenamed',email:'alice-renamed@example.test',set_count:'100',is_supporter:'1',admin:true,password_digest:'evil',api_key:'evil',details:'<!-- walltaker:markdown -->\nPrepared bio'},expected_advanced:false});
   const data=await cmd('user',{user_id:2});assert.equal(data.user.username,'AliceRenamed');assert.equal(data.user.set_count,100);assert.equal(data.user.is_supporter,true);assert.equal(data.user.admin,false);assert.equal(data.profile.content,'<!-- walltaker:markdown -->\nPrepared bio');
   assert.equal((await admin.query('SELECT password_digest,api_key FROM users WHERE id=2')).rows[0].password_digest,'alice-hash');
   await denied(cmd('user-update',{user_id:2,attributes:{username:'bOb'}}),422);await denied(cmd('user-update',{user_id:2,attributes:{email:'BOB@example.test'}}),422);
   await denied(cmd('user-update',{user_id:5,attributes:{username:'OtherSystem'}}),422);await denied(cmd('user-update',{user_id:2,attributes:{set_count:-1}}),422);
   await denied(cmd('user-update',{user_id:2,attributes:{details:'not prepared'},expected_advanced:false}),422);
   await denied(cmd('user-update',{user_id:2,attributes:{details:'<!-- walltaker:markdown -->\nPrepared'},expected_advanced:true}),409);
   await assert.rejects(cmd('user-update',{user_id:2,attributes:{set_count:200},request_key:'force-failure'}));assert.equal((await cmd('user',{user_id:2})).user.set_count,100);
  });
  await t.test('password recovery is usable, short-lived and single-use; retries do not leak tokens into the audit log',async()=>{
   for(const email of ['a','%','example.test'])await denied(cmd('password-reset',{email}),422);
   await denied(cmd('password-reset',{email:'KI@example.test'}),422);
   const input={actor_id:1,request_key:'reset-once',email:'ALICE-RENAMED@example.test',case_sensitive:false};
   const result=await manage('password-reset',input);assert.match(result.token,/^[a-f0-9]{64}$/);assert.deepEqual(await manage('password-reset',input),result);
   const event=(await admin.query("SELECT result FROM node_moderation_events WHERE request_key='reset-once'")).rows[0];assert.equal('token' in event.result,false);assert.ok(!JSON.stringify(event).includes(result.token));
   const account=createAccounts({pool:admin,secretKeyBase:'test-secret',passwords:{hash:async()=> 'new-hash',verify:async()=>true}});
   await account('reset-complete',{request_key:'consume-reset',token:result.token,password:'long-enough-password',password_confirmation:'long-enough-password'});
   await denied(manage('password-reset',input),409);await denied(account('reset-complete',{request_key:'consume-reset-again',token:result.token,password:'long-enough-password',password_confirmation:'long-enough-password'}),422);
   const issued=await cmd('password-reset',{email:'alice-renamed@example.test'});await admin.query("UPDATE users SET password_reset_sent_at=now()-interval '2 hours' WHERE id=2");
   await denied(account('reset-complete',{request_key:'expired-reset',token:issued.token,password:'long-enough-password',password_confirmation:'long-enough-password'}),422);
  });
  await t.test('reports scope private links, capture evidence on the server and expose snapshots only to administrators',async()=>{
   await denied(cmd('report-target',{actor_id:2,reportable_type:'Link',reportable_id:2}),403);
   await denied(cmd('report-create',{actor_id:2,reportable_type:'Profile',reportable_id:1,reason:'test'}),404);
   const report=await cmd('report-create',{actor_id:2,reportable_type:'User',reportable_id:3,reason:'Evidence',snapshot:'forged',reporter_id:1});
   const record=(await cmd('report',{report_id:report.report_id})).reports[0];assert.equal(record.reporter_id,'2');assert.match(record.snapshot,/Bob/);assert.notEqual(record.snapshot,'forged');assert.equal(record.reason,'Evidence');
   await denied(cmd('report',{actor_id:2,report_id:report.report_id}),403);
   assert.equal((await cmd('reports')).reports.length,1);await cmd('report-close',{report_id:report.report_id});const when=(await cmd('report',{report_id:report.report_id})).reports[0].updated_at;await cmd('report-close',{report_id:report.report_id});assert.deepEqual((await cmd('report',{report_id:report.report_id})).reports[0].updated_at,when);
   assert.equal((await cmd('reports',{closed:true})).reports.length,1);
  });
  await t.test('quarantine, visit graphs and IP bans are atomic and idempotent; orphan events are handled',async()=>{
   const before=(await cmd('user',{user_id:2})).user.quarantined;await cmd('user-quarantine',{user_id:2});assert.notEqual((await cmd('user',{user_id:2})).user.quarantined,before);
   const input={actor_id:1,request_key:'ban-once',user_id:2};const a=await manage('user-ipban',input);assert.equal(a.banned,1);assert.deepEqual(await manage('user-ipban',input),a);assert.equal((await cmd('user-ipban',{user_id:2})).banned,0);assert.equal(await count('banned_ips'),1);
   await cmd('event-ipban',{event_id:1});await denied(cmd('event-ipban',{event_id:2}),404);
   const graph=await cmd('quarantine');assert.equal(graph.stats['2'].visits,3);assert.equal(graph.bans.length,1);assert.equal(graph.moderators[0].username,'Admin');assert.equal((await cmd('events')).events.length,2);
  });
  await t.test('tracking events with malformed or non-object properties remain safe to inspect',async()=>{
   await admin.query(`INSERT INTO ahoy_events(id,name,properties,time) VALUES(3,'nefarious:array','[]',now()),(4,'nefarious:broken','broken',now())`);
   const events=(await cmd('events')).events;
   for(const e of events.filter(e=>['nefarious:array','nefarious:broken'].includes(e.name)))assert.deepEqual(JSON.parse(e.properties),{});
  });
  await t.test('domain telemetry, review, specificity and durable scrubbing use compare-and-swap persistence',async()=>{
   await manage('domain-seen',{domains:['blocked.test','safe.blocked.test','example.test','cdn.example.test']});assert.equal((await cmd('domains')).pending.count,2);
   const domains=(await cmd('domains')).pending.records;const parent=domains.find(d=>d.domain==='blocked.test'),safe=domains.find(d=>d.domain==='safe.blocked.test');
   await cmd('domain-update',{id:safe.id,status:'approved'});await cmd('domain-update',{id:parent.id,status:'blocked'});
   const event=(await admin.query("SELECT id FROM node_moderation_events WHERE operation='domain-update' AND (effects->>'scrub')::boolean=true ORDER BY id DESC LIMIT 1")).rows[0];
   const rules=(await manage('domain-rules')).rules;assert.equal(domainDecision(rules,'sub.safe.blocked.test').status,1);assert.equal(domainDecision(rules,'other.blocked.test').status,2);
   await manage('domain-seen',{domains:['cdn.blocked.test']});assert.equal((await cmd('domains')).pending.count,0);
   const p=(await admin.query("INSERT INTO profiles(user_id,name,content,created_at,updated_at) VALUES(3,'Scrub','original',now(),now()) RETURNING id")).rows[0];
   assert.ok((await manage('domain-scrub-page',{event_id:event.id})).profiles.some(row=>row.id===p.id));
   await denied(manage('domain-scrub-save',{event_id:999,profile_id:p.id,expected_content:'original',content:'bad'}),403);
   await admin.query('UPDATE profiles SET content=\'concurrent edit\' WHERE id=$1',[p.id]);assert.equal((await manage('domain-scrub-save',{event_id:event.id,profile_id:p.id,expected_content:'original',content:'scrubbed'})).saved,false);
   assert.equal((await manage('domain-scrub-save',{event_id:event.id,profile_id:p.id,expected_content:'concurrent edit',content:'scrubbed'})).saved,true);
   await admin.query('UPDATE node_moderation_events SET delivered_at=now() WHERE id=$1',[event.id]);await denied(manage('domain-scrub-page',{event_id:event.id}),403);
  });
  await t.test('system and activity analytics preserve UTC chart bounds, online clients and service health',async()=>{
   const activity=await cmd('activity');assert.equal(activity.activity.online_links,2);assert.equal(activity.activity.online_users,2);assert.equal(activity.hours.length,25);assert.equal(activity.activity.wallpapers_total,1);
   const metrics=await cmd('system');assert.equal(metrics.database.healthy,true);assert.equal(metrics.redis.healthy,true);assert.equal(metrics.redis.used_memory,1234);assert.ok(Number.isFinite(metrics.machine.cpu_percent));assert.equal(metrics.queue.ready,0);
   await denied(cmd('lizard-index',{actor_id:2}),403);assert.deepEqual(await cmd('lizard-index',{actor_id:5}),{});assert.equal('email' in (await cmd('lizard-browse',{actor_id:5,mascot:'ki'})).users[0],false);
  });
  await t.test('administrators can delete reported links while preserving history and detaching dependent records',async()=>{
   const report=await cmd('report-create',{actor_id:2,reportable_type:'Link',reportable_id:1,reason:'Reported link'});await admin.query('UPDATE users SET viewing_link_id=1 WHERE id=3');
   await cmd('link-delete',{link_id:1});assert.equal((await admin.query('SELECT link_id FROM past_links WHERE id=1')).rows[0].link_id,null);assert.equal((await admin.query('SELECT viewing_link_id FROM users WHERE id=3')).rows[0].viewing_link_id,null);
   assert.equal((await cmd('report',{report_id:report.report_id})).links.length,0);assert.ok((await cmd('report',{report_id:report.report_id})).reports[0].snapshot.includes('#1'));
  });
  await t.test('restoration resolves username collisions and assumption never accepts deleted accounts',async()=>{
   const result=await cmd('user-restore',{user_id:4});assert.equal(result.restored_original,true);assert.equal((await cmd('user',{user_id:4})).user.username,'GoneOriginal');
   await admin.query("UPDATE users SET deleted_at=now(),username='GoneTombstone',deleted_username='Bob' WHERE id=4");
   assert.equal((await cmd('user-restore',{user_id:4})).restored_original,false);assert.equal((await cmd('user',{user_id:4})).user.username,'GoneTombstone');
   assert.equal((await cmd('user-assume',{user_id:5})).user_id,'5');await admin.query('UPDATE users SET deleted_at=now() WHERE id=4');await denied(cmd('user-assume',{user_id:4}),422);
   await denied(cmd('user-purge',{user_id:2}),422);await admin.query('UPDATE users SET deleted_at=now() WHERE id=5');await denied(cmd('user-purge',{user_id:5}),422);await admin.query('UPDATE users SET deleted_at=NULL WHERE id=5');
  });
  await t.test('permanent purge removes every dependency, nulls shared pointers, retains other users and rolls back failures',async()=>{
   await admin.query(`INSERT INTO profiles(id,user_id,name,content,created_at,updated_at) VALUES(100,4,'Gone profile','content',now(),now()),(101,3,'Installed','copy',now(),now());UPDATE profiles SET origin_id=100 WHERE id=101;UPDATE users SET profile_id=100 WHERE id=4;
    INSERT INTO links(id,user_id,never_expires,created_at,updated_at,min_score) VALUES(100,4,true,now(),now(),0);UPDATE links SET forked_from_id=100,set_by_id=4 WHERE id=2;
    INSERT INTO past_links(id,user_id,link_id,set_by_id,created_at,updated_at) VALUES(100,4,100,3,now(),now());
    INSERT INTO nut_pledges(user_id,year,past_link_id,created_at,updated_at) VALUES(3,2026,100,now(),now());
    INSERT INTO friendships(id,sender_id,receiver_id,confirmed,created_at,updated_at) VALUES(100,4,3,true,now(),now());
    INSERT INTO leashes(friendship_id,master_id,pet_id,created_at,updated_at) VALUES(100,3,4,now(),now());
    INSERT INTO surrenders(user_id,controller_user_id,friendship_id,token,expires_at,created_at,updated_at) VALUES(4,3,100,'purge-test-token',now()+interval '1 hour',now(),now());
    INSERT INTO comments(user_id,link_id,content,created_at,updated_at) VALUES(3,100,'comment',now(),now());
    INSERT INTO nuttracker_orgasms(user_id,caused_by_user_id,rating,created_at,updated_at) VALUES(3,4,3,now(),now()),(4,3,3,now(),now());
    INSERT INTO user_icons(user_id,icon_name,created_at,updated_at) VALUES(4,'rocket',now(),now());
    INSERT INTO surveys(id,user_id,title,created_at,updated_at) VALUES(100,4,'Owned survey',now(),now()),(101,3,'Other survey',now(),now());
    INSERT INTO form_elements(id,survey_id,label,kind,sort_order,created_at,updated_at) VALUES(100,100,'Question',0,0,now(),now()),(101,101,'Other',0,0,now(),now());
    INSERT INTO survey_responses(id,survey_id,user_id,created_at,updated_at) VALUES(100,100,3,now(),now()),(101,101,4,now(),now());
    INSERT INTO survey_response_answers(form_element_id,survey_response_id,value,created_at,updated_at) VALUES(100,100,'One',now(),now()),(101,101,'Two',now(),now());
    INSERT INTO invite_codes(code,generated_by_id,redeemed_by_id,redeemed_at,created_at,updated_at) VALUES('PURGE-INVITE',4,4,now(),now(),now());`);
   await assert.rejects(cmd('user-purge',{user_id:4,request_key:'force-failure'}));assert.equal((await cmd('user',{user_id:4})).user.id,'4');assert.equal((await admin.query('SELECT count(*) FROM links WHERE id=100')).rows[0].count,'1');
   const input={actor_id:1,request_key:'purge-once',user_id:4};await manage('user-purge',input);assert.deepEqual(await manage('user-purge',input),{user_id:'4',purged:true});
   assert.equal((await admin.query('SELECT count(*) FROM users WHERE id=4')).rows[0].count,'0');assert.equal((await admin.query('SELECT count(*) FROM links WHERE id=100')).rows[0].count,'0');assert.equal((await admin.query('SELECT origin_id FROM profiles WHERE id=101')).rows[0].origin_id,null);
   assert.equal((await admin.query('SELECT past_link_id FROM nut_pledges WHERE user_id=3')).rows[0].past_link_id,null);assert.equal((await admin.query('SELECT generated_by_id FROM invite_codes WHERE code=\'PURGE-INVITE\'')).rows[0].generated_by_id,null);
   assert.equal((await admin.query('SELECT count(*) FROM surveys WHERE id=101')).rows[0].count,'1');assert.equal((await admin.query('SELECT count(*) FROM survey_response_answers')).rows[0].count,'0');assert.equal((await admin.query('SELECT count(*) FROM nuttracker_orgasms WHERE caused_by_user_id=4')).rows[0].count,'0');assert.equal(await count('users'),5);
  });
  await t.test('admin identity edits serialize with account signup and revoked admins cannot replay old writes',async()=>{
   const accounts=createAccounts({pool:admin,secretKeyBase:'test-secret',passwords:{hash:async()=> 'race-hash',verify:async()=>true}});
   const results=await Promise.allSettled([
    cmd('user-update',{user_id:2,attributes:{username:'IdentityRace'}}),
    accounts('signup',{request_key:'signup-race',username:'identityrace',email:'identityrace@example.test',password:'password',password_confirmation:'password'}),
   ]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   assert.equal((await admin.query("SELECT count(*) FROM users WHERE lower(username)='identityrace'")).rows[0].count,'1');
   const input={actor_id:1,request_key:'revoked-replay'};await manage('invite-create',input);
   await admin.query('UPDATE users SET admin=false WHERE id=1');await denied(manage('invite-create',input),403);await admin.query('UPDATE users SET admin=true WHERE id=1');
  });
  await t.test('staff browse is bounded and exposes every online link through pagination',async()=>{
   await admin.query(`INSERT INTO links(id,user_id,never_expires,min_score,last_ping,created_at,updated_at)
    SELECT n,3,true,0,now(),now(),now() FROM generate_series(1000,1204) n`);
   const a=await cmd('lizard-browse',{mascot:'ki',page:1}),b=await cmd('lizard-browse',{mascot:'ki',page:2});
   assert.equal(a.links.length,200);assert.equal(a.has_more,true);assert.equal(b.links.length,6);assert.equal(b.has_more,false);assert.equal(new Set([...a.links,...b.links].map(l=>l.id)).size,206);
   await denied(cmd('lizard-browse',{mascot:'ki',page:0}),422);
  });
 } finally {await pool?.end();await admin?.end();await bootstrap.end();}
});
