import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createActivity } from '../src/activity.js';
import { writeActivityRecord } from '../src/activity-common.js';
import { createWallpaperWriter } from '../src/updates.js';
import { createSocial } from '../src/social.js';
import { purgeUser } from '../src/moderation-purge.js';

pg.types.setTypeParser(1114,value=>new Date(value+'Z'));
test('activity storage, history, analytics and atomic domain activity with real schema and production grants',{skip:!process.env.TEST_DATABASE_URL},async t=>{
 const bootstrap=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});let admin,pool,writer,social,moderator;
 try {
  await bootstrap.query('CREATE DATABASE node_activity_test');
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/node_activity_test';admin=new pg.Pool({connectionString:url.href,max:2});
  for(const file of ['moderation-schema.sql','automation-schema.sql','activity-schema.sql'])await admin.query(readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8'));
  await admin.query(`CREATE ROLE node_activity LOGIN PASSWORD 'test';CREATE ROLE node_activity_writer LOGIN PASSWORD 'test';CREATE ROLE node_activity_social LOGIN PASSWORD 'test';CREATE ROLE node_activity_moderation LOGIN PASSWORD 'test';
   INSERT INTO users(id,username,email,password_digest,api_key,admin,created_at,updated_at) VALUES
    (1,'Alice','alice@example.test','private-hash','alicekey',false,now(),now()),(2,'Bob','bob@example.test','private-hash','bobkey',false,now(),now()),
    (3,'Admin','admin@example.test','private-hash','adminkey',true,now(),now()),(4,'Controller','control@example.test','private-hash','ctrlkey',false,now(),now()),
    (5,'Deleted','deleted@example.test','private-hash','gonekey',false,now(),now()),(6,'Third','third@example.test','private-hash','thirdkey',false,now(),now());
   UPDATE users SET deleted_at=now(),deleted_username='OldDeleted' WHERE id=5;
   INSERT INTO links(id,user_id,never_expires,friends_only,theme,blacklist,min_score,last_ping,terms,created_at,updated_at) VALUES
    (1,1,true,false,'','',0,now(),'Alice public',now(),now()),(2,2,true,true,'','',0,now(),'Bob private',now(),now()),
    (3,2,false,false,'','',0,now(),'Bob expired',now(),now()),(4,5,true,false,'','',0,now(),'Deleted owner',now(),now());
   UPDATE links SET expires=now()-interval '1 day' WHERE id=3;
   SELECT setval('links_id_seq',4);`);
  for(const name of ['provision-wallpaper-writer.sh','provision-social.sh','provision-activity.sh','provision-moderation.sh']) {
   const script=readFileSync(new URL('../../../scripts/'+name,import.meta.url),'utf8');
   for(const line of script.split('\n')) {
    const match=/^SELECT format\('(GRANT [^']+)', (.+?)\)(?: WHERE .+)? \\gexec$/.exec(line);if(!match)continue;
    let sql=match[1];const names={database_name:'node_activity_test',activity_user:'node_activity',writer_user:'node_activity_writer',social_user:'node_activity_social',moderation_user:'node_activity_moderation'};
    for(const value of match[2].matchAll(/:'([^']+)'/g)) {assert.ok(names[value[1]]);sql=sql.replace('%I','"'+names[value[1]]+'"');}
    await admin.query(sql);
   }
  }
  const rolePool=name=>{url.username=name;url.password='test';return new pg.Pool({connectionString:url.href,max:2});};
  pool=rolePool('node_activity');writer=rolePool('node_activity_writer');social=rolePool('node_activity_social');moderator=rolePool('node_activity_moderation');
  const manage=createActivity({pool,store:{onlineIds:async()=>['2']},redis:{ping:async()=>true,info:async()=>'used_memory:1234\r\nused_memory_peak:2345\r\n'}});
  const cmd=(op,input={})=>manage(op,{request_key:randomUUID(),...input});
  const count=async table=>Number((await admin.query('SELECT count(*) FROM '+table)).rows[0].count);
  const visitData={visit_token:randomUUID(),visitor_token:randomUUID(),ip:'198.51.100.84',user_agent:'Browser',browser:'Firefox',os:'Linux',device_type:'Desktop',started_at:new Date(Date.now()-3600000).toISOString(),landing_page:'https://example.test/?api_key=private&x=ok',referrer:'https://example.test/?token=private'};
  let document,proof;
  await t.test('activity role cannot read credentials, mutate accounts, edit prior history, delete data or acknowledge events',async()=>{
   for(const sql of ['SELECT email FROM users','SELECT password_digest FROM users','SELECT api_key FROM users','UPDATE users SET admin=true','UPDATE users SET username=\'Changed\'','UPDATE history_events SET did_what=2','DELETE FROM ahoy_events','DELETE FROM node_activity_receipts','UPDATE links SET blacklist=\'bad\'','UPDATE node_automation_events SET delivered_at=now()','SELECT properties FROM ahoy_events'])await assert.rejects(pool.query(sql),{code:'42501'});
  });
  await t.test('concurrent visit creation is idempotent, preserves metadata and rejects mismatched visitor proof',async()=>{
   const [a,b]=await Promise.all([cmd('visit-create',{data:visitData}),cmd('visit-create',{data:visitData})]);assert.equal(a.visit.id,b.visit.id);document=a;
   proof={id:a.visit.id,visit_token:visitData.visit_token,visitor_token:visitData.visitor_token};
   assert.equal(await count('ahoy_visits'),1);assert.ok(!a.visit.landing_page.includes('private'));assert.equal(a.visit.browser,'Firefox');
   await assert.rejects(cmd('visit-create',{data:{...visitData,visitor_token:'wrong'}}),{status:403});
   assert.equal((await cmd('visit',{visit_token:proof.visit_token,visitor_token:'wrong'})).visit,null);
   assert.equal((await cmd('visit',{...proof})).visit.ip,visitData.ip);
  });
  await t.test('authentication binds only an anonymous visit; account switches retain first attribution and events use current user',async()=>{
   const a=await cmd('visit-authenticate',{...proof,user_id:1});assert.equal(a.visit.user_id,'1');
   const b=await cmd('visit-authenticate',{...proof,user_id:2});assert.equal(b.visit.user_id,'1');
   await assert.rejects(cmd('visit-authenticate',{...proof,user_id:5}),{status:403});
   await cmd('event-create',{...proof,user_id:2,name:'regular:logged_in',properties:{account:'Bob'},time:new Date().toISOString()});
   assert.equal((await admin.query('SELECT user_id FROM ahoy_events ORDER BY id DESC LIMIT 1')).rows[0].user_id,'2');
  });
  await t.test('events redact secrets, clamp early timestamps, commit receipts atomically and deduplicate concurrent retries',async()=>{
   const input={...proof,user_id:1,name:'regular:update_link_post',time:new Date(Date.now()-7200000).toISOString(),properties:{attempted_post_id:321,password:'private',_url:'https://example.test/?api_key=private'},request_key:'same-event'};
   const [a,b]=await Promise.all([manage('event-create',input),manage('event-create',input)]);assert.deepEqual(a,b);
   const event=(await admin.query('SELECT * FROM ahoy_events WHERE id=$1',[a.event_id])).rows[0];assert.equal(event.time.toISOString(),new Date(visitData.started_at).toISOString());assert.ok(!event.properties.includes('private'));assert.equal(JSON.parse(event.properties).attempted_post_id,321);
   await assert.rejects(manage('event-create',{...input,name:'changed'}),{status:409});
   await assert.rejects(cmd('event-create',{...input,request_key:'bad-proof',visitor_token:'wrong'}),{status:404});
   await admin.query("ALTER TABLE node_activity_receipts ADD CONSTRAINT test_receipt_failure CHECK(request_key<>'receipt-failure')");
   const before=await count('ahoy_events');await assert.rejects(manage('event-create',{...input,request_key:'receipt-failure'}));assert.equal(await count('ahoy_events'),before);await admin.query('ALTER TABLE node_activity_receipts DROP CONSTRAINT test_receipt_failure');
  });
  await t.test('current IP bans cannot be bypassed using an old visit, unknown cookies or malformed cookies',async()=>{
   await admin.query("INSERT INTO banned_ips(ip_address,created_at,updated_at) VALUES('198.51.100.85',now(),now())");
   assert.equal((await cmd('visit',{...proof,ip:'198.51.100.85'})).ban.ip_address,'198.51.100.85');
   const missing=await cmd('visit',{visit_token:randomUUID(),visitor_token:randomUUID(),ip:'198.51.100.85'});assert.equal(missing.visit,null);assert.ok(missing.ban);
   assert.ok((await cmd('visit',{visit_token:'bad cookie!',visitor_token:'bad!',ip:'198.51.100.85'})).ban);
  });
  await t.test('personal history writes enforce access and visit proof, deduplicate and never trust supplied user/controller IDs',async()=>{
   const input={actor_id:1,kind:'looked_at',link_id:1,visit:proof,request_key:'history-once',surrender_controller_id:4};
   const [a,b]=await Promise.all([manage('record',input),manage('record',input)]);assert.deepEqual(a,b);
   assert.equal((await admin.query('SELECT surrender_controller_id FROM history_events WHERE id=$1',[a.history_event_id])).rows[0].surrender_controller_id,null);
   await assert.rejects(cmd('record',{...input,request_key:'badvisit',visit:{...proof,visitor_token:'wrong'}}),{status:403});
   for(const link_id of [2,3,4])await assert.rejects(cmd('record',{actor_id:1,kind:'looked_at',link_id,visit:proof}),{status:404});
   for(const actor_id of [null,5,'bad'])await assert.rejects(cmd('history',{actor_id}),{status:403});
   assert.equal((await cmd('history',{actor_id:2,user_id:1})).events.length,0);
   await cmd('record',{actor_id:1,kind:'looked_at',link_id:1});assert.equal((await cmd('history',{actor_id:1})).events.length,2);
  });
  await t.test('delegated attribution derives from active consent and invalid/stale sessions cannot view or write history',async()=>{
   await admin.query(`INSERT INTO friendships(id,sender_id,receiver_id,confirmed,created_at,updated_at) VALUES(400,1,4,true,now(),now());
    INSERT INTO surrenders(id,user_id,controller_user_id,friendship_id,pending,accepted_consequences,logged_in,expires_at,created_at,updated_at,token) VALUES(400,1,4,400,false,true,true,now()+interval '1 hour',now(),now(),'activity-token')`);
   await assert.rejects(cmd('history',{actor_id:1}),{status:403});await assert.rejects(cmd('history',{actor_id:1,surrender_id:401}),{status:403});
   const r=await cmd('record',{actor_id:1,surrender_id:400,kind:'looked_at',link_id:1,visit:proof,surrender_controller_id:2});
   assert.equal((await admin.query('SELECT surrender_controller_id FROM history_events WHERE id=$1',[r.history_event_id])).rows[0].surrender_controller_id,'4');
   assert.ok((await cmd('history',{actor_id:1,surrender_id:400})).users.some(u=>u.id==='4'));
   await admin.query('UPDATE surrenders SET logged_in=false WHERE id=400');await assert.rejects(cmd('history',{actor_id:1,surrender_id:400}),{status:403});
   await admin.query('DELETE FROM surrenders WHERE id=400;DELETE FROM friendships WHERE id=400');
   await assert.rejects(cmd('history',{actor_id:1,surrender_id:400}),{status:403});
  });
  await t.test('history selects the newest 170, retains visitless events, supplies card graphs and hides newly private/expired/deleted links',async()=>{
   await admin.query(`INSERT INTO history_events(user_id,link_id,did_what,created_at,updated_at) SELECT 1,1,0,now(),now() FROM generate_series(1,175);
    INSERT INTO history_events(user_id,link_id,did_what,created_at,updated_at) VALUES(1,2,0,now(),now()),(1,3,0,now(),now()),(1,4,0,now(),now());
    INSERT INTO history_events(user_id,link_id,did_what,ahoy_visit_id,created_at,updated_at) VALUES(1,1,0,${proof.id},now(),now());`);
   let data=await cmd('history',{actor_id:1});assert.equal(data.events.length,170);assert.deepEqual(data.links.map(l=>l.id),['1']);assert.ok(data.events.some(e=>e.ahoy_visit_id===null));
   assert.deepEqual(Object.keys(data.visits[0]).sort(),['id','started_at']);assert.ok(!JSON.stringify(data).includes('private-hash'));assert.ok(!JSON.stringify(data).includes('alice@example.test'));assert.ok(!JSON.stringify(data).includes(proof.visit_token));
   assert.ok(data.events.every((e,i)=>i===0 || BigInt(e.id)<BigInt(data.events[i-1].id)));
   await admin.query('INSERT INTO friendships(id,sender_id,receiver_id,confirmed,created_at,updated_at) VALUES(401,1,2,true,now(),now())');
   data=await cmd('history',{actor_id:1});assert.ok(data.links.some(l=>l.id==='2'));assert.ok(!data.links.some(l=>l.id==='3'));
   await admin.query("INSERT INTO leashes(friendship_id,master_id,pet_id,created_at,updated_at) VALUES(401,1,2,now(),now())");
   assert.ok((await cmd('history',{actor_id:1})).links.some(l=>l.id==='3'));
   await admin.query('DELETE FROM leashes WHERE friendship_id=401;DELETE FROM friendships WHERE id=401');
  });
  const write=createWallpaperWriter(writer,{activity:true,recordActivity:writeActivityRecord});
  const wallpaper=key=>({request_key:key,link_id:'1',post_id:'321',set_by_id:'1',post_url:'https://static1.e621.net/data/test.jpg',post_thumbnail_url:null,post_description:'Test',tags:'forest rating:e',count_self:false,
   expected_policy:{user_id:'1',blacklist:'',theme:'',min_score:0,friends_only:false,never_expires:true,expires:null},activity:{actor_id:'1',visit:proof}});
  await t.test('successful wallpaper activity commits once with wallpaper/history/outbox and failures roll everything back',async()=>{
   const before=await count('history_events');const input=wallpaper('wallpaper-history');const [a,b]=await Promise.all([write(input),write(input)]);assert.equal(a.event_id,b.event_id);assert.equal(await count('history_events'),before+1);
   const row=(await admin.query('SELECT * FROM history_events ORDER BY id DESC LIMIT 1')).rows[0];assert.equal(row.did_what,1);assert.equal(row.ahoy_visit_id,proof.id);
   await assert.rejects(write({...wallpaper('forged-setter'),activity:{actor_id:'2',visit:proof}}),{status:403});
   await assert.rejects(write({...wallpaper('bad-wallpaper-proof'),activity:{actor_id:'1',visit:{...proof,visitor_token:'wrong'}}}),{status:403});assert.equal(await count('history_events'),before+1);
   await admin.query("ALTER TABLE node_wallpaper_events ADD CONSTRAINT test_outbox_failure CHECK(request_key<>'outbox-fail')");
   const past=await count('past_links');await assert.rejects(write({...wallpaper('outbox-fail'),post_id:'322'}));assert.equal(await count('history_events'),before+1);assert.equal(await count('past_links'),past);await admin.query('ALTER TABLE node_wallpaper_events DROP CONSTRAINT test_outbox_failure');
  });
  await t.test('comments use shared activity persistence and forged visits roll back the comment',async()=>{
   const socialCommand=createSocial(social,{activity:true});
   const before=await count('history_events'),input={actor_id:1,request_key:'activity-comment',link_id:1,content:'Thanks',activity_visit:proof};
   const [a,b]=await Promise.all([socialCommand('comment-create',input),socialCommand('comment-create',input)]);assert.equal(a.comment_id,b.comment_id);assert.equal(await count('history_events'),before+1);
   const comments=await count('comments');await assert.rejects(socialCommand('comment-create',{...input,request_key:'forged-comment',activity_visit:{...proof,visitor_token:'wrong'}}),{status:403});assert.equal(await count('comments'),comments);assert.equal(await count('history_events'),before+1);
  });
  await t.test('analytics requires current admin authority, keeps UTC chart bounds, reads Node queue and includes stored visits',async()=>{
   for(const op of ['system','activity'])for(const input of [{},{actor_id:1},{actor_id:5},{actor_id:3,surrender_id:400}])await assert.rejects(cmd(op,input),{status:403});
   const metrics=await cmd('system',{actor_id:3});assert.equal(metrics.database.healthy,true);assert.equal(metrics.redis.healthy,true);assert.equal(metrics.queue.backend,'Node');assert.equal(metrics.queue.ready,0);
   const activity=await cmd('activity',{actor_id:3});assert.equal(activity.hours.length,25);assert.equal(activity.activity.visits_last_day,1);assert.equal(activity.activity.wallpapers_total,1);assert.equal(activity.activity.online_links,3);
   assert.ok(activity.hours.every(r=>/Z$/.test(r.hour)));
  });
  await t.test('permanent account purge also removes activity command receipts without touching other users',async()=>{
   await cmd('record',{actor_id:6,kind:'looked_at',link_id:1});assert.equal(Number((await admin.query('SELECT count(*) FROM node_activity_receipts WHERE user_id=6')).rows[0].count),1);
   await admin.query('UPDATE users SET deleted_at=now() WHERE id=6');const c=await moderator.connect();
   try{await c.query('BEGIN');await purgeUser(c,'6',{usernames:[],surrenders:[],deleted_links:[]});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   assert.equal(Number((await admin.query('SELECT count(*) FROM node_activity_receipts WHERE user_id=6')).rows[0].count),0);assert.equal((await admin.query('SELECT count(*) FROM users WHERE id=1')).rows[0].count,'1');
  });
 }finally{await pool?.end();await writer?.end();await social?.end();await moderator?.end();await admin?.end();await bootstrap.end();}
});
