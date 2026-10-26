import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createAutomation,BOTS } from '../src/automation.js';
import { createAutomationQueue,enqueueAutomation } from '../src/automation-queue.js';
import { enqueueWallpaperAutomation,verifyAutomationSelection,automationLink,wallpaperPolicy } from '../src/automation-wallpaper.js';
import { createWallpaperWriter } from '../src/updates.js';
import { createLegacyAutomationImporter } from '../src/automation-legacy.js';
import { createNewsroom } from '../src/newsroom.js';
import {changeBot} from '../src/bot-settings.js';

pg.types.setTypeParser(1114,value=>new Date(value+'Z'));
const post={id:321,file:{url:'https://static1.e621.net/data/aa/test.jpg',ext:'jpg'},sample:{url:'https://static1.e621.net/data/thumb.jpg'},preview:{url:null},description:'A wallpaper',tags:{general:['forest'],species:['canine']},rating:'e'};

test('persistent automation with production grants, races, restart recovery, forks and newsroom timing',{skip:!process.env.TEST_DATABASE_URL},async t=>{
 const bootstrap=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});let admin,pool,writer;
 try {
  await bootstrap.query('CREATE DATABASE node_automation_test');
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/node_automation_test';
  admin=new pg.Pool({connectionString:url.href,max:2});
  await admin.query(readFileSync(new URL('./fixtures/moderation-schema.sql',import.meta.url),'utf8'));
  await admin.query(readFileSync(new URL('./fixtures/automation-schema.sql',import.meta.url),'utf8'));
  await admin.query(readFileSync(new URL('../../../db/migrations/20261026050000_add_bot_controls.sql',import.meta.url),'utf8'));
  await admin.query(`CREATE ROLE node_automation LOGIN PASSWORD 'test';CREATE ROLE node_automation_writer LOGIN PASSWORD 'test';
    INSERT INTO users(id,username,email,password_digest,api_key,mascot,system_account,created_at,updated_at) VALUES
      (1,'Alice','private@example.test','private-hash','privkey','ki',false,now(),now()),
      (2,'PornLizardKi','bot@example.test','bot-hash','bot-key','ki',true,now(),now()),
      (3,'PornBot','other@example.test','other-hash','otherkey','taylor',true,now(),now()),
      (4,'Deleted','gone@example.test','gone-hash','gone-key','ki',false,now(),now());
    UPDATE users SET deleted_at=now() WHERE id=4;
    INSERT INTO links(id,user_id,never_expires,friends_only,min_score,blacklist,theme,last_ping,created_at,updated_at) SELECT n,CASE WHEN n=5 THEN 4 ELSE 1 END,true,false,0,'','',now(),now(),now() FROM generate_series(1,8)n;
    SELECT setval('links_id_seq',8);`);
  for(const name of ['provision-wallpaper-writer.sh','provision-automation.sh']) {
   const script=readFileSync(new URL('../../../scripts/'+name,import.meta.url),'utf8');
   for(const line of script.split('\n')) {
    const match=/^SELECT format\('(GRANT [^']+)', (.+)\) \\gexec$/.exec(line);if(!match)continue;
    let sql=match[1];for(const value of match[2].matchAll(/:'([^']+)'/g)) {
     const role=value[1]==='database_name' ? 'node_automation_test' : value[1]==='automation_user' ? 'node_automation' : 'node_automation_writer';
     sql=sql.replace('%I','"'+role+'"');
    }
    await admin.query(sql);
   }
  }
  url.username='node_automation';url.password='test';pool=new pg.Pool({connectionString:url.href,max:2});
  url.username='node_automation_writer';writer=new pg.Pool({connectionString:url.href,max:2});
  let searches=[],selects=[],liveIds=[],selectHook;
  const e621={search:async input=>{searches.push(input);await selectHook?.();return [post];},select:async input=>{selects.push(input);await selectHook?.();return post;}};
  const writeWallpaper=createWallpaperWriter(writer,{automation:true,verifySelection:verifyAutomationSelection,enqueueAutomation:enqueueWallpaperAutomation});
  const newsroom=createNewsroom(pool,{random:()=>0,speech:()=> 'Alice chose a wallpaper.'});
  const automation=createAutomation({pool,store:{onlineIds:async()=>liveIds},e621,writeWallpaper,newsroom});
  const reset=async()=>{
   await admin.query(`DELETE FROM node_automation_events;DELETE FROM node_automation_jobs;DELETE FROM node_automation_schedules;
    UPDATE node_bot_settings SET enabled=true,normal_tags=NULL,perverted_tags=NULL,interval_seconds=NULL,cooldown_seconds=NULL,round_limit=NULL,revision=1;
    DELETE FROM node_wallpaper_events;DELETE FROM scoops;DELETE FROM past_links;DELETE FROM link_abilities;DELETE FROM kink_havers;
    UPDATE links SET forked_from_id=NULL,last_ping=now(),last_ping_user_agent='Test',blacklist='',theme='',e621_post_id=NULL,post_url=NULL;
    UPDATE users SET mascot='ki',pervert=false,set_count=0;UPDATE users SET system_account=true WHERE id IN (2,3);
    UPDATE node_newsroom_states SET generation=0,kind=NULL,entry='{}',story='{}',busy_until=NULL,throttle_until=NULL,rendered_event_id=NULL WHERE id=1;`);
   searches=[];selects=[];liveIds=[];selectHook=undefined;
  };
  const configure=async(op,attributes={},bot='ki')=>{
   const c=await admin.connect();
   try{await c.query('BEGIN');const revision=(await c.query('SELECT revision FROM node_bot_settings WHERE name=$1',[bot])).rows[0].revision;
    const result=await changeBot(c,op,{bot,revision,attributes});await c.query('COMMIT');return result;
   }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  };
  const custom={normal_tags:'forest rating:e',perverted_tags:'latex rating:e',interval_seconds:180,cooldown_seconds:0,round_limit:1};
  const next=async()=>{const job=await automation.queue.claim();assert.ok(job);const result=await automation.run(job);if(result?.deferUntil)await automation.queue.defer(job,result.deferUntil);else await automation.queue.complete(job);return job;};
  const runKind=async(kind,bot=null)=>{
   await admin.query("UPDATE node_automation_jobs SET run_at=now()+interval '1 day' WHERE status='queued'");
   await admin.query("UPDATE node_automation_jobs SET run_at=now() WHERE id=(SELECT id FROM node_automation_jobs WHERE kind=$1 AND ($2::text IS NULL OR payload->>'bot'=$2) AND status='queued' ORDER BY id LIMIT 1)",[kind,bot]);
   return next();
  };
  const apply=async(linkId=1,key='root')=>{
   const row=await automationLink(pool,String(linkId));
   return writeWallpaper({request_key:key,link_id:String(linkId),post_id:post.id,set_by_id:'1',post_url:post.file.url,post_thumbnail_url:post.sample.url,post_description:'Test',tags:'forest rating:e',count_self:false,expected_policy:wallpaperPolicy(row)});
  };
  await t.test('worker role cannot read credentials, edit users/wallpapers, or acknowledge Rails rendering',async()=>{
   for(const sql of ['SELECT password_digest FROM users','SELECT api_key FROM users','SELECT email FROM users','UPDATE users SET admin=true','UPDATE links SET post_url=\'https://bad.test\'','UPDATE node_automation_events SET delivered_at=now()','UPDATE node_newsroom_states SET rendered_event_id=1'])await assert.rejects(pool.query(sql),{code:'42501'});
  });
  await t.test('worker and wallpaper writer can read bot settings but cannot change them',async()=>{
   for(const role of [pool,writer]){
    assert.equal((await role.query('SELECT count(*) FROM node_bot_settings')).rows[0].count,'4');
    await assert.rejects(role.query('UPDATE node_bot_settings SET enabled=false'),{code:'42501'});
   }
  });
  await t.test('custom tags, intervals, batch sizes and worker heartbeats survive a new automation instance',async()=>{
   for(const pervert of [false,true]){
    await reset();await configure('bot-update',custom);
    await admin.query("INSERT INTO link_abilities(link_id,ability,created_at,updated_at) SELECT id,'can_be_set_by_lizard',now(),now() FROM links WHERE id IN(1,2)");
    await admin.query('UPDATE users SET pervert=$1 WHERE id=1',[pervert]);
    const fresh=createAutomation({pool,store:{onlineIds:async()=>[]},e621,writeWallpaper,newsroom});
    await fresh.request('round',{bot:'ki',request_key:'custom-round'});await next();
    assert.equal((await admin.query("SELECT count(*) FROM node_automation_jobs WHERE kind='bot-link'")).rows[0].count,'1');
    await runKind('bot-link');assert.equal(searches.length,1);assert.equal(searches[0].tags,'order:random '+(pervert?custom.perverted_tags:custom.normal_tags)+' -nightmare_fuel');
    await admin.query("UPDATE node_automation_schedules SET next_run_at=now()-interval '1 second' WHERE name='ki'");await fresh.schedule();
    const schedule=(await admin.query("SELECT extract(epoch FROM next_run_at-now()) AS wait,last_checked_at FROM node_automation_schedules WHERE name='ki'")).rows[0];
    assert.ok(Number(schedule.wait)>175&&Number(schedule.wait)<=180);assert.ok(schedule.last_checked_at);
   }
  });
  await t.test('configured cooldown prevents selecting a recently changed link',async()=>{
   await reset();await configure('bot-update',{...custom,cooldown_seconds:60});
   await admin.query("INSERT INTO link_abilities(link_id,ability,created_at,updated_at) VALUES(1,'can_be_set_by_lizard',now(),now()); INSERT INTO past_links(link_id,user_id,post_url,created_at,updated_at) VALUES(1,1,'https://example.test/recent.jpg',now()-interval '30 seconds',now())");
   await automation.request('round',{bot:'ki',request_key:'cooldown'});await next();
   assert.equal((await admin.query("SELECT count(*) FROM node_automation_jobs WHERE kind='bot-link'")).rows[0].count,'0');
  });
  await t.test('stopping skips queued rounds and selections; restarting invalidates old work and schedules a new check',async()=>{
   for(const selected of [false,true]){
    await reset();await admin.query("INSERT INTO link_abilities(link_id,ability,created_at,updated_at) VALUES(1,'can_be_set_by_lizard',now(),now())");
    await automation.request('round',{bot:'ki',request_key:'before-stop'});if(selected)await next();
    await configure('bot-stop');await assert.rejects(automation.request('round',{bot:'ki',request_key:'stopped'}),{status:422});
    await next();assert.equal(searches.length,0);assert.equal((await admin.query('SELECT count(*) FROM past_links')).rows[0].count,'0');
    await automation.schedule();assert.equal((await admin.query("SELECT count(*) FROM node_automation_jobs WHERE kind='bot-round' AND payload->>'bot'='ki' AND status='queued'")).rows[0].count,'0');
    await configure('bot-start');await automation.schedule();await runKind('bot-round','ki');await runKind('bot-link');
    assert.equal(searches.length,1);assert.equal((await admin.query('SELECT count(*) FROM past_links')).rows[0].count,'1');
   }
  });
  await t.test('a stop or settings edit during the e621 request prevents the wallpaper transaction from committing',async()=>{
   for(const operation of ['bot-stop','bot-update']){
    await reset();await admin.query("INSERT INTO link_abilities(link_id,ability,created_at,updated_at) VALUES(1,'can_be_set_by_lizard',now(),now())");
    await automation.request('round',{bot:'ki',request_key:'in-flight'});await next();
    selectHook=()=>configure(operation,custom);await runKind('bot-link');
    assert.equal(searches.length,1);assert.equal((await admin.query('SELECT count(*) FROM past_links')).rows[0].count,'0');
   }
  });
  await t.test('schedules serialize across instances and skip missed rounds after downtime',async()=>{
   await reset();await Promise.all([automation.schedule(),automation.schedule()]);
   assert.equal((await admin.query('SELECT count(*) FROM node_automation_jobs')).rows[0].count,'5');
   await admin.query("UPDATE node_automation_schedules SET next_run_at=now()-interval '2 days'");await automation.schedule();
   assert.equal((await admin.query('SELECT count(*) FROM node_automation_jobs')).rows[0].count,'10');
   assert.equal((await admin.query('SELECT count(*) FROM node_automation_schedules WHERE next_run_at<now()')).rows[0].count,'0');
  });
  await t.test('queue claims are exclusive; leases survive restarts; retries are bounded and redact errors',async()=>{
   await reset();await enqueueAutomation(pool,{key:'lease',kind:'test'});
   const second=createAutomationQueue(pool,{maxAttempts:2});
   const claims=await Promise.all([second.claim(),second.claim()]);assert.equal(claims.filter(Boolean).length,1);
   const first=claims.find(Boolean);await admin.query("UPDATE node_automation_jobs SET locked_at=now()-interval '2 minutes'");
   const recovered=await second.claim();assert.equal(recovered.id,first.id);assert.notEqual(recovered.locked_by,first.locked_by);
   await second.complete(first);assert.equal((await admin.query('SELECT status FROM node_automation_jobs')).rows[0].status,'running');
   await second.retry(recovered,new Error('PRIVATE EMAIL AND TOKEN'));const row=(await admin.query('SELECT * FROM node_automation_jobs')).rows[0];assert.equal(row.status,'failed');assert.equal(row.last_error,'Error');
   await assert.rejects(enqueueAutomation(pool,{key:'lease',kind:'different'}),{status:409});
  });
  await t.test('bot rounds enforce opt-in, active owners, online status, mascot and cooldown; native policy includes kinks',async()=>{
   await reset();await admin.query(`INSERT INTO link_abilities(link_id,ability,created_at,updated_at) SELECT id,'can_be_set_by_lizard',now(),now() FROM links WHERE id IN (1,2,3,4,5,6);
    UPDATE links SET last_ping=now()-interval '2 hours' WHERE id IN(2,4);UPDATE links SET last_ping_user_agent='widgetExtension',last_ping=now()-interval '5 minutes' WHERE id=3;
    INSERT INTO past_links(link_id,user_id,post_url,created_at,updated_at) VALUES(6,1,'https://example.test/recent.jpg',now(),now());
    INSERT INTO link_abilities(link_id,ability,created_at,updated_at) VALUES(1,'is_kink_aligned',now(),now());
    INSERT INTO kinks(id,name) VALUES(800,'forest');INSERT INTO kink_havers(user_id,kink_id,created_at,updated_at) VALUES(1,800,now(),now());`);
   liveIds=['4'];await automation.request('round',{bot:'ki',request_key:'round'});await next();
   const jobs=(await admin.query("SELECT payload FROM node_automation_jobs WHERE kind='bot-link' ORDER BY (payload->>'link_id')::integer")).rows;
   assert.deepEqual(jobs.map(r=>r.payload.link_id),['1','3','4']);
   for(let i=0;i<3;i++) await runKind('bot-link');assert.equal(searches.length,3);
   const aligned=searches.find(search=>search.policy.is_kink_aligned);assert.ok(aligned);assert.deepEqual(aligned.policy.kinks,['forest']);assert.match(aligned.tags,/massage romantic/);
   assert.equal((await admin.query('SELECT set_count FROM users WHERE id=2')).rows[0].set_count,3);
  });
  await t.test('consent/mascot/history changes during an upstream lookup cancel an automated write',async()=>{
   for(const change of ["DELETE FROM link_abilities WHERE link_id=1","UPDATE users SET mascot='warren' WHERE id=1","INSERT INTO past_links(link_id,user_id,post_url,created_at,updated_at) VALUES(1,1,'https://example.test/manual.jpg',now(),now())"]) {
    await reset();await admin.query("INSERT INTO link_abilities(link_id,ability,created_at,updated_at) VALUES(1,'can_be_set_by_lizard',now(),now())");
    await automation.request('round',{bot:'ki',request_key:'race'});await next();selectHook=()=>admin.query(change);await runKind('bot-link');
    assert.equal((await admin.query('SELECT count(*) FROM node_wallpaper_events')).rows[0].count,'0');
   }
  });
  await t.test('PornBot rounds cap selection at 60 and honor their separate opt-in',async()=>{
   await reset();await admin.query(`INSERT INTO links(id,user_id,never_expires,friends_only,min_score,blacklist,theme,last_ping,created_at,updated_at)
    SELECT n,1,true,false,0,'','',now(),now(),now() FROM generate_series(100,160)n;
    INSERT INTO link_abilities(link_id,ability,created_at,updated_at) SELECT id,'can_be_set_by_porn_bot',now(),now() FROM links WHERE id BETWEEN 100 AND 160;`);
   await automation.request('round',{bot:'pornbot',request_key:'porn-round'});await next();
   assert.equal((await admin.query("SELECT count(*) FROM node_automation_jobs WHERE kind='bot-link'")).rows[0].count,'60');
   await admin.query('DELETE FROM link_abilities WHERE link_id BETWEEN 100 AND 160;DELETE FROM links WHERE id BETWEEN 100 AND 160');
  });
  await t.test('wallpaper commits atomically enqueue forks and newsroom; descendants reapply their own policy',async()=>{
   await reset();await admin.query("UPDATE links SET forked_from_id=CASE id WHEN 2 THEN 1 WHEN 3 THEN 2 END,blacklist=CASE WHEN id=2 THEN 'fox' ELSE '' END WHERE id IN(2,3)");
   const result=await apply();assert.equal((await admin.query('SELECT count(*) FROM node_automation_jobs')).rows[0].count,'2');
   await runKind('fork-fanout');await runKind('fork-link');assert.equal(selects.length,1);assert.equal(selects[0].policy.blacklist,'fox');
   await runKind('fork-fanout');await runKind('fork-link');
   assert.equal((await admin.query('SELECT count(*) FROM past_links')).rows[0].count,'3');
   // Replaying a committed child after a crash cannot duplicate its history.
   const child=(await admin.query("SELECT * FROM node_automation_jobs WHERE kind='fork-link' ORDER BY id LIMIT 1")).rows[0];await automation.run(child);
   assert.equal((await admin.query('SELECT count(*) FROM past_links')).rows[0].count,'3');
   assert.ok(result.past_link_id);
  });
  await t.test('an enqueue failure rolls back the wallpaper, history, counters and outbox together',async()=>{
   await reset();await admin.query("ALTER TABLE node_automation_jobs ADD CONSTRAINT test_failure CHECK(kind<>'news-wallpaper')");
   await assert.rejects(apply());assert.equal((await admin.query('SELECT count(*) FROM past_links')).rows[0].count,'0');assert.equal((await admin.query('SELECT post_url FROM links WHERE id=1')).rows[0].post_url,null);
   await admin.query('ALTER TABLE node_automation_jobs DROP CONSTRAINT test_failure');
  });
  await t.test('handoff after a legacy wallpaper commit preserves its key and repairs missing child work',async()=>{
   await reset();await apply(1,'old-write');await admin.query('DELETE FROM node_automation_jobs');
   await enqueueAutomation(pool,{key:'legacy:999',kind:'set-link',payload:{link_id:'1',post_id:'321',set_by_id:'1',write_key:'old-write'}});await next();
   assert.equal((await admin.query('SELECT count(*) FROM past_links')).rows[0].count,'1');
   assert.equal((await admin.query("SELECT count(*) FROM node_automation_jobs WHERE status='queued'")).rows[0].count,'2');assert.equal(selects.length,0);
  });
  await t.test('large fork fanouts are paged and upstream failures leave retryable work',async()=>{
   await reset();await admin.query(`INSERT INTO links(id,user_id,forked_from_id,never_expires,friends_only,min_score,blacklist,theme,created_at,updated_at)
    SELECT n,1,1,true,false,0,'','',now(),now() FROM generate_series(200,300)n`);
   await apply();await runKind('fork-fanout');assert.equal((await admin.query("SELECT count(*) FROM node_automation_jobs WHERE kind='fork-link'")).rows[0].count,'100');
   await runKind('fork-fanout');assert.equal((await admin.query("SELECT count(*) FROM node_automation_jobs WHERE kind='fork-link'")).rows[0].count,'101');
   await admin.query('DELETE FROM links WHERE id BETWEEN 200 AND 300');await reset();
   await automation.request('set-wallpaper',{request_key:'upstream-retry',link_id:1,post_id:321});
   const job=await automation.queue.claim();selectHook=async()=>{throw new Error('upstream down');};await assert.rejects(automation.run(job));await automation.queue.retry(job,new Error('upstream down'));
   assert.equal((await admin.query('SELECT status FROM node_automation_jobs')).rows[0].status,'queued');assert.equal((await admin.query('SELECT count(*) FROM past_links')).rows[0].count,'0');
   selectHook=undefined;await admin.query('UPDATE node_automation_jobs SET run_at=now()');await next();assert.equal((await admin.query('SELECT count(*) FROM past_links')).rows[0].count,'1');
  });
  await t.test('stale parent updates, detached forks, deleted setters and cycles cannot overwrite or loop',async()=>{
   await reset();await admin.query('UPDATE links SET forked_from_id=1 WHERE id=2');await apply(1,'first');await runKind('fork-fanout');
   await apply(1,'newer');await runKind('fork-link');assert.equal(selects.length,0);
   await runKind('fork-fanout');await admin.query('UPDATE links SET forked_from_id=NULL WHERE id=2');await runKind('fork-link');assert.equal(selects.length,0);
   await reset();await admin.query('UPDATE links SET forked_from_id=CASE id WHEN 1 THEN 2 WHEN 2 THEN 1 END WHERE id IN(1,2)');await apply();await runKind('fork-fanout');await runKind('fork-link');await runKind('fork-fanout');
   assert.equal((await admin.query("SELECT count(*) FROM node_automation_jobs WHERE kind='fork-link'")).rows[0].count,'1');
  });
  await t.test('newsroom scoop claiming is atomic; delayed transitions survive restart and keep one story active',async()=>{
   await reset();await admin.query("INSERT INTO scoops(id,user_id,details,was_shown,created_at,updated_at) VALUES(1,1,'One short scoop',false,now(),now()),(2,1,'Next scoop',false,now(),now())");
   await automation.request('scoop-round',{request_key:'scoops'});await next();
   let current=await newsroom.read();assert.match(current.entry.message,/Breaking news from Alice/);
   await automation.request('scoop-round',{request_key:'concurrent'});await next();assert.equal((await admin.query('SELECT count(*) FROM scoops WHERE was_shown=true')).rows[0].count,'1');
   const fresh=createNewsroom(pool);const phases=[];
   for(let i=0;i<5;i++) {await runKind('news-step');phases.push((await fresh.read()).entry.lizard_image_url);}
   assert.deepEqual(phases,['mascot/news/TaylorDeskTransition.png','mascot/news/KiInterviewOpen.png','mascot/news/KiInterviewClosed.png','mascot/news/TaylorDeskTransition.png','mascot/news/TaylorDeskClosed.png']);
   assert.equal((await admin.query('SELECT busy_until FROM node_newsroom_states')).rows[0].busy_until,null);
   await automation.request('scoop-round',{request_key:'next-scoop'});await next();assert.equal((await admin.query('SELECT count(*) FROM scoops WHERE was_shown=true')).rows[0].count,'2');
  });
  await t.test('wallpaper news is throttled; old delayed stages cannot interrupt a newer scoop',async()=>{
   await reset();const result=await apply();await runKind('news-wallpaper');assert.equal((await newsroom.read()).entry.message,'Alice chose a wallpaper.');
   await automation.request('wallpaper-news',{request_key:'duplicate-news',past_link_id:result.past_link_id});await runKind('news-wallpaper');
   assert.equal((await admin.query('SELECT count(*) FROM node_automation_events')).rows[0].count,'1');
   await admin.query("INSERT INTO scoops(id,user_id,details,was_shown,created_at,updated_at) VALUES(1,1,'A scoop',false,now(),now())");await automation.request('scoop-round',{request_key:'interrupt'});await runKind('scoop-round');
   await runKind('news-step');assert.equal((await newsroom.read()).entry.lizard_image_url,'mascot/news/TaylorDeskBreakingNews.png');
  });
  await t.test('legacy handoff preserves scheduled times and original records, skips stale recurring failures, and is idempotent',async()=>{
   await reset();const args=JSON.stringify({arguments:[{e621_post:{id:321},link:{_aj_globalid:'gid://walltaker/Link/1'},set_by:null}]});
   await admin.query(`INSERT INTO solid_queue_jobs(id,queue_name,class_name,arguments,scheduled_at,created_at,updated_at) VALUES
    (900,'urgent','SetLinkJob',$1,now()+interval '30 seconds',now(),now()),(901,'default','LizardRoundJob','{}',now(),now(),now()),(902,'default','PushNewsJob','invalid',now(),now(),now())`,[args]);
   await admin.query("INSERT INTO solid_queue_scheduled_executions(job_id,queue_name,scheduled_at,created_at) VALUES(900,'urgent',now()+interval '30 seconds',now())");
   const importer=createLegacyAutomationImporter(pool);await importer();await importer();
   const rows=(await admin.query('SELECT * FROM node_automation_jobs ORDER BY job_key')).rows;assert.equal(rows.length,2);assert.equal(rows[0].kind,'set-link');assert.ok(rows[0].run_at>Date.now());assert.equal(rows[1].status,'failed');
   assert.equal((await admin.query('SELECT count(*) FROM solid_queue_scheduled_executions')).rows[0].count,'0');
   assert.equal((await admin.query('SELECT finished_at FROM solid_queue_jobs WHERE id=901')).rows[0].finished_at,null);
   assert.ok((await admin.query('SELECT arguments FROM solid_queue_jobs WHERE id=900')).rows[0].arguments.includes('321'));
  });
  await t.test('private command validation rejects unsafe IDs, unknown rounds and invalid content',async()=>{
   await reset();for(const [op,input] of [['round',{bot:'__proto__'}],['round',{bot:'missing'}],['set-wallpaper',{link_id:'x',post_id:1}],['wallpaper-news',{past_link_id:-1}],['news-entry',{entry:{message:'hi',lizard_image_url:'../../bad'}}]])await assert.rejects(automation.request(op,{request_key:'validation',...input}),{status:422});
   assert.deepEqual(Object.keys(BOTS),['taylor','warren','ki','pornbot']);assert.equal((await automation.request('status')).backend,'node-automation');
  });
 }finally{
  await pool?.end();await writer?.end();await admin?.end();
  // Like the other integration suites, the disposable Compose volume owns
  // fixture cleanup. DROP DATABASE FORCE can interrupt sockets still closing
  // after pg.Pool.end() and report a spurious asynchronous test failure.
  await bootstrap.end();
 }
});
