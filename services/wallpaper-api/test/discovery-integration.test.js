import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createClient} from 'redis';
import {readFileSync} from 'node:fs';
import {createDiscovery,createDiscoveryCache,parseSearch} from '../src/discovery.js';
import {createRedisStore} from '../src/redis.js';

test('discovery validation bounds query complexity, preserves selectors and validates paging',()=>{
 assert.deepEqual(parseSearch({query:'fox !canine !canine',page:'2',only_online:'1'}),{query:'fox !canine !canine',text:'fox',selectors:['canine'],page:2,only_online:true});
 for(const input of [{query:'x'.repeat(257)},{query:'x\0y'},{query:[]},{page:0},{page:'2oops'},{page:[]},{page:1000000},{query:Array(34).fill('x').join(' ')}])assert.throws(()=>parseSearch(input),{status:422});
 assert.equal(parseSearch().query,'');
});

test('homepage, Browse, search and recommendations with production read-only grants', {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const bootstrap=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let admin,pool,redis;
 const clock=Date.parse('2026-10-23T00:00:30Z');
 try {
  await bootstrap.query('CREATE DATABASE node_discovery_test');
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/node_discovery_test';admin=new pg.Pool({connectionString:url.href,max:1});
  await admin.query(`CREATE TABLE users(id bigint PRIMARY KEY,username text,details text,created_at timestamp,updated_at timestamp,
   deleted_at timestamp,set_count integer DEFAULT 0,profile_id bigint,viewing_link_id bigint,mascot text,pervert boolean,email text,password_digest text,api_key text,password_reset_token text);
   CREATE TABLE profiles(id bigint PRIMARY KEY,user_id bigint,content text);
   CREATE TABLE links(id bigint PRIMARY KEY,user_id bigint,theme text,terms text,blacklist text DEFAULT '',custom_url text,response_text text,post_description text,
    post_url text,post_thumbnail_url text,created_at timestamp,updated_at timestamp,last_ping timestamp,last_ping_user_agent text,
    never_expires boolean DEFAULT true,expires timestamp,friends_only boolean DEFAULT false,forked_from_id bigint);
   CREATE TABLE past_links(id bigserial PRIMARY KEY,link_id bigint,user_id bigint,set_by_id bigint,created_at timestamp,updated_at timestamp,post_url text,post_thumbnail_url text,tags text);
   CREATE TABLE wallpaper_clients(id bigint PRIMARY KEY,name text,section text,position integer,match_text text);
   CREATE TABLE scoops(id bigint PRIMARY KEY,user_id bigint,details text,created_at timestamp,updated_at timestamp);
   CREATE TABLE kinks(id bigint PRIMARY KEY,name text,works_on_e621 boolean);
   CREATE TABLE kink_havers(id bigint PRIMARY KEY,user_id bigint,kink_id bigint,is_starred boolean,created_at timestamp);
   CREATE TABLE link_abilities(id bigint PRIMARY KEY,link_id bigint,ability text);
   CREATE TABLE leashes(id bigint PRIMARY KEY,pet_id bigint,master_id bigint,flair text);
   CREATE TABLE friendships(id bigint PRIMARY KEY,sender_id bigint,receiver_id bigint,confirmed boolean);
   CREATE TABLE emoji_link_decorations(id bigint PRIMARY KEY,link_id bigint,emoji text);
   CREATE ROLE node_discovery LOGIN PASSWORD 'test';`);
  const script=readFileSync(new URL('../../../scripts/provision-discovery.sh',import.meta.url),'utf8');
  for(const line of script.split('\n')) {
   const m=/^SELECT format\('((?:GRANT |ALTER ROLE %I SET default_transaction_read_only=on)[^']*)', (.+)\) \\gexec$/.exec(line);if(!m)continue;
   let sql=m[1];for(const name of m[2].matchAll(/:'([^']+)'/g))sql=sql.replace('%I','"'+(name[1]==='database_name'?'node_discovery_test':'node_discovery')+'"');await admin.query(sql);
  }
  url.username='node_discovery';url.password='test';pool=new pg.Pool({connectionString:url.href,max:1});
  redis=createClient({url:process.env.TEST_REDIS_URL});await redis.connect();
  await admin.query(`INSERT INTO users(id,username,details,created_at,deleted_at,set_count) VALUES
   (1,'PrefixOwner','galactic astronomy', $1::timestamp-interval '2 days',NULL,100),
   (2,'NewOwner','running paws', $1::timestamp-interval '1 hour',NULL,0),
   (3,'Deleted','should stay hidden',$1,$1,0),(4,'OtherViewer','ordinary',$1::timestamp-interval '2 days',NULL,0);
   `,[new Date(clock)]);
  for(let id=1;id<=12;id++)await admin.query(`INSERT INTO links(id,user_id,terms,theme,created_at,updated_at,last_ping,last_ping_user_agent)
    VALUES($1,$2,$3,$4,$5,$5,$5,'Client')`,[id,id===8?3:[3,4,5,6,7].includes(id)?2:1,id===1?'running fox garden':id===12?'foxtrot 日本語':'neutral',id===1||id===2?'forest':id===3?'candidate':null,new Date(clock)]);
  await admin.query(`UPDATE links SET last_ping=$1::timestamp-interval '15 minutes',last_ping_user_agent='widgetExtension' WHERE id=3;
   UPDATE links SET last_ping=NULL WHERE id=4;
   UPDATE links SET last_ping=$1::timestamp-interval '2 minutes' WHERE id=5;
   UPDATE links SET never_expires=false,expires=$1::timestamp-interval '1 second' WHERE id=6;
   UPDATE links SET friends_only=true WHERE id=7;
   UPDATE links SET blacklist='fox' WHERE id=12;
   UPDATE links SET response_text='violet' WHERE id=9;
   UPDATE links SET post_description='opal' WHERE id=11;
   UPDATE links SET custom_url='turquoise' WHERE id=2;
   UPDATE links SET last_ping=NULL WHERE id IN(11,12);
   UPDATE users SET viewing_link_id=1 WHERE id=1;
   UPDATE users SET viewing_link_id=7 WHERE id=2;
   UPDATE users SET viewing_link_id=8 WHERE id=4;
   UPDATE users SET profile_id=1 WHERE id=1;
   INSERT INTO profiles VALUES(1,1,'<!-- walltaker:markdown -->galactic astronomy selectedbiomarker'),(2,1,'unselectedprivateuniquemarker'),(3,2,'<p>cobalt fallbackbiomarker</p>');
   INSERT INTO kinks(id,name,works_on_e621) VALUES(1,'candidate',true);
   INSERT INTO kink_havers(id,user_id,kink_id,is_starred,created_at) VALUES(1,1,1,true,$1);
   INSERT INTO link_abilities VALUES(1,1,'is_kink_aligned');
   INSERT INTO emoji_link_decorations VALUES(1,1,'🐱');
   INSERT INTO leashes VALUES(1,1,2,'flair');
   INSERT INTO scoops(id,user_id,details,created_at,updated_at) VALUES(1,1,'Recent scoop',$1,$1),(2,3,'Deleted scoop',$1,$1);
   INSERT INTO wallpaper_clients VALUES(1,'Last client','clients',20,'Client'),(2,'First client','clients',10,'widget'),(3,'Tool','companion_apps',0,NULL),(4,'Hidden','hidden',0,NULL);`.replaceAll('$1', "'2026-10-23T00:00:30.000Z'"));
  for(const id of [1,2,3,4,5,6,7,8,9,11,12])await admin.query('INSERT INTO past_links(link_id,user_id,created_at,post_thumbnail_url) SELECT id,user_id,$2,$3 FROM links WHERE id=$1',[id,new Date(clock-(id===2?600000:id===3?300000:60000)),`https://example.test/${id}.png`]);
  // Same timestamp history rows must not duplicate a Browse card.
  await admin.query('INSERT INTO past_links(link_id,user_id,created_at) VALUES(9,1,$1),(9,1,$1)',[new Date(clock-30000)]);
  for(let id=20;id<32;id++)await admin.query(`INSERT INTO links(id,user_id,terms,created_at,updated_at) VALUES($1,1,'paginationmarker',$2,$2)`,[id,new Date(clock)]);
  await redis.zAdd('link:4:ws_client_leases', {score:Date.now()/1000,value:'discovery-test'});
  const read=createDiscovery({pool,store:createRedisStore(redis),cache:createDiscoveryCache(redis),now:()=>clock});
  await redis.del('node:discovery:statistics:v1:2026-10-23');
  const ids=rows=>rows.map(row=>Number(row.id));
  await t.test('role defaults to read-only and cannot read secrets or write even when read-only is disabled',async()=>{
   assert.equal((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
   const guard=await pool.connect();
   try {await guard.query('SET default_transaction_read_only=off');
   for(const sql of ['SELECT email FROM users','SELECT api_key FROM users','SELECT password_digest FROM users','SELECT password_reset_token FROM users','UPDATE users SET username=username','UPDATE links SET friends_only=false','DELETE FROM past_links','INSERT INTO scoops(id) VALUES(99)'])await assert.rejects(guard.query(sql),{code:'42501'});
   } finally {guard.release();}
  });
  await t.test('anonymous homepage contains only listed clients, in configured order',async()=>{
   const data=await read('dashboard');assert.deepEqual(ids(data.clients),[3,2,1]);assert.equal(data.your_total,undefined);assert.equal(data.recent_posts,undefined);assert.deepEqual(data.graph.users,[]);
   await assert.rejects(read('dashboard',{viewer_id:3}),{status:403});
   await assert.rejects(read('dashboard',{viewer_id:'1 OR 1=1'}),{status:403});
  });
  await t.test('dashboard separates viewer counts, fills UTC chart days and filters shared feeds',async()=>{
   const a=await read('dashboard',{viewer_id:1}),b=await read('dashboard',{viewer_id:2});
   assert.notEqual(a.your_total,b.your_total);assert.equal(a.days.length,8);assert.equal(a.days.at(-1).day,'2026-10-23');assert.equal(a.days.at(-1).count,2);
   assert.equal(a.days.at(-2).count,a.total-2);assert.equal(a.recent_scoop.details,'Recent scoop');assert.equal(a.newest_user.username,'OtherViewer');
   assert.ok(a.recent_posts.every(post=>![6,7,8].includes(Number(post.link_id))));assert.deepEqual(ids(a.viewers),[1]);
   assert.equal(a.online,6); // polling, widget and WebSocket; no private/expired/deleted/offline links
   assert.ok(a.graph.users.every(u=>!('email' in u) && !('api_key' in u)));
   await admin.query("INSERT INTO past_links(link_id,user_id,created_at) VALUES(1,1,'2026-10-23 00:00:15')");
   const fresh=await read('dashboard',{viewer_id:1});assert.equal(fresh.today.find(r=>r.username==='PrefixOwner').total,a.today.find(r=>r.username==='PrefixOwner').total+1);assert.equal(fresh.your_total,a.your_total+1);
   assert.equal(fresh.total,a.total); // only anonymous aggregates have a 30-second cache
  });
  await t.test('Browse preserves attention ranking, deduplicates history and features new users',async()=>{
   const data=await read('browse'),found=ids(data.links);assert.equal(found[0],2);assert.equal(new Set(found).size,found.length);assert.ok(found.indexOf(9)<found.indexOf(3));
   for(const hidden of [5,6,7,8,10,11,12])assert.ok(!found.includes(hidden));
   assert.deepEqual(ids(data.new_user_links).sort((a,b)=>a-b),[3,4]);assert.ok(data.graph.abilities.length);assert.equal(data.graph.decorations[0].emoji,'🐱');
   assert.equal(data.graph.leashes[0].flair,'flair');assert.equal(data.graph.memberships[0].is_starred,true);
  });
  await t.test('search matches words, stems, prefixes, user bios and all supported link fields',async()=>{
   for(const query of ['runs','astronom','PrefixOwn','violet','opal','turquoise','日本語','selectedbiomarker','fallbackbiomarker'])assert.ok((await read('search',{query})).total>0,query);
   assert.equal((await read('search',{query:'unselectedprivateuniquemarker'})).total,0);
   assert.ok(ids((await read('search',{query:'fo'})).links).includes(12));assert.ok(!ids((await read('search',{query:'fox'})).links).includes(12));
   for(const query of ['', '!!!', "foo' & bar | !bad",'fox:*) | (garden','🐱','the'])await read('search',{query});
  });
  await t.test('paging is stable, complete and keeps !selectors and online filters',async()=>{
   const all=[];
   for(let page=1;page<=3;page++) {const data=await read('search',{query:'paginationmarker',page});assert.equal(data.total,12);assert.equal(data.has_next,page<3);all.push(...ids(data.links));}
   assert.deepEqual(all,Array.from({length:12},(_,i)=>20+i));
   const empty=await read('search',{query:'paginationmarker',page:4});assert.deepEqual(empty.links,[]);assert.equal(empty.total,12);
   const selected=await read('search',{query:'!candidate',page:2});assert.equal(selected.query,'!candidate');assert.ok(selected.total>5);assert.equal(selected.page,2);
   assert.equal((await read('search',{query:'paginationmarker',only_online:true})).total,0);
   await redis.zAdd('link:20:ws_client_leases', {score:Date.now()/1000,value:'discovery-test'});assert.equal((await read('search',{query:'paginationmarker',only_online:true})).total,1);await redis.del('link:20:ws_client_leases');
  });
  await t.test('subsequent reads immediately remove newly hidden, expired, deleted and disconnected links',async()=>{
   assert.ok(ids((await read('browse')).links).includes(4));await redis.del('link:4:ws_client_leases');assert.ok(!ids((await read('browse')).links).includes(4));
   await admin.query('UPDATE links SET friends_only=true WHERE id=1');assert.ok(!ids((await read('browse')).links).includes(1));
   assert.ok(!(await read('recent')).recent_posts.some(p=>Number(p.link_id)===1));assert.deepEqual((await read('viewers')).viewers,[]);
   await admin.query('UPDATE links SET friends_only=false WHERE id=1');
   await admin.query('UPDATE links SET friends_only=true WHERE id=20');assert.equal((await read('search',{query:'paginationmarker'})).total,11);
   await admin.query('UPDATE links SET friends_only=false,never_expires=false,expires=$1 WHERE id=20',[new Date(clock-1)]);assert.equal((await read('search',{query:'paginationmarker'})).total,11);
   await admin.query('UPDATE links SET never_expires=true WHERE id=20');
   await admin.query('UPDATE users SET deleted_at=$1 WHERE id=1',[new Date(clock)]);assert.equal((await read('search',{query:'paginationmarker'})).total,0);await admin.query('UPDATE users SET deleted_at=NULL WHERE id=1');
  });
  await t.test('similar suggestions prioritize an online theme, honor source access and return only eligible targets',async()=>{
   assert.equal(Number((await read('similar',{link_id:1})).link_id),2);
   await assert.rejects(read('similar',{link_id:7}),{status:403});await assert.rejects(read('similar',{link_id:6}),{status:403});
   assert.ok((await read('similar',{link_id:7,viewer_id:2})).link_id);
   await admin.query('UPDATE links SET friends_only=true WHERE id=2');const selected=Number((await read('similar',{link_id:1})).link_id);assert.ok(![1,2,6,7,8].includes(selected));
   await admin.query('UPDATE links SET friends_only=true WHERE id<>1');assert.equal((await read('similar',{link_id:1})).link_id,null);
  });
 } finally {if(redis?.isOpen){await redis.del(['link:4:ws_client_leases','link:20:ws_client_leases','node:discovery:statistics:v1:2026-10-23']);await redis.close();}await pool?.end();await admin?.end();await bootstrap.end();}
});
