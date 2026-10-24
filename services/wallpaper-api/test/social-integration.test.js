import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createSocial} from '../src/social.js';
import {createSocialStreamAuthorizer} from '../src/social-streams.js';

test('social transactions, permissions, concurrency and production grants', {skip:!process.env.TEST_DATABASE_URL}, async t=>{
 const bootstrap=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let admin,pool;
 try {
  await bootstrap.query('CREATE DATABASE node_social_test');
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/node_social_test';
  admin=new pg.Pool({connectionString:url.href,max:2});
  await admin.query(`CREATE EXTENSION pg_trgm;
   CREATE TABLE users(id bigserial PRIMARY KEY,username text,email text,password_digest text,api_key text,password_reset_token text,
    created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),details text,admin boolean DEFAULT false,set_count integer DEFAULT 0,
    viewing_link_id bigint,mascot text,pervert boolean,quarantined boolean,colour_preference integer,advanced boolean,profile_id bigint,flagged boolean,
    is_reporter boolean,is_cutie boolean,is_supporter boolean,username_changed_at timestamptz,deleted_at timestamptz,system_account boolean DEFAULT false);
   CREATE TABLE friendships(id bigserial PRIMARY KEY,sender_id bigint REFERENCES users(id),receiver_id bigint REFERENCES users(id),confirmed boolean,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE leashes(id bigserial PRIMARY KEY,friendship_id bigint REFERENCES friendships(id),master_id bigint REFERENCES users(id),pet_id bigint REFERENCES users(id),flair text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE surrenders(id bigserial PRIMARY KEY,user_id bigint REFERENCES users(id),controller_user_id bigint REFERENCES users(id),friendship_id bigint REFERENCES friendships(id),pending boolean DEFAULT false,accepted_consequences boolean DEFAULT false,logged_in boolean DEFAULT false,token text NOT NULL UNIQUE,duration_hours integer,expires_at timestamptz,current_page text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE message_threads(id bigserial PRIMARY KEY,name text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE message_thread_participants(id bigserial PRIMARY KEY,message_thread_id bigint,user_id bigint,notify boolean DEFAULT true,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE messages(id bigserial PRIMARY KEY,message_thread_id bigint,from_user_id bigint,content text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE links(id bigserial PRIMARY KEY,user_id bigint REFERENCES users(id),friends_only boolean DEFAULT false,never_expires boolean DEFAULT true,expires timestamptz,updated_at timestamptz);
   CREATE TABLE comments(id bigserial PRIMARY KEY,user_id bigint REFERENCES users(id),link_id bigint REFERENCES links(id),content text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE history_events(id bigserial PRIMARY KEY,user_id bigint REFERENCES users(id),link_id bigint REFERENCES links(id),did_what integer,surrender_controller_id bigint,ahoy_visit_id bigint,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE notifications(id bigserial PRIMARY KEY,user_id bigint REFERENCES users(id),notification_type integer,text text,link text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE scoops(id bigserial PRIMARY KEY,user_id bigint REFERENCES users(id),details text,was_shown boolean DEFAULT false,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE kinks(id bigserial PRIMARY KEY,name varchar(30) NOT NULL,works_on_e621 boolean DEFAULT false);
   CREATE TABLE kink_havers(id bigserial PRIMARY KEY,kink_id bigint REFERENCES kinks(id),user_id bigint REFERENCES users(id),is_starred boolean DEFAULT false,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE node_social_events(id bigserial PRIMARY KEY,request_key varchar(160) NOT NULL UNIQUE CHECK(request_key<>'force-failure'),payload_digest varchar(64),operation text,user_id bigint,result jsonb,effects jsonb,delivered_at timestamptz,delivery_attempts integer DEFAULT 0,available_at timestamptz DEFAULT now(),created_at timestamptz,updated_at timestamptz);
   INSERT INTO users(id,username) VALUES(1,'Alice'),(2,'Bob'),(3,'Carol'),(4,'Dave'),(5,'Deleted'),(6,'Admin');
   UPDATE users SET deleted_at=now() WHERE id=5; UPDATE users SET admin=true WHERE id=6;
   INSERT INTO links(id,user_id) VALUES(1,2),(2,3);UPDATE links SET friends_only=true WHERE id=2;
   CREATE ROLE node_social LOGIN PASSWORD 'test';`);
  const provision=readFileSync(new URL('../../../scripts/provision-social.sh',import.meta.url),'utf8');
  for(const line of provision.split('\n')) {
   const m=/^SELECT format\('(GRANT [^']+)', (.+)\) \\gexec$/.exec(line);if(!m)continue;
   let sql=m[1];for(const v of m[2].matchAll(/:'([^']+)'/g))sql=sql.replace('%I','"'+(v[1]==='database_name'?'node_social_test':'node_social')+'"');
   await admin.query(sql);
  }
  url.username='node_social';url.password='test';pool=new pg.Pool({connectionString:url.href,max:3});
  const manage=createSocial(pool),subscribe=createSocialStreamAuthorizer(pool);
  const cmd=(op,input={})=>manage(op,{actor_id:1,request_key:randomUUID(),...input});
  const denied=(promise,status)=>assert.rejects(promise,e=>e.status===status);
  const count=async table=>Number((await admin.query('SELECT count(*) FROM '+table)).rows[0].count);
  let f,ac,dm,group,member,leash;
  await t.test('role cannot read credentials, change roles, edit links or acknowledge delivery',async()=>{
   for(const sql of ['SELECT email FROM users','SELECT password_digest FROM users','SELECT api_key FROM users','SELECT password_reset_token FROM users','UPDATE users SET admin=true','UPDATE links SET user_id=1','UPDATE node_social_events SET delivered_at=now()'])await assert.rejects(pool.query(sql),e=>e.code==='42501');
  });
  await t.test('friend requests serialize both directions and acceptance is receiver-only, once',async()=>{
   const input={actor_id:1,username:'Bob',request_key:'friend-once'};
   const [a,b]=await Promise.all([manage('friend-request',input),manage('friend-request',input)]);assert.deepEqual(a,b);f=a.friendship_id;
   assert.equal(await count('friendships'),1);assert.equal(await count('notifications'),2);
   await denied(cmd('friend-request',{actor_id:2,username:'Alice'}),422);
   await denied(cmd('friend-accept',{friendship_id:f}),403);await denied(cmd('friend-accept',{actor_id:3,friendship_id:f}),403);
   await cmd('friend-accept',{actor_id:2,friendship_id:f});await cmd('friend-accept',{actor_id:2,friendship_id:f});assert.equal(await count('notifications'),3);
   await denied(manage('friend-request',{...input,username:'Carol'}),409);
   await denied(cmd('friend-request',{username:'Alice'}),422);await denied(cmd('friend-request',{username:'Deleted'}),404);
   ac=(await cmd('friend-request',{username:'Carol'})).friendship_id;await cmd('friend-accept',{actor_id:3,friendship_id:ac});
  });
  await t.test('only actual owner may change flair or release a leash; relationship immutable',async()=>{
   leash=(await cmd('leash-create',{friendship_id:f})).leash_id;
   await denied(cmd('leash-create',{friendship_id:ac}),422);
   await denied(cmd('leash-update',{leash_id:leash,flair:'bad'}),403);
   await denied(cmd('leash-delete',{actor_id:3,leash_id:leash}),403);
   await cmd('leash-update',{actor_id:2,leash_id:leash,flair:'hello',friendship_id:ac});
   assert.equal((await admin.query('SELECT friendship_id FROM leashes WHERE id=$1',[leash])).rows[0].friendship_id,f);
   const other=(await cmd('friend-request',{actor_id:2,username:'Dave'})).friendship_id;await cmd('friend-accept',{actor_id:4,friendship_id:other});
   await denied(cmd('leash-create',{actor_id:3,friendship_id:other}),403);
  });
  await t.test('DM resolution is for confirmed friends and does not reuse a group',async()=>{
   await denied(cmd('thread-resolve',{user_id:4}),403);
   group=(await cmd('thread-create')).thread_id;await cmd('thread-add',{thread_id:group,user_id:2});await cmd('thread-add',{thread_id:group,user_id:3});
   const [a,b]=await Promise.all([cmd('thread-resolve',{user_id:2}),cmd('thread-resolve',{actor_id:2,user_id:1})]);dm=a.thread_id;assert.equal(dm,b.thread_id);assert.notEqual(dm,group);
   await cmd('thread-add',{thread_id:group,user_id:3});assert.equal((await admin.query('SELECT count(*) FROM message_thread_participants WHERE message_thread_id=$1',[group])).rows[0].count,'3');
   await denied(cmd('thread-add',{thread_id:dm,user_id:4}),403);
  });
  await t.test('messages, alerts and outbox commit once; notify and cursor are thread-bound',async()=>{
   const data={actor_id:1,thread_id:dm,content:'Hi Bob',request_key:'send-once'};
   const a=await manage('message-send',data);await manage('message-send',data);assert.equal(await count('messages'),1);
   await denied(cmd('message-send',{thread_id:dm,actor_id:3,content:'stranger'}),404);
   await denied(cmd('message-send',{thread_id:dm,content:'  '}),422);
   const p=(await manage('thread',{actor_id:2,thread_id:dm})).participants.find(p=>String(p.user_id)==='2');member=p;
   await denied(cmd('thread-notify',{thread_id:group,participant_id:p.id,actor_id:2,notify:false}),403);
   await cmd('thread-notify',{thread_id:dm,participant_id:p.id,actor_id:2,notify:false});
   const before=await count('notifications');await cmd('message-send',{thread_id:dm,content:'Muted'});assert.equal(await count('notifications'),before);
   const other=await cmd('message-send',{thread_id:group,content:'Group'});
   await denied(manage('messages-before',{actor_id:1,thread_id:dm,after_id:other.message_id}),404);
   const older=await manage('messages-before',{actor_id:1,thread_id:dm,after_id:a.message_id});assert.deepEqual(older.messages,[]);
   const n=await count('messages');await assert.rejects(cmd('message-send',{thread_id:dm,content:'rollback',request_key:'force-failure'}));assert.equal(await count('messages'),n);
  });
  await t.test('private stream membership is checked and membership ID rotates on rejoin',async()=>{
   const stream=`social_thread_member_${member.id}_2`;assert.equal(await subscribe(stream,2),true);assert.equal(await subscribe(stream,1),false);
   assert.equal(await subscribe('header_notifications_2',1),false);assert.equal(await subscribe('header_notifications_2',2),true);
   await cmd('thread-remove',{thread_id:dm,user_id:2});assert.equal(await subscribe(stream,2),false);
   await denied(cmd('message-send',{actor_id:2,thread_id:dm,content:'removed'}),404);
   await cmd('thread-add',{thread_id:dm,user_id:2});assert.equal(await subscribe(stream,2),false);
  });
  await t.test('comments enforce link visibility, preserve history and owner notifications',async()=>{
   await denied(manage('comments',{link_id:2}),403);await denied(cmd('comment-create',{actor_id:4,link_id:2,content:'private'}),403);
   const result=await cmd('comment-create',{link_id:1,content:'Thanks',visit_id:null});assert.ok(result.comment_id);assert.equal(await count('history_events'),1);
   const history=(await admin.query('SELECT * FROM history_events')).rows[0];assert.equal(history.did_what,2);
   await admin.query("UPDATE links SET never_expires=false,expires=now()-interval '1 day' WHERE id=1");
   // Bob's owner is not Alice; other viewers cannot read an expired link.
   await denied(manage('comments',{link_id:1,actor_id:3}),403);assert.equal((await manage('comments',{link_id:1,actor_id:2})).comments.length,1);
   await admin.query('UPDATE links SET never_expires=true WHERE id=1');
  });
  await t.test('notification ownership and safe redirects; clearing queues the empty header',async()=>{
   const n=(await admin.query('SELECT * FROM notifications WHERE user_id=2 LIMIT 1')).rows[0];await denied(cmd('notification-read',{notification_id:n.id}),404);
   await admin.query("UPDATE notifications SET link='//outside.test' WHERE id=$1",[n.id]);assert.equal((await cmd('notification-read',{actor_id:2,notification_id:n.id})).link,'/');
   await cmd('notifications-clear',{actor_id:2});assert.deepEqual((await manage('notifications',{actor_id:2})).notifications,[]);
   const ev=(await admin.query("SELECT effects FROM node_social_events WHERE operation='notifications-clear' ORDER BY id DESC LIMIT 1")).rows[0];assert.deepEqual(ev.effects.notifications,['2']);
  });
  await t.test('scoops respect ownership, weekly cooldown and published immutability',async()=>{
   const scoop=(await cmd('scoop-create',{details:'News'})).scoop_id;await denied(cmd('scoop-create',{details:'Again'}),422);
   await denied(cmd('scoop-update',{actor_id:2,scoop_id:scoop,details:'Other'}),403);await denied(cmd('scoop-delete',{actor_id:2,scoop_id:scoop}),403);
   await cmd('scoop-update',{scoop_id:scoop,details:'Updated'});
   const claim=await manage('scoop-claim',{request_key:'scoop-job'});assert.equal(claim.scoop_id,scoop);assert.deepEqual(await manage('scoop-claim',{request_key:'scoop-job'}),claim);
   await denied(cmd('scoop-update',{scoop_id:scoop,details:'Late'}),422);await denied(cmd('scoop-delete',{scoop_id:scoop}),422);
  });
  await t.test('interest normalization, duplicates and maximum three stars under concurrent writes',async()=>{
   const k=(await cmd('kink-add',{name:'  Blue   skies! '})).kink_id;await cmd('kink-add',{name:'blue skies'});assert.equal(await count('kink_havers'),1);
   assert.equal((await manage('kinks',{username:'Alice'})).kinks[0].name,'blue_skies');
   const keys=[k];for(const name of ['a','b','c'])keys.push((await cmd('kink-add',{name})).kink_id);
   const results=await Promise.allSettled(keys.map(kink_id=>cmd('kink-star',{kink_id})));assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
   const publicList=await manage('community-interests',{query:'blue'});assert.equal(publicList.count,0);
   await cmd('kink-add',{actor_id:2,name:'blue skies'});assert.equal((await manage('community-interests',{query:'blue'})).count,1);
   const listing=await manage('community-links',{kink_id:k});assert.equal(listing.links.length,1);assert.equal(String(listing.links[0].id),'1');
   assert.equal((await manage('kink-status',{kink_id:k,works:true})).works,true);
   assert.equal((await manage('kink-status',{kink_id:k,works:false})).works,false);
   await denied(manage('kink-status',{kink_id:k,works:'true'}),422);
   await denied(manage('kink-status',{kink_id:'bad',works:true}),422);
   await denied(manage('community-interests',{mine:true}),403);
  });
  await t.test('delegation requires consent, a confirmed pair, expiry and a logged-in controller',async()=>{
   await denied(cmd('surrender-create',{friendship_id:f,duration:337,accepted:true}),422);
   await denied(cmd('surrender-create',{friendship_id:f,duration:24,accepted:false}),422);
   const row=(await cmd('surrender-create',{friendship_id:f,duration:24,accepted:true,pending:true})).surrender_id;
   await denied(cmd('surrender-assume',{actor_id:3,id:row}),403);
   await denied(cmd('message-send',{thread_id:dm,content:'forged',surrender_id:row}),403);
   await cmd('surrender-assume',{actor_id:2,id:row});
   await denied(cmd('message-send',{thread_id:dm,content:'owner locked out'}),403);
   await cmd('message-send',{thread_id:dm,content:'delegated',surrender_id:row});
   await cmd('surrender-page',{id:row,surrender_id:row,page:'/messages'});
   await cmd('surrender-return',{id:row,surrender_id:row});
   await denied(cmd('message-send',{thread_id:dm,content:'stale',surrender_id:row}),403);
   // The actual owner can revoke their surrender even while locked out.
   await cmd('surrender-delete',{id:row});
   const second=(await cmd('surrender-create',{friendship_id:f,duration:1,accepted:true,pending:true})).surrender_id;
   await admin.query("UPDATE surrenders SET expires_at=now()-interval '1 second' WHERE id=$1",[second]);
   await denied(cmd('surrender-assume',{actor_id:2,id:second}),403);await cmd('surrender-expire',{id:second});
  });
  await t.test('unfriending is participant-only and atomically revokes leashes and delegation',async()=>{
   await denied(cmd('friend-delete',{actor_id:3,friendship_id:f}),403);
   const s=(await cmd('surrender-create',{friendship_id:f,duration:24,accepted:true,pending:true})).surrender_id;
   await cmd('friend-delete',{actor_id:2,friendship_id:f});assert.equal(await count('leashes'),0);assert.equal(await count('surrenders'),0);
   await denied(cmd('surrender-assume',{actor_id:2,id:s}),404);
   assert.ok((await admin.query("SELECT effects FROM node_social_events WHERE operation='friend-delete'")).rows[0].effects.surrenders.length);
  });
 } finally {await pool?.end();await admin?.end();await bootstrap.end();}
});
