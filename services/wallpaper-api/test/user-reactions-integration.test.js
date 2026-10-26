import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { createClient } from 'redis';
import { createRepository } from '../src/repository.js';
import { createRedisStore } from '../src/redis.js';
import { createUserReader } from '../src/users.js';
import { createReactionWriter } from '../src/reactions.js';
import { createKeyAuthenticator } from '../src/auth.js';
import { setTimeout } from 'node:timers/promises';

test('user status and reactions against real PostgreSQL permissions and Redis', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const bootstrap = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let admin, reader, writer, redis;
  try {
    await bootstrap.query('CREATE DATABASE node_reactions_test');
    const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = '/node_reactions_test';
    admin = new pg.Pool({ connectionString: url.href });
    await admin.query(`
      CREATE TABLE users (id bigint PRIMARY KEY, username text, api_key text, deleted_at timestamptz, email text,
        set_count integer DEFAULT 0, is_reporter boolean DEFAULT false, is_cutie boolean DEFAULT false, is_supporter boolean DEFAULT false);
      CREATE TABLE links (id bigint PRIMARY KEY, user_id bigint, set_by_id bigint, expires timestamptz,
        never_expires boolean DEFAULT true, friends_only boolean DEFAULT false, terms text, blacklist text,
        post_url text, post_thumbnail_url text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        response_type integer, response_text text, post_description text, last_ping timestamptz, last_ping_user_agent text, e621_post_id bigint);
      CREATE TABLE friendships (id bigserial PRIMARY KEY, sender_id bigint, receiver_id bigint, confirmed boolean);
      CREATE TABLE leashes (id bigserial PRIMARY KEY, friendship_id bigint, master_id bigint, pet_id bigint, flair text);
      CREATE TABLE past_links (id bigserial PRIMARY KEY, user_id bigint, link_id bigint, set_by_id bigint,
        e621_post_id bigint, post_url text, post_thumbnail_url text, created_at timestamptz DEFAULT now());
      CREATE TABLE comments (id bigserial PRIMARY KEY, user_id bigint, link_id bigint, content varchar(255), created_at timestamptz, updated_at timestamptz);
      CREATE TABLE notifications (id bigserial PRIMARY KEY, user_id bigint NOT NULL, notification_type integer, text varchar(255), link text, created_at timestamptz, updated_at timestamptz);
      CREATE TABLE nuttracker_orgasms (id bigserial PRIMARY KEY, user_id bigint, caused_by_user_id bigint, rating integer,
        is_ruined boolean, created_at timestamptz, updated_at timestamptz);
      CREATE TABLE site_settings (key text PRIMARY KEY, value text);
      CREATE TABLE nut_pledges (id bigserial PRIMARY KEY, user_id bigint, year integer, past_link_id bigint REFERENCES past_links(id), failed_on timestamptz, updated_at timestamptz);
      CREATE TABLE node_reaction_events (id bigserial PRIMARY KEY, request_key varchar(160) UNIQUE CHECK(request_key <> 'force-event-failure'),
        payload_digest varchar(64), link_id bigint, comment_ids bigint[], notification_id bigint, history_changed boolean,
        delivered_at timestamptz, delivery_attempts integer DEFAULT 0, available_at timestamptz DEFAULT now(), created_at timestamptz, updated_at timestamptz);
      CREATE FUNCTION public.walltaker_api_authenticate(supplied_key text) RETURNS bigint
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT id FROM public.users WHERE deleted_at IS NULL AND api_key = supplied_key AND length(supplied_key)>0 ORDER BY id LIMIT 1 $$;
      REVOKE ALL ON FUNCTION public.walltaker_api_authenticate(text) FROM PUBLIC;
      CREATE ROLE reaction_reader LOGIN PASSWORD 'test'; CREATE ROLE reaction_writer LOGIN PASSWORD 'test';
      GRANT USAGE ON SCHEMA public TO reaction_reader,reaction_writer;
      GRANT SELECT(id,username,deleted_at,set_count,is_reporter,is_cutie,is_supporter) ON users TO reaction_reader;
      GRANT SELECT ON links,friendships,leashes TO reaction_reader;
      GRANT EXECUTE ON FUNCTION public.walltaker_api_authenticate(text) TO reaction_reader;
      GRANT SELECT(id,user_id,set_by_id,post_url), UPDATE(response_type,response_text,e621_post_id,post_url,post_thumbnail_url,updated_at) ON links TO reaction_writer;
      GRANT SELECT(id,username,deleted_at), UPDATE(set_count) ON users TO reaction_writer;
      GRANT SELECT(id,link_id,e621_post_id,post_url,post_thumbnail_url,created_at), DELETE ON past_links TO reaction_writer;
      GRANT SELECT(user_id,year,past_link_id,failed_on), UPDATE(past_link_id,failed_on,updated_at) ON nut_pledges TO reaction_writer;
      GRANT SELECT(key,value) ON site_settings TO reaction_writer;
      GRANT INSERT(user_id,link_id,content,created_at,updated_at), SELECT(id) ON comments TO reaction_writer;
      GRANT INSERT(user_id,notification_type,text,link,created_at,updated_at), SELECT(id) ON notifications TO reaction_writer;
      GRANT SELECT(user_id,created_at), INSERT(user_id,caused_by_user_id,rating,is_ruined,created_at,updated_at) ON nuttracker_orgasms TO reaction_writer;
      GRANT SELECT, INSERT ON node_reaction_events TO reaction_writer;
      GRANT UPDATE(delivery_attempts,available_at,updated_at) ON node_reaction_events TO reaction_writer;
      GRANT USAGE ON SEQUENCE comments_id_seq,notifications_id_seq,nuttracker_orgasms_id_seq,node_reaction_events_id_seq TO reaction_writer;
      INSERT INTO users(id,username,api_key,deleted_at) VALUES (101,'Owner','ownerkey',null),
        (102,'Friend','friendkey',null),(103,'Other','otherkey',null),(104,'Deleted','deletedkey',now());
      INSERT INTO links(id,user_id,set_by_id,post_url,post_thumbnail_url,post_description,e621_post_id) VALUES
        (801,101,102,'https://static1.e621.net/data/current.jpg','current-thumb','Current',20),
        (802,101,null,'https://static1.e621.net/data/other.jpg','other-thumb','Other',30),
        (803,101,102,'private','private-thumb','private-description',40),(804,104,102,'deleted',null,null,null);
      UPDATE links SET friends_only=true WHERE id=803;
      INSERT INTO friendships(id,sender_id,receiver_id,confirmed) VALUES (1,101,102,true),(2,101,103,false);
      INSERT INTO leashes(friendship_id,master_id,pet_id,flair) VALUES (1,102,101,'Test flair');
    `);
    url.username = 'reaction_reader'; url.password = 'test';
    reader = new pg.Pool({ connectionString: url.href, options: '-c default_transaction_read_only=on' });
    url.username = 'reaction_writer'; writer = new pg.Pool({ connectionString: url.href, max: 3 });
    redis = createClient({ url: process.env.TEST_REDIS_URL }); await redis.connect();
    const store = createRedisStore(redis);
    const repository = createRepository(reader);
    const readUser = createUserReader({ pool: reader, repository, store, secretKeyBase: 'test', baseUrl: 'https://example.test' });
    const authenticate = createKeyAuthenticator(reader);
    const write = createReactionWriter(writer);
    const query = (sql, values) => admin.query(sql, values);
    const scalar = async (sql) => Number((await query(sql)).rows[0].value);

    await t.test('API-key authentication exposes active identity without key or email access', async () => {
      assert.equal(await authenticate('ownerkey'), '101');
      for (const key of ['', null, {}, 'wrong', 'deletedkey', "' OR 1=1"]) assert.equal(await authenticate(key), null);
      await assert.rejects(reader.query('SELECT api_key FROM users'), { code: '42501' });
      await assert.rejects(reader.query('SELECT email FROM users'), { code: '42501' });
      await assert.rejects(writer.query("SELECT public.walltaker_api_authenticate('ownerkey')"), { code: '42501' });
    });
    await t.test('anonymous, friend, nonfriend and self status preserve visibility and audience flags', async () => {
      await redis.zAdd('link:803:ws_client_leases', {score:Date.now()/1000,value:'test-socket'});
      for (const [viewerId, authenticated, friend, self, online] of [[null,false,undefined,undefined,false],
        ['102',true,true,false,true], ['103',true,false,false,false], ['101',true,false,true,false], ['104',false,undefined,undefined,false]]) {
        const status = await readUser({ username: 'Owner', viewerId });
        assert.equal(status.authenticated, authenticated); assert.equal(status.friend, friend);
        assert.equal(status.self, self); assert.equal(status.online, online);
        assert.deepEqual(status.links.map((row) => row.id), [801,802]);
        assert.equal(status.flair, 'Test flair'); assert.equal(status.master, 'Friend');
        assert.equal('set_by' in status.links[0], false); assert.equal('url' in status.links[0], false);
        for (const field of ['email','api_key','password_digest','deleted_at']) assert.equal(field in status, false);
      }
      assert.deepEqual((await readUser({ username: 'Friend' })).pets, ['Owner']);
      assert.equal(await readUser({ username: 'Deleted' }), null);
      assert.equal(await readUser({ username: 'Missing' }), null);
      await redis.del('link:803:ws_client_leases');
    });
    await t.test('status excludes expired links and reflects polling and widget online windows immediately', async () => {
      await query("UPDATE links SET never_expires=false,expires=now()-interval '1 second' WHERE id=802");
      await query("UPDATE links SET last_ping=now()-interval '5 minutes',last_ping_user_agent='widgetExtension' WHERE id=801");
      const status = await readUser({ username: 'Owner' });
      assert.equal(status.online,true); assert.deepEqual(status.links.map((row) => row.id),[801]);
      await query("UPDATE links SET last_ping=now()-interval '21 minutes' WHERE id=801");
      assert.equal((await readUser({ username: 'Owner' })).online,false);
      await query('UPDATE links SET last_ping=now(),last_ping_user_agent=NULL WHERE id=801');
      const agentless = await readUser({ username: 'Owner' });
      assert.equal(agentless.online,true);
      assert.equal(agentless.links[0].online,false);
    });
    await t.test('reaction, comments, notification and durable event commit together', async () => {
      const result = await write({ link_id:801, owner_id:101, type:'ok', text:'Thank you', request_key:'first' });
      assert.equal(result.replayed,false);
      assert.equal((await query('SELECT response_type,response_text FROM links WHERE id=801')).rows[0].response_type,3);
      const notification = (await query('SELECT * FROM notifications')).rows[0];
      assert.equal(notification.user_id,'102'); assert.equal(notification.notification_type,3);
      assert.equal(notification.text,'Owner says thanks "Thank you"');
      assert.deepEqual((await query('SELECT content FROM comments ORDER BY id')).rows.map((row) => row.content),
        ['> liked it https://static1.e621.net/data/current.jpg','Thank you']);
      assert.equal(await scalar('SELECT count(*) AS value FROM node_reaction_events'),1);
    });
    await t.test('concurrent idempotent retries cannot repeat comments or notifications', async () => {
      const input = { link_id:801, owner_id:101, type:'horny',text:'',request_key:'same-reaction' };
      const before = await scalar('SELECT count(*) AS value FROM comments');
      const [a,b] = await Promise.all([write(input), write(input)]);
      assert.equal(a.event_id,b.event_id); assert.equal([a,b].filter((row) => row.replayed).length,1);
      assert.equal(await scalar('SELECT count(*) AS value FROM comments'),before+1);
      await assert.rejects(write({ ...input,type:'ok' }), { status:409 });
    });
    await t.test('maximum-length Unicode responses fit comments and notification previews', async () => {
      const text = '😀'.repeat(255);
      await write({ link_id:801,type:'ok',text,request_key:'max-text' });
      assert.equal((await query('SELECT response_text FROM links WHERE id=801')).rows[0].response_text,text);
      const preview = (await query('SELECT text FROM notifications ORDER BY id DESC LIMIT 1')).rows[0].text;
      assert.equal(Array.from(preview).length,255);
    });
    await t.test('bad owner, deleted owner and stale wallpaper cannot create side effects', async () => {
      const before = await scalar('SELECT count(*) AS value FROM node_reaction_events');
      await assert.rejects(write({ link_id:801,owner_id:103,type:'ok' }), { status:403 });
      await assert.rejects(write({ link_id:804,type:'ok' }), { status:404 });
      await assert.rejects(write({ link_id:801,type:'ok',expected_post_url:'changed' }), { status:409 });
      assert.equal(await scalar('SELECT count(*) AS value FROM node_reaction_events'),before);
    });
    await t.test('tracker preserves the five-minute limit and current pledge behavior', async () => {
      await query("INSERT INTO site_settings VALUES ('nnn_enabled','true')");
      await query("INSERT INTO past_links(id,user_id,link_id,post_url) VALUES (1,101,801,'https://static1.e621.net/data/current.jpg')");
      await query('INSERT INTO nut_pledges(user_id,year) VALUES (101,EXTRACT(YEAR FROM now()))');
      await Promise.all([write({ link_id:801,type:'came',request_key:'tracker-a' }),write({ link_id:802,type:'came',request_key:'tracker-b' })]);
      assert.equal(await scalar('SELECT count(*) AS value FROM nuttracker_orgasms'),1);
      const orgasm = (await query('SELECT * FROM nuttracker_orgasms')).rows[0];
      assert.equal(orgasm.rating,3); assert.equal(orgasm.is_ruined,false);
      assert.ok((await query('SELECT failed_on FROM nut_pledges')).rows[0].failed_on);
    });
    await t.test('disgust removes matching history, clears references and restores the previous wallpaper', async () => {
      await query(`INSERT INTO past_links(id,user_id,link_id,set_by_id,post_url,post_thumbnail_url,e621_post_id,created_at) VALUES
        (2,101,801,102,'https://static1.e621.net/data/previous.jpg','previous-thumb',10,now()-interval '1 hour'),
        (3,101,801,102,'https://static1.e621.net/data/current.jpg','current-thumb',20,now());
        UPDATE nut_pledges SET past_link_id=3;`);
      const result = await write({ link_id:801,owner_id:101,type:'disgust',text:'No thanks',request_key:'revert',expected_post_url:'https://static1.e621.net/data/current.jpg' });
      const link = (await query('SELECT * FROM links WHERE id=801')).rows[0];
      assert.equal(link.post_url,'https://static1.e621.net/data/previous.jpg'); assert.equal(link.e621_post_id,'10');
      assert.equal(link.post_thumbnail_url,'previous-thumb'); assert.equal(link.response_type,2);
      assert.equal((await query('SELECT past_link_id FROM nut_pledges')).rows[0].past_link_id,null);
      assert.equal(await scalar("SELECT count(*) AS value FROM past_links WHERE post_url='https://static1.e621.net/data/current.jpg'"),0);
      assert.equal((await write({ link_id:801,owner_id:101,type:'disgust',text:'No thanks',request_key:'revert',expected_post_url:link.post_url })).event_id,result.event_id);
    });
    await t.test('no setter or previous wallpaper is handled without invalid activity records', async () => {
      const before = await scalar('SELECT count(*) AS value FROM notifications');
      await write({ link_id:802,type:'disgust',text:'',request_key:'empty-revert' });
      assert.equal((await query('SELECT post_url FROM links WHERE id=802')).rows[0].post_url,null);
      assert.equal(await scalar('SELECT count(*) AS value FROM notifications'),before);
      const count = await scalar('SELECT count(*) AS value FROM comments');
      await write({ link_id:802,type:'',text:'',request_key:'clear' });
      assert.equal((await query('SELECT response_type FROM links WHERE id=802')).rows[0].response_type,null);
      assert.equal(await scalar('SELECT count(*) AS value FROM comments'),count);
    });
    await t.test('an event failure rolls back all earlier side effects', async () => {
      const before = (await query('SELECT * FROM links WHERE id=801')).rows[0];
      const comments = await scalar('SELECT count(*) AS value FROM comments');
      const notifications = await scalar('SELECT count(*) AS value FROM notifications');
      const history = (await query('SELECT * FROM past_links ORDER BY id')).rows;
      await assert.rejects(write({ link_id:801,type:'disgust',text:'Must roll back',request_key:'force-event-failure' }),{ code:'23514' });
      assert.deepEqual((await query('SELECT * FROM links WHERE id=801')).rows[0],before);
      assert.equal(await scalar('SELECT count(*) AS value FROM comments'),comments);
      assert.equal(await scalar('SELECT count(*) AS value FROM notifications'),notifications);
      assert.deepEqual((await query('SELECT * FROM past_links ORDER BY id')).rows,history);
    });
    await t.test('database grants prevent account access, settings edits and forged delivery receipts', async () => {
      await assert.rejects(writer.query('SELECT api_key FROM users'),{ code:'42501' });
      await assert.rejects(writer.query("UPDATE site_settings SET value='false'"),{ code:'42501' });
      await assert.rejects(writer.query('UPDATE node_reaction_events SET delivered_at=now()'),{ code:'42501' });
      await assert.rejects(reader.query("UPDATE links SET response_text='bad'"),{ code:'25006' });
    });
  } finally {
    if (redis?.isOpen) { await redis.del('link:803:ws_client_leases'); await redis.close(); }
    await Promise.all([reader?.end(),writer?.end(),admin?.end(),bootstrap.end()]);
  }
});
