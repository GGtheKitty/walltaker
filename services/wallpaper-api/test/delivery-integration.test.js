import test from'node:test';import assert from'node:assert/strict';import pg from'pg';import{readFileSync}from'node:fs';
import{createRenderer}from'../src/rendering/index.js';import{createNativeDelivery}from'../src/delivery.js';
pg.types.setTypeParser(1114,value=>new Date(value+'Z'));
test('native rendering and durable deliveries acknowledge only after publication using restricted production roles',{skip:!process.env.TEST_DATABASE_URL},async t=>{
 const bootstrap=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});let admin,pool,browser;
 try{
  await bootstrap.query('CREATE DATABASE node_delivery_test');const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/node_delivery_test';admin=new pg.Pool({connectionString:url.href,max:2});
  for(const file of ['moderation-schema.sql','automation-schema.sql'])await admin.query(readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8'));
  await admin.query(`CREATE TABLE node_moderation_events(id bigserial PRIMARY KEY,request_key varchar(160),payload_digest varchar(64),operation text,user_id bigint,result jsonb,effects jsonb NOT NULL DEFAULT '{}',delivered_at timestamp,delivery_attempts integer DEFAULT 0,available_at timestamp DEFAULT now(),created_at timestamp,updated_at timestamp);
   CREATE ROLE node_delivery LOGIN PASSWORD 'test';CREATE ROLE node_delivery_browser LOGIN PASSWORD 'test';
   INSERT INTO users(id,username,email,password_digest,api_key,admin,created_at,updated_at) VALUES(1,'Alice','private@example.test','secret-hash','key',false,now(),now()),(2,'Bob','bob@example.test','hash','key',false,now(),now());
   INSERT INTO links(id,user_id,never_expires,friends_only,terms,blacklist,theme,min_score,created_at,updated_at) VALUES(1,1,true,false,'Link text','','',0,now(),now());
   INSERT INTO comments(id,user_id,link_id,content,created_at,updated_at) VALUES(1,2,1,'<script>unsafe</script> Hi',now(),now());
   INSERT INTO message_threads(id,created_at,updated_at) VALUES(1,now(),now());
   INSERT INTO message_thread_participants(id,message_thread_id,user_id,notify,created_at,updated_at) VALUES(1,1,1,true,now(),now()),(2,1,2,true,now(),now());
   INSERT INTO messages(id,message_thread_id,from_user_id,content,created_at,updated_at) VALUES(1,1,2,'Message text',now(),now());`);
  // Browser tables are required only by its grants; render delivery never reads auth credentials.
  await admin.query(readFileSync(new URL('./fixtures/browser-schema.sql',import.meta.url),'utf8'));
  for(const file of ['provision-browser.sh','provision-delivery.sh'])for(const line of readFileSync(new URL('../../../scripts/'+file,import.meta.url),'utf8').split('\n')){
   const match=/^SELECT format\('(GRANT [^']+)', (.+?)\) \\gexec$/.exec(line);if(!match)continue;let sql=match[1];for(const key of match[2].matchAll(/:'([^']+)'/g))sql=sql.replace('%I','"'+({browser_user:'node_delivery_browser',delivery_user:'node_delivery',database_name:'node_delivery_test'}[key[1]])+'"');await admin.query(sql);
  }
  const role=name=>{url.username=name;url.password='test';return new pg.Pool({connectionString:url.href,max:2});};pool=role('node_delivery');browser=role('node_delivery_browser');
  const published=[],queued=[],news=[],sent=[];let failPublish=false;
  const redis={publish:async(channel,message)=>{if(failPublish)throw Error('simulated Redis failure');published.push({channel,...JSON.parse(message)});},del:async()=>{}};
  const renderer=createRenderer({secretKeyBase:'test',baseUrl:'https://example.test'});
  const delivery=createNativeDelivery({pool,browserPool:browser,renderer,redis,queue:{enqueue:async job=>queued.push(job)},store:{connected:async()=>new Set()},discovery:async()=>({recent_posts:[],viewers:[],graph:{users:[]}}),automation:async(op,input)=>news.push([op,input]),moderation:async()=>({profiles:[],rules:[]}),accounts:async()=>({delivery:null}),sendReset:async(...args)=>sent.push(args)});
  const social=async effects=>(await admin.query("INSERT INTO node_social_events(request_key,payload_digest,operation,user_id,result,effects,created_at,updated_at) VALUES(md5(random()::text),repeat('a',64),'test',1,'{}',$1,now(),now()) RETURNING id",[JSON.stringify(effects)])).rows[0].id;
  await t.test('delivery role cannot read credentials, edit business data, forge events or change event identity',async()=>{
   for(const sql of ['SELECT email FROM users','SELECT password_digest FROM users','UPDATE users SET admin=true','UPDATE links SET terms=\'bad\'','INSERT INTO node_social_events(id) VALUES(999)','UPDATE node_social_events SET user_id=2'])await assert.rejects(pool.query(sql),{code:'42501'});
  });
  await t.test('failed publication leaves receipt pending and a retry publishes once then acknowledges',async()=>{
   const id=await social({notifications:[1]});failPublish=true;await assert.rejects(delivery.deliver('social',id));assert.equal((await admin.query('SELECT delivered_at FROM node_social_events WHERE id=$1',[id])).rows[0].delivered_at,null);
   failPublish=false;await delivery.deliver('social',id);const count=published.length;await delivery.deliver('social',id);assert.equal(published.length,count);assert.ok(JSON.parse(published.at(-1).data).includes('No notifications yet.'));assert.ok((await admin.query('SELECT delivered_at FROM node_social_events WHERE id=$1',[id])).rows[0].delivered_at);
  });
  await t.test('comments, messages and deleted delegations use native HTML, stable IDs and current membership streams',async()=>{
   const id=await social({comment_id:1,message_id:1,users:[1,2],surrenders:[{id:50,user_id:1,controller_user_id:2}]});await delivery.deliver('social',id);
   assert.ok(published.some(p=>p.stream==='link_comments_1'&&JSON.parse(p.data).includes('id="comment_1"')));
   for(const member of ['social_thread_member_1_1','social_thread_member_2_2'])assert.ok(published.some(p=>p.stream===member&&JSON.parse(p.data).includes('Message text')));
   assert.ok(published.some(p=>JSON.parse(p.data).includes('no longer has access')));assert.ok(queued.includes('user:Alice'));
  });
  await t.test('concurrent workers do not duplicate a receipt and revoked members receive no new messages',async()=>{
   await admin.query('DELETE FROM message_thread_participants WHERE id=2');const id=await social({message_id:1});const before=published.filter(p=>p.stream==='social_thread_member_1_1').length;
   await Promise.all([delivery.deliver('social',id),delivery.deliver('social',id)]);assert.equal(published.filter(p=>p.stream==='social_thread_member_1_1').length,before+1);
  });
  await t.test('newsroom generation guards prevent old deliveries from replacing a newer scene',async()=>{
   await admin.query("UPDATE node_newsroom_states SET generation=10,rendered_event_id=0 WHERE id=1");
   const event=async generation=>(await admin.query("INSERT INTO node_automation_events(request_key,generation,effects,created_at,updated_at) VALUES(md5(random()::text),$1,$2,now(),now()) RETURNING id",[generation,JSON.stringify({actions:[{target:'chyron',message:'News'}]})])).rows[0].id;
   const stale=await event(9),fresh=await event(10),before=published.length;await delivery.deliver('automation',stale);assert.equal(published.length,before);await delivery.deliver('automation',fresh);assert.equal(published.length,before+1);assert.equal(String((await admin.query('SELECT rendered_event_id FROM node_newsroom_states WHERE id=1')).rows[0].rendered_event_id),String(fresh));
  });
 }finally{await pool?.end();await browser?.end();await admin?.end();await bootstrap.end();}
});
