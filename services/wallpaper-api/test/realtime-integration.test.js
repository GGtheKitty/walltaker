import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createClient } from 'redis';
import { createRealtimePresence } from '../src/realtime-presence.js';
import { createRealtimeQueue, QUEUE_KEYS } from '../src/realtime-queue.js';
import { createRealtimePublisher } from '../src/realtime-publisher.js';
import { createRedisStore } from '../src/redis.js';
import { createRepository } from '../src/repository.js';

test('live updates and presence with real PostgreSQL grants and Redis', {
  skip: !process.env.TEST_DATABASE_URL || !process.env.TEST_REDIS_URL,
}, async (t) => {
  const bootstrap = new pg.Pool({ connectionString:process.env.TEST_DATABASE_URL,max:1 });
  let admin, role, redis;
  try {
    await bootstrap.query('CREATE DATABASE node_realtime_test');
    const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = '/node_realtime_test';
    admin = new pg.Pool({ connectionString:url.href,max:2 });
    await admin.query(`CREATE TABLE users (id bigint PRIMARY KEY,username text,deleted_at timestamptz,
      viewing_link_id bigint,updated_at timestamptz,email text,api_key text,password_digest text,admin boolean);
      CREATE TABLE links (id bigint PRIMARY KEY,user_id bigint REFERENCES users(id),expires timestamptz,terms text,
        blacklist text,post_url text,post_thumbnail_url text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
        response_type integer,response_text text,post_description text,last_ping timestamptz,last_ping_user_agent varchar(255),
        live_client_started_at timestamptz,friends_only boolean DEFAULT false,never_expires boolean DEFAULT true,set_by_id bigint,custom_url text);
      ALTER TABLE users ADD FOREIGN KEY(viewing_link_id) REFERENCES links(id);
      INSERT INTO users(id,username) VALUES(1,'Alice'),(2,'Bob'),(3,'Deleted');
      UPDATE users SET deleted_at=now() WHERE id=3;
      INSERT INTO links(id,user_id,custom_url,post_description) VALUES(1,1,'slug',repeat('description',30)),(2,2,NULL,''),(3,3,NULL,NULL);
      CREATE ROLE node_realtime LOGIN PASSWORD 'test';`);
    const script = readFileSync(new URL('../../../scripts/provision-realtime.sh',import.meta.url),'utf8');
    for (const line of script.split('\n')) {
      const match = /^SELECT format\('(GRANT [^']+)', (.+)\) \\gexec$/.exec(line);
      if (!match) continue;
      let sql = match[1];
      for (const name of match[2].matchAll(/:'([^']+)'/g)) sql = sql.replace('%I', '"'+(name[1]==='database_name'?'node_realtime_test':'node_realtime')+'"');
      await admin.query(sql);
    }
    url.username = 'node_realtime'; url.password = 'test';
    role = new pg.Pool({ connectionString:url.href,max:2 });
    redis = createClient({ url:process.env.TEST_REDIS_URL }); await redis.connect(); await redis.flushDb();
    const queue = createRealtimeQueue(redis);
    const presence = createRealtimePresence({ pool:role,redis,queue });
    let clock=Date.now();
    const leasedPresence=createRealtimePresence({pool:role,redis,queue,now:()=>clock});
    const leaseStore=createRedisStore(redis,{now:()=>clock});
    const row = async (id=1) => (await admin.query('SELECT * FROM links WHERE id=$1',[id])).rows[0];
    const viewing = async () => (await admin.query('SELECT viewing_link_id FROM users WHERE id=1')).rows[0].viewing_link_id;
    await t.test('multiple clients keep a link online until the last disconnect and retain the original start time', async () => {
      await presence.join('1','one','Desktop');
      const started = (await row()).live_client_started_at;
      assert.ok(started); assert.equal(await redis.zCard('link:1:ws_client_leases'),1);
      assert.ok(Math.abs(Number(await redis.zScore('link:1:ws_client_leases','one'))-Date.now()/1000)<5);
      await presence.join('1','two','Desktop 2'); await presence.join('1','one','Desktop');
      assert.equal((await row()).live_client_started_at.getTime(),started.getTime());
      await presence.leave('1','one'); assert.equal(await redis.zCard('link:1:ws_client_leases'),1);
      await presence.leave('1','two'); assert.equal(await redis.zCard('link:1:ws_client_leases'),0);
      assert.equal((await row()).live_client_started_at.getTime(),started.getTime());
      assert.ok(await redis.zScore(QUEUE_KEYS[0],'presence-link:1'));
      assert.ok(await redis.zScore(QUEUE_KEYS[0],'user:Alice'));
    });
    await t.test('polling and announcements write only presence, bound client names, and reject inactive owners', async () => {
      await presence.poll('1',{ 'user-agent':'Widget',joihow:'widgetExtension' });
      assert.equal((await row()).last_ping_user_agent,'Widget widgetExtension');
      assert.ok((await row()).last_ping);
      await presence.announce('1','New desktop'); assert.equal((await row()).last_ping_user_agent,'New desktop');
      await presence.poll('1',{}); assert.equal((await row()).last_ping_user_agent,'New desktop');
      assert.equal(await presence.join('3','inactive','App'),false);
      assert.equal(await redis.zCard('link:3:ws_client_leases'),0);
      await presence.poll('3',{ 'user-agent':'App' }); assert.equal((await row(3)).last_ping,null);
    });
    await t.test('browser tabs cannot remove another tab presence and transitions notify both links', async () => {
      await presence.view(1,'tab-one','1'); assert.equal(await viewing(),'1');
      await presence.view(1,'tab-two','2'); assert.equal(await viewing(),'2');
      await presence.view(1,'tab-one',null); assert.equal(await viewing(),'2');
      await presence.view(1,'tab-two',null); assert.equal(await viewing(),null);
      assert.ok(await redis.zScore(QUEUE_KEYS[0],'viewers:1')); assert.ok(await redis.zScore(QUEUE_KEYS[0],'viewers:2'));
      await presence.view(1,'tab-three','999'); assert.equal(await viewing(),null);
      await presence.view(3,'deleted','1');
      assert.equal((await admin.query('SELECT viewing_link_id FROM users WHERE id=3')).rows[0].viewing_link_id,null);
    });
    await t.test('concurrent viewer updates serialize and disconnect restores the remaining tab', async () => {
      await Promise.all([presence.view(1,'tab-a','1'),presence.view(1,'tab-b','2')]);
      await presence.view(1,'tab-b',null); assert.equal(await viewing(),'1');
      await presence.view(1,'tab-a',null); assert.equal(await viewing(),null);
    });
    await t.test('five-minute per-connection leases renew independently and preserve the original start timestamp',async()=>{
      await leasedPresence.join('1','stale-client','App');await leasedPresence.join('1','live-client','App');
      const started=(await row()).live_client_started_at.getTime();
      clock+=240000;await leasedPresence.heartbeat([{id:'1',token:'live-client'}],null,'socket');clock+=120000;
      assert.deepEqual(await leaseStore.connected(['1']),new Set(['1']));
      assert.equal(await redis.zCard('link:1:ws_client_leases'),1);
      assert.equal((await row()).live_client_started_at.getTime(),started);
      await leasedPresence.leave('1','live-client');assert.equal(await redis.zCard('link:1:ws_client_leases'),0);
      clock=Date.now();
    });
    await t.test('all online readers prune expired leases instead of trusting old presence sets',async()=>{
      await redis.zAdd('link:1:ws_client_leases',{score:Date.now()/1000-301,value:'expired'});
      await redis.sAdd('link:1:ws_clients','legacy');
      assert.equal((await leaseStore.connected(['1'])).size,0);assert.ok(!(await leaseStore.onlineIds()).includes('1'));
      await redis.del('link:1:ws_clients');
    });
    await t.test('viewer heartbeats preserve tab ordering and expired tabs cannot keep an old viewing target',async()=>{
      clock=Date.now();await leasedPresence.view(1,'old-tab','1');clock++;
      await leasedPresence.view(1,'new-tab','2');
      clock+=240000;await leasedPresence.heartbeat([],1,'old-tab');assert.equal(await viewing(),'2');
      clock+=120000;await leasedPresence.heartbeat([],1,'old-tab');assert.equal(await viewing(),'1');
      clock+=301000;await leasedPresence.sweep();assert.equal(await viewing(),null);
      clock=Date.now();
    });
    await t.test('actual database role cannot read credentials or change wallpapers, permissions or accounts', async () => {
      for (const sql of ['SELECT api_key FROM users','SELECT email FROM users','SELECT password_digest FROM users',
        'UPDATE users SET admin=true',"UPDATE links SET post_url='injected'",'DELETE FROM links','DELETE FROM users']) {
        await assert.rejects(role.query(sql),{ code:'42501' });
      }
    });
    await t.test('queue coalesces updates, retries failures and retains updates arriving during delivery', async () => {
      await redis.del(QUEUE_KEYS);
      await queue.enqueue('link:1'); await queue.enqueue('link:1');
      let count = 0;
      await queue.drain(async () => { count++; await queue.enqueue('link:1'); });
      assert.equal(count,1); assert.equal(await redis.zCard(QUEUE_KEYS[0]),1);
      await assert.rejects(queue.drain(async () => { throw new Error('Redis temporary failure'); }));
      assert.equal(await redis.zCard(QUEUE_KEYS[0]),1);
      await redis.zAdd(QUEUE_KEYS[0],[{ score:0,value:'link:1' }]);
      await queue.drain(async () => { count++; });
      assert.equal(count,2); assert.equal(await redis.zCard(QUEUE_KEYS[0]),0);
      assert.equal(await redis.hLen(QUEUE_KEYS[1]),0);
    });
    await t.test('Node publishes untruncated live link payloads and preserves all four user audiences', async () => {
      const published = [], renders = [];
      const subscriber = redis.duplicate(); await subscriber.connect();
      await subscriber.subscribe('__anycable__',(message) => published.push(JSON.parse(message)));
      try {
        const store = createRedisStore(redis), repository = createRepository(admin);
        assert.equal((await repository.findIdentifier('slug')).id,'1');
        const publisher = createRealtimePublisher({ redis,repository,store,
          readUser:async ({ username,audience }) => ({ username,authenticated:audience!=='anonymous',online:audience==='friend' }),
          secretKeyBase:'test',baseUrl:'https://example.test',
          nativeRender:async (kind,id)=>{renders.push({kind,id});} });
        await publisher.deliver('presence-link:1'); await publisher.deliver('user:Alice'); await publisher.deliver('viewers:1');
        // Redis publishes and subscriptions use separate sockets.
        await new Promise((resolve) => setTimeout(resolve,30));
        const payload = JSON.parse(published[0].data);
        assert.equal(payload.post_description.length,330); assert.equal(payload.success,true); assert.equal(payload.set_by,null);
        assert.equal(payload.url,undefined);
        const users = published.slice(1).map((message) => [message.stream,JSON.parse(message.data).user]);
        assert.equal(users.length,4); assert.equal(users[0][1].authenticated,false);
        assert.equal(users[1][1].friend,false); assert.equal(users[2][1].friend,true);
        assert.equal(users[2][1].online,true); assert.equal(users[3][1].self,true); assert.equal(users[3][1].online,false);
        assert.deepEqual(renders,[{ kind:'link',id:'1' },{ kind:'viewers',id:'1' }]);
      } finally { await subscriber.close(); }
    });
  } finally { await redis?.close(); await role?.end(); await admin?.end(); await bootstrap.end(); }
});
