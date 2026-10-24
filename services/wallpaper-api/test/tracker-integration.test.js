import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createTracker} from '../src/tracker.js';
import {createReactionWriter} from '../src/reactions.js';
import {startEventDelivery} from '../src/internal.js';
import {setTimeout} from 'node:timers/promises';

test('tracker and pledges: real permissions, atomic writes, cooldown races and statistics', {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const bootstrap=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let admin,pool;
 try {
  await bootstrap.query('CREATE DATABASE node_tracker_test');
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/node_tracker_test';admin=new pg.Pool({connectionString:url.href,max:2});
  await admin.query(`
   CREATE TABLE users(id bigint PRIMARY KEY,username text,mascot text,admin boolean DEFAULT false,deleted_at timestamptz,updated_at timestamptz,email text,password_digest text,api_key text,password_reset_token text);
   CREATE TABLE friendships(id bigserial PRIMARY KEY,sender_id bigint,receiver_id bigint,confirmed boolean);
   CREATE TABLE surrenders(id bigserial PRIMARY KEY,user_id bigint,controller_user_id bigint,friendship_id bigint,pending boolean,accepted_consequences boolean,expires_at timestamptz,logged_in boolean);
   CREATE TABLE links(id bigint PRIMARY KEY,user_id bigint,set_by_id bigint,post_url text,response_type integer,response_text text,updated_at timestamptz);
   CREATE TABLE past_links(id bigserial PRIMARY KEY,user_id bigint,link_id bigint,set_by_id bigint,post_url text,post_thumbnail_url text,created_at timestamptz);
   CREATE TABLE site_settings(key text PRIMARY KEY,value text);
   CREATE TABLE nuttracker_orgasms(id bigserial PRIMARY KEY,user_id bigint NOT NULL REFERENCES users(id),caused_by_user_id bigint,rating integer,is_ruined boolean,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
   CREATE TABLE nut_pledges(id bigserial PRIMARY KEY,user_id bigint NOT NULL REFERENCES users(id),year integer NOT NULL,past_link_id bigint REFERENCES past_links(id),failed_on timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,year));
   CREATE TABLE notifications(id bigserial PRIMARY KEY,user_id bigint REFERENCES users(id),notification_type integer,text varchar(255),link text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE comments(id bigserial PRIMARY KEY,user_id bigint,link_id bigint,content text,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE node_reaction_events(id bigserial PRIMARY KEY,request_key varchar(160) UNIQUE,payload_digest varchar(64),link_id bigint,comment_ids bigint[],notification_id bigint,history_changed boolean,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE node_tracker_events(id bigserial PRIMARY KEY,request_key varchar(160) NOT NULL UNIQUE CHECK(request_key<>'force-failure'),payload_digest varchar(64),operation text,user_id bigint,result jsonb,effects jsonb,delivered_at timestamptz,delivery_attempts integer DEFAULT 0,available_at timestamptz DEFAULT now(),created_at timestamptz,updated_at timestamptz);
   INSERT INTO users(id,username,mascot) VALUES(1,'Alice','ki'),(2,'Bob','ki'),(3,'Carol','ki'),(4,'Deleted','ki'),(5,'PornLizardKi','ki'),(6,'gray','ki'),(7,'Dave','ki');
   UPDATE users SET deleted_at=now() WHERE id=4;
   INSERT INTO friendships(id,sender_id,receiver_id,confirmed) VALUES(1,1,2,true),(2,1,3,false),(3,1,4,true);
   INSERT INTO links VALUES(1,1,2,'https://example.test/current.jpg',NULL,NULL,now());
   INSERT INTO past_links(user_id,link_id,set_by_id,post_url,created_at) VALUES(1,1,2,'https://example.test/current.jpg',now()),(1,1,4,'deleted',now());
   INSERT INTO site_settings VALUES('nnn_enabled','true');
   CREATE ROLE node_tracker LOGIN PASSWORD 'test';`);
  const script=readFileSync(new URL('../../../scripts/provision-tracker.sh',import.meta.url),'utf8');
  for(const line of script.split('\n')) {
   const m=/^SELECT format\('(GRANT [^']+)', (.+)\) \\gexec$/.exec(line);if(!m)continue;
   let sql=m[1];for(const name of m[2].matchAll(/:'([^']+)'/g))sql=sql.replace('%I','"'+(name[1]==='database_name'?'node_tracker_test':'node_tracker')+'"');await admin.query(sql);
  }
  url.username='node_tracker';url.password='test';pool=new pg.Pool({connectionString:url.href,max:2});
  const manage=createTracker(pool),react=createReactionWriter(admin);
  const cmd=(op,input={})=>manage(op,{actor_id:1,request_key:randomUUID(),...input});
  const denied=(p,status)=>assert.rejects(p,e=>e.status===status);
  const scalar=async sql=>Number((await admin.query(sql)).rows[0].count);
  const reset=()=>admin.query('DELETE FROM nuttracker_orgasms');
  await t.test('role cannot read credentials, edit identities/relationships, delete pledges or acknowledge delivery',async()=>{
   for(const sql of ['SELECT email FROM users','SELECT password_digest FROM users','SELECT api_key FROM users','SELECT password_reset_token FROM users','UPDATE users SET admin=true','UPDATE friendships SET confirmed=true','DELETE FROM nut_pledges','UPDATE node_tracker_events SET delivered_at=now()'])await assert.rejects(pool.query(sql),{code:'42501'});
  });
  await t.test('suggestions contain the active mascot, confirmed friends and active recent setters',async()=>{
   const form=await cmd('form');assert.equal(form.pornlizard.username,'PornLizardKi');assert.deepEqual(form.friends.map(u=>u.username),['Bob']);assert.deepEqual(form.recent_setters.map(u=>u.username),['Bob']);
   await admin.query("UPDATE users SET mascot='warren' WHERE id=1");assert.equal((await cmd('form')).pornlizard,null);await admin.query("UPDATE users SET mascot='ki' WHERE id=1");
   await denied(manage('form'),403);await denied(cmd('form',{actor_id:4}),404);
  });
  let pledge;
  await t.test('pledges require an exact signature and owner; current year is server-owned and unique under concurrency',async()=>{
   await denied(cmd('pledge-create',{username:'Alice',signature:'alice'}),422);
   await denied(cmd('pledge-create',{username:'Bob',signature:'Bob'}),403);
   await denied(manage('pledge-create',{username:'Alice',signature:'Alice',request_key:'anonymous'}),403);
   const results=await Promise.all(Array.from({length:4},()=>cmd('pledge-create',{username:'Alice',signature:'Alice',year:1999,user_id:2})));
   pledge=results[0].pledge;assert.ok(results.every(r=>r.pledge.id===pledge.id));assert.equal(pledge.year,new Date().getUTCFullYear());assert.equal(await scalar('SELECT count(*) FROM nut_pledges'),1);
   const data=await manage('pledges',{username:'Alice'});assert.equal(data.current.id,pledge.id);assert.deepEqual(data.past_links,[]);
  });
  let entry;
  await t.test('entry, credit notification, pledge failure and delivery event commit once, including concurrent retries',async()=>{
   const input={actor_id:1,request_key:'entry-once',rating:'5',is_ruined:'1',caused_by:'Bob',user_id:2,year:1999};
   const [a,b]=await Promise.all([manage('entry-create',input),manage('entry-create',input)]);assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));entry=a.entry;
   assert.equal(entry.user_id,'1');assert.equal(entry.rating,5);assert.equal(entry.is_ruined,true);assert.equal(entry.caused_by_user_id,'2');
   assert.equal(await scalar('SELECT count(*) FROM nuttracker_orgasms'),1);assert.equal(await scalar('SELECT count(*) FROM notifications'),1);
   const n=(await admin.query('SELECT * FROM notifications')).rows[0];assert.equal(n.notification_type,6);assert.equal(n.text,'Alice attributed an orgasm to you!');assert.equal(n.link,'/users/Alice');
   const p=(await manage('pledges',{username:'Alice'})).current;assert.ok(p.failed_on);assert.equal(p.past_link_id,null);
   await denied(manage('entry-create',{...input,rating:2}),409);
   await denied(cmd('entry-create',{rating:3}),422);
  });
  await t.test('editing and deletion are owner-only and do not alter attribution, creation time or failed pledges',async()=>{
   await denied(cmd('entry-update',{actor_id:2,entry_id:entry.id,rating:1}),403);await denied(cmd('entry-delete',{actor_id:2,entry_id:entry.id}),403);
   await denied(cmd('entry',{actor_id:2,entry_id:entry.id,edit:true}),403);
   const edited=await cmd('entry-update',{entry_id:entry.id,rating:'2',is_ruined:'0',caused_by:'Carol',user_id:2,created_at:'2000-01-01'});
   assert.equal(edited.entry.rating,2);assert.equal(edited.entry.is_ruined,false);assert.equal(edited.entry.caused_by_user_id,'2');assert.equal(new Date(edited.entry.created_at).getTime(),new Date(entry.created_at).getTime());
   const before=(await manage('pledges',{username:'Alice'})).current.failed_on;
   await cmd('entry-delete',{entry_id:entry.id});await denied(manage('entry',{entry_id:entry.id}),404);assert.equal(await scalar('SELECT count(*) FROM nuttracker_orgasms'),0);
   assert.deepEqual((await manage('pledges',{username:'Alice'})).current.failed_on,before);
  });
  await t.test('ratings, booleans, unknown users and malformed IDs fail without side effects',async()=>{
   for(const rating of [undefined,'',0,6,1.5,'2oops',[],{},null])await denied(cmd('entry-create',{rating}),422);
   await denied(cmd('entry-create',{rating:3,is_ruined:'nonsense'}),422);await denied(cmd('entry-create',{rating:3,caused_by:'Deleted'}),404);await denied(cmd('entry-create',{rating:3,caused_by:'Missing'}),404);
   for(const entry_id of ['1oops','9223372036854775808',[],null])await denied(manage('entry',{entry_id}),404);
   await denied(manage('entry-create',{actor_id:1,rating:3}),422);await denied(manage('not-an-operation'),404);
   assert.equal(await scalar('SELECT count(*) FROM nuttracker_orgasms'),0);
  });
  await t.test('failed delivery-event insert rolls back entry, notification and pledge failure together',async()=>{
   await admin.query('UPDATE nut_pledges SET failed_on=NULL');const before=await scalar('SELECT count(*) FROM notifications');
   await assert.rejects(cmd('entry-create',{request_key:'force-failure',rating:4,caused_by:'Bob'}));
   assert.equal(await scalar('SELECT count(*) FROM nuttracker_orgasms'),0);assert.equal(await scalar('SELECT count(*) FROM notifications'),before);assert.equal((await manage('pledges',{username:'Alice'})).current.failed_on,null);
  });
  await t.test('manual entries and came reactions share one cooldown across concurrent submissions',async()=>{
   for(let i=0;i<5;i++) {
    await reset();await admin.query('UPDATE nut_pledges SET failed_on=NULL,past_link_id=NULL');
    const results=await Promise.allSettled([cmd('entry-create',{rating:4}),react({link_id:1,type:'came',text:'',owner_id:1,request_key:'tracker-race-'+i})]);
    assert.equal(results[1].status,'fulfilled');if(results[0].status==='rejected')assert.equal(results[0].reason.status,422);
    assert.equal(await scalar('SELECT count(*) FROM nuttracker_orgasms WHERE user_id=1'),1);assert.ok((await manage('pledges',{username:'Alice'})).current.failed_on);
   }
   await admin.query("UPDATE nuttracker_orgasms SET created_at=now()-interval '6 minutes'");await cmd('entry-create',{rating:3});assert.equal(await scalar('SELECT count(*) FROM nuttracker_orgasms'),2);
  });
  await t.test('two owners crediting each other cannot deadlock on notification foreign keys',async()=>{
   await reset();let arrivals=0,release;const bothLocked=new Promise(resolve=>{release=resolve;});
   const simultaneous=createTracker({connect:async()=>{
    const client=await pool.connect();return {release:()=>client.release(),query:async(sql,args)=>{
     const result=await client.query(sql,args);
     if(/SELECT .* FROM users WHERE id=\$1.* FOR (?:NO KEY )?UPDATE/.test(sql)) {if(++arrivals===2)release();await bothLocked;}
     return result;
    }};
   }});
   const results=await Promise.all([
    simultaneous('entry-create',{actor_id:1,request_key:randomUUID(),rating:3,caused_by:'Bob'}),
    simultaneous('entry-create',{actor_id:2,request_key:randomUUID(),rating:3,caused_by:'Alice'}),
   ]);
   assert.equal(results.length,2);assert.equal(await scalar('SELECT count(*) FROM nuttracker_orgasms'),2);
  });
  await t.test('manual failure is permanent, repeatable and owner-only; history preserves years and wallpaper previews',async()=>{
   await denied(cmd('pledge-fail',{actor_id:2,username:'Alice'}),403);
   const first=(await cmd('pledge-fail',{username:'Alice'})).pledge;const second=(await cmd('pledge-fail',{username:'Alice'})).pledge;assert.deepEqual(first.failed_on,second.failed_on);
   await admin.query("INSERT INTO nut_pledges(user_id,year,past_link_id,failed_on) VALUES(1,EXTRACT(YEAR FROM now())-1,1,now()-interval '1 year'),(1,EXTRACT(YEAR FROM now())-2,NULL,NULL)");
   const data=await manage('pledges',{username:'Alice'});assert.equal(data.pledges.length,3);assert.equal(data.pledges[0].id,pledge.id);assert.ok(data.past_links.some(p=>p.id==='1'));
   assert.equal((await cmd('pledge-fail',{actor_id:2,username:'Bob'})).pledge,null);
   await denied(manage('pledges',{username:'Missing'}),404);await denied(manage('pledges',{username:'Deleted'}),404);
  });
  await t.test('NNN gate blocks signing/failure and recording while disabled never fails a pledge',async()=>{
   for(const value of ['false','0','f','off','']) {
    await admin.query('UPDATE site_settings SET value=$1',[value]);assert.equal((await manage('pledge-status',{username:'Alice'})).nnn_enabled,false);
    await denied(manage('pledges',{username:'Alice'}),403);await denied(cmd('pledge-create',{username:'Alice',signature:'Alice'}),403);await denied(cmd('pledge-fail',{username:'Alice'}),403);
   }
   await reset();await admin.query('UPDATE nut_pledges SET failed_on=NULL');await cmd('entry-create',{rating:3});assert.equal(await scalar('SELECT count(*) FROM nut_pledges WHERE failed_on IS NOT NULL'),0);
   await admin.query("UPDATE site_settings SET value='true'");
  });
  await t.test('statistics zero-fill UTC days, include midnight boundaries, exclude old/future rows and count attribution',async()=>{
   await reset();
   await admin.query(`INSERT INTO nuttracker_orgasms(user_id,caused_by_user_id,rating,created_at,updated_at) VALUES
    (1,2,3,date_trunc('day',now())-interval '7 days',now()),
    (1,2,3,date_trunc('day',now())-interval '6 days',now()),
    (1,1,3,date_trunc('day',now())-interval '1 day',now()),
    (1,2,3,now()-interval '1 second',now()),(1,2,3,now()+interval '1 day',now()),
    (2,1,3,now(),now()),(4,1,3,now()-interval '9 days',now());`);
   const stats=await manage('statistics',{username:'Alice'});assert.equal(stats.days.length,8);assert.equal(stats.total,3);assert.equal(stats.days[0].count,0);assert.equal(stats.days[1].count,1);assert.equal(stats.days[6].count,1);assert.equal(stats.days[7].count,1);assert.equal(stats.caused,2);
   assert.equal((await manage('statistics',{username:'gray'})).caused,7);await denied(manage('statistics',{username:'Deleted'}),404);
  });
  await t.test('public history is ordered and bounded with pagination, including whole user histories',async()=>{
   await reset();await admin.query("INSERT INTO nuttracker_orgasms(user_id,rating,created_at,updated_at) SELECT 1,3,now()-n*interval '10 minutes',now() FROM generate_series(1,105) n");
   const page1=await manage('entries',{username:'Alice'}),page2=await manage('entries',{username:'Alice',page:2});assert.equal(page1.entries.length,100);assert.equal(page1.has_more,true);assert.equal(page2.entries.length,5);assert.equal(page2.has_more,false);assert.notEqual(page1.entries[99].id,page2.entries[0].id);
   for(const page of [0,-1,'2oops',[],100001])await denied(manage('entries',{page}),422);
   await denied(manage('entries',{username:'Deleted'}),404);
  });
  await t.test('active delegation needs a current proof and consent; expired/revoked/deleted controllers cannot mutate',async()=>{
   await reset();await admin.query("INSERT INTO surrenders(id,user_id,controller_user_id,friendship_id,pending,accepted_consequences,expires_at,logged_in) VALUES(1,1,2,1,false,true,now()+interval '1 hour',true)");
   await denied(cmd('entry-create',{rating:3}),403);await denied(cmd('entry-create',{rating:3,surrender_id:999}),403);
   await cmd('entry-create',{rating:3,surrender_id:1});await reset();
   for(const change of ["UPDATE surrenders SET logged_in=false","UPDATE surrenders SET logged_in=true,accepted_consequences=false","UPDATE surrenders SET accepted_consequences=true,expires_at=now()-interval '1 hour'","UPDATE surrenders SET expires_at=now()+interval '1 hour'; UPDATE friendships SET confirmed=false WHERE id=1","UPDATE friendships SET confirmed=true WHERE id=1; UPDATE users SET deleted_at=now() WHERE id=2"]) {
    await admin.query(change);await denied(cmd('entry-create',{rating:3,surrender_id:1}),403);
   }
   await admin.query('UPDATE users SET deleted_at=NULL WHERE id=2; DELETE FROM surrenders');
   assert.equal(await scalar('SELECT count(*) FROM nuttracker_orgasms'),0);
  });
  await t.test('tracker outbox worker uses the protected Rails adapter and backs off without acknowledging on its own',async()=>{
   await admin.query('UPDATE node_tracker_events SET delivered_at=now()');await cmd('entry-create',{rating:3,caused_by:'Bob'});
   const calls=[];const stop=startEventDelivery({pool,kind:'tracker',secretKeyBase:'test-secret',railsUrl:'http://web:3000',interval:5,logger:{warn(){}},fetchImpl:async(url,options)=>{calls.push([url,options]);return {ok:false,status:503,arrayBuffer:async()=>new ArrayBuffer(0)};}});
   try {for(let i=0;i<60&&!calls.length;i++)await setTimeout(5);} finally {await stop();}
   assert.equal(calls.length,1);assert.match(calls[0][0],/^http:\/\/web:3000\/_internal\/tracker-events\/\d+\.json$/);assert.equal(calls[0][1].method,'POST');assert.match(calls[0][1].headers.authorization,/^Bearer [a-f0-9]{64}$/);
   const pending=(await admin.query('SELECT * FROM node_tracker_events WHERE delivered_at IS NULL')).rows[0];assert.equal(pending.delivery_attempts,1);
  });
 } finally {await pool?.end();await admin?.end();await bootstrap.end();}
});
