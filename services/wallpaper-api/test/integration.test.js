import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { createClient } from 'redis';
import { createRepository } from '../src/repository.js';
import { createRedisStore } from '../src/redis.js';
import { createWallpaperWriter } from '../src/updates.js';
import { createHistoryReader } from '../src/history.js';
import { setTimeout } from 'node:timers/promises';

test('real PostgreSQL filtering, read permissions, Redis presence and rate limits', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const redis = createClient({ url: process.env.TEST_REDIS_URL });
  await redis.connect();
  let reader;
  let writer;
  try {
    await admin.query(`
      CREATE TABLE users (id bigint PRIMARY KEY, username text, deleted_at timestamptz, email text,
        set_count integer NOT NULL DEFAULT 0, updated_at timestamptz);
      CREATE TABLE links (id bigint PRIMARY KEY, user_id bigint, set_by_id bigint, expires timestamptz,
        never_expires boolean, friends_only boolean, terms text, blacklist text, post_url text,
        post_thumbnail_url text, created_at timestamptz, updated_at timestamptz, response_type integer,
        response_text text, post_description text, last_ping timestamptz, last_ping_user_agent text,
        theme text, min_score integer, e621_post_id bigint);
      INSERT INTO users (id,username,deleted_at,email) VALUES (1, 'Active', null, 'private@example.test'), (2, 'Deleted', now(), 'deleted@example.test');
      INSERT INTO links (id,user_id,never_expires,friends_only,last_ping,last_ping_user_agent) VALUES
        (1,1,true,false,now(),'Client'), (2,1,true,true,null,null), (3,2,true,false,null,null),
        (4,1,false,false,null,null), (5,1,true,false,now()-interval '5 minutes','widgetExtension'),
        (6,1,true,false,null,null), (7,1,true,false,now()-interval '21 minutes','widgetExtension');
      UPDATE links SET expires = now()-interval '1 day' WHERE id = 4;
      CREATE ROLE node_reader LOGIN PASSWORD 'test';
      GRANT USAGE ON SCHEMA public TO node_reader;
      GRANT SELECT (id,username,deleted_at) ON users TO node_reader;
      GRANT SELECT ON links TO node_reader;
    `);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.username = 'node_reader'; url.password = 'test';
    reader = new pg.Pool({ connectionString: url.href, options: '-c default_transaction_read_only=on', max: 1 });
    const repository = createRepository(reader);
    const store = createRedisStore(redis);
    const now = Date.now();
    await t.test('deleted owners are hidden, individual private and expired links remain retrievable', async () => {
      assert.equal(await repository.find('3'), null);
      assert.equal((await repository.find('2')).id, '2');
      assert.equal((await repository.find('4')).id, '4');
      assert.equal(await repository.find("1' OR 1=1"), null);
      assert.equal(await repository.find('999999999999999999999'), null);
    });
    await t.test('listing excludes private, deleted and expired links', async () => {
      const rows = await repository.list({ onlyOnline: false, onlineIds: [], now });
      assert.deepEqual(rows.map((row) => row.id).sort(), ['1', '5', '6', '7']);
    });
    await t.test('online listing includes polling, iOS grace period and live WebSocket clients', async () => {
      await redis.zAdd('link:6:ws_client_leases', {score:Date.now()/1000,value:'socket'});
      const onlineIds = await store.onlineIds();
      assert.deepEqual(onlineIds, ['6']);
      assert.deepEqual(await store.connected(['1', '6']), new Set(['6']));
      const rows = await repository.list({ onlyOnline: true, onlineIds, now });
      assert.deepEqual(rows.map((row) => row.id).sort(), ['1', '5', '6']);
      await redis.del('link:6:ws_client_leases');
      assert.deepEqual(await store.onlineIds(), []);
    });
    await t.test('listing retains the maximum of 100 entries', async () => {
      await admin.query('INSERT INTO links(id,user_id,never_expires,friends_only) SELECT generate_series(100,210),1,true,false');
      assert.equal((await repository.list({ onlyOnline: false, onlineIds: [], now })).length, 100);
    });
    await t.test('database session and column grants prevent writes and private user data access', async () => {
      await assert.rejects(reader.query("UPDATE links SET terms = 'bad'"), { code: '25006' });
      await reader.query('SET default_transaction_read_only = off');
      await assert.rejects(reader.query("UPDATE links SET terms = 'bad'"), { code: '42501' });
      await assert.rejects(reader.query('SELECT email FROM users'), { code: '42501' });
    });
    await t.test('poll limits are per client and link and reset with the next window', async () => {
      const time = 100000;
      for (let i = 0; i < 3; i++) assert.equal(await store.limit('client-one', '/api/links/1.json', time), 0);
      assert.equal(await store.limit('client-one', '/api/links/1.json', time), 10);
      assert.equal(await store.limit('client-two', '/api/links/1.json', time), 0);
      assert.equal(await store.limit('client-one', '/api/links/2.json', time), 0);
      assert.equal(await store.limit('client-one', '/api/links/1.json', time + 10000), 0);
    });
    await admin.query(`
      CREATE TABLE past_links (id bigserial PRIMARY KEY, link_id bigint, user_id bigint, set_by_id bigint,
        e621_post_id bigint, post_url text, post_thumbnail_url text, tags text NOT NULL CHECK(tags <> 'force_failure'),
        ahoy_visit_id bigint, created_at timestamptz, updated_at timestamptz);
      CREATE TABLE node_wallpaper_events (id bigserial PRIMARY KEY, request_key varchar(160) UNIQUE NOT NULL,
        payload_digest varchar(64) NOT NULL, link_id bigint NOT NULL, past_link_id bigint NOT NULL,
        delivered_at timestamptz, delivery_attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at timestamptz, updated_at timestamptz);
      INSERT INTO users(id,username) VALUES (3,'Setter');
      INSERT INTO links(id,user_id,never_expires,friends_only,blacklist,theme,min_score,response_type,response_text)
        VALUES (30001,1,true,false,'','',0,1,'old response');
      GRANT SELECT ON past_links TO node_reader;
      CREATE ROLE node_writer LOGIN PASSWORD 'test';
      GRANT USAGE ON SCHEMA public TO node_writer;
      GRANT SELECT (id,user_id,blacklist,theme,min_score,friends_only,never_expires,expires) ON links TO node_writer;
      GRANT UPDATE (e621_post_id,post_url,post_thumbnail_url,post_description,set_by_id,response_type,response_text,updated_at) ON links TO node_writer;
      GRANT SELECT (id,deleted_at,set_count), UPDATE (set_count,updated_at) ON users TO node_writer;
      GRANT INSERT, SELECT(id), DELETE ON past_links TO node_writer;
      GRANT USAGE ON SEQUENCE past_links_id_seq,node_wallpaper_events_id_seq TO node_writer;
      GRANT SELECT, INSERT ON node_wallpaper_events TO node_writer;
      GRANT UPDATE (delivery_attempts,available_at,updated_at) ON node_wallpaper_events TO node_writer;
    `);
    url.username = 'node_writer';
    writer = new pg.Pool({ connectionString: url.href, max: 3 });
    const write = createWallpaperWriter(writer);
    const command = (key, changes = {}) => ({
      request_key: key, link_id: '30001', post_id: '123', set_by_id: '3', ahoy_visit_id: null,
      post_url: 'https://static1.e621.net/data/ab/cd/0123456789abcdef0123456789abcdef.jpg',
      post_thumbnail_url: 'https://static1.e621.net/data/sample/test.jpg', post_description: 'Test',
      tags: 'example rating:s', count_self: false,
      expected_policy: { user_id: '1', blacklist: '', theme: '', min_score: 0, friends_only: false, never_expires: true, expires: null },
      ...changes,
    });
    const scalar = async (sql) => Number((await admin.query(sql)).rows[0].value);
    await t.test('wallpaper, history, counter and durable event commit together', async () => {
      const result = await write(command('first'));
      assert.equal(result.replayed, false);
      const saved = (await admin.query('SELECT * FROM links WHERE id=30001')).rows[0];
      assert.equal(saved.e621_post_id, '123');
      assert.equal(saved.response_type, null);
      assert.equal(saved.response_text, null);
      const past = (await admin.query('SELECT * FROM past_links WHERE id=$1', [result.past_link_id])).rows[0];
      assert.equal(past.e621_post_id, '123');
      assert.equal(past.set_by_id, '3');
      assert.equal(await scalar('SELECT set_count AS value FROM users WHERE id=3'), 1);
      assert.equal(await scalar('SELECT count(*) AS value FROM node_wallpaper_events WHERE delivered_at IS NULL'), 1);
    });
    await t.test('concurrent retries record exactly one history entry and setter credit', async () => {
      const before = await scalar('SELECT count(*) AS value FROM past_links');
      const [a,b] = await Promise.all([write(command('retry')), write(command('retry'))]);
      assert.equal(a.event_id, b.event_id);
      assert.equal([a.replayed,b.replayed].filter(Boolean).length, 1);
      assert.equal(await scalar('SELECT count(*) AS value FROM past_links'), before + 1);
      assert.equal(await scalar('SELECT set_count AS value FROM users WHERE id=3'), 2);
      await assert.rejects(write(command('retry', { post_id: '456' })), { status: 409 });
    });
    await t.test('different concurrent wallpaper changes do not lose setter credits', async () => {
      await Promise.all([write(command('concurrent-a')), write(command('concurrent-b'))]);
      assert.equal(await scalar('SELECT set_count AS value FROM users WHERE id=3'), 4);
    });
    await t.test('a history failure rolls back the wallpaper and every other effect', async () => {
      const before = (await admin.query('SELECT * FROM links WHERE id=30001')).rows[0];
      const count = await scalar('SELECT count(*) AS value FROM past_links');
      await assert.rejects(write(command('failed', { post_id: '999', tags: 'force_failure' })), { code: '23514' });
      assert.deepEqual((await admin.query('SELECT * FROM links WHERE id=30001')).rows[0], before);
      assert.equal(await scalar('SELECT count(*) AS value FROM past_links'), count);
      assert.equal(await scalar('SELECT count(*) AS value FROM node_wallpaper_events WHERE request_key=\'failed\''), 0);
      assert.equal(await scalar('SELECT set_count AS value FROM users WHERE id=3'), 4);
    });
    await t.test('changed filters, deleted owners and deleted setters cannot be written', async () => {
      await assert.rejects(write(command('changed', { expected_policy: { ...command('x').expected_policy, blacklist: 'changed' } })), { status: 409 });
      await assert.rejects(write(command('deleted-owner', { link_id: '3' })), { status: 404 });
      await assert.rejects(write(command('deleted-setter', { set_by_id: '2' })), { status: 422 });
    });
    await t.test('anonymous and self sets preserve the existing counter rules', async () => {
      await write(command('anon', { set_by_id: null }));
      await write(command('self', { set_by_id: '1' }));
      assert.equal(await scalar('SELECT set_count AS value FROM users WHERE id=1'), 0);
      await write(command('bot-self', { set_by_id: '1', count_self: true }));
      assert.equal(await scalar('SELECT set_count AS value FROM users WHERE id=1'), 1);
    });
    await t.test('history is newest-first, scoped to recipient or setter, with bounded limits', async () => {
      const history = createHistoryReader(reader);
      const received = await history({ userId: '1', limit: '5' });
      assert.equal(received.length, 5);
      assert.ok(BigInt(received[0].id) > BigInt(received[1].id));
      const sent = await history({ userId: '3', kind: 'sent' });
      assert.equal(sent.length, 4);
      assert.equal(sent[0].set_by_username, 'Setter');
      assert.equal(sent.every((row) => row.set_by_id === '3'), true);
      await assert.rejects(history({ userId: '1', limit: '51' }), { status: 422 });
      await assert.rejects(history({ userId: '2' }), { status: 404 });
    });
    await t.test('writer cannot edit permissions, delete accounts, read secrets or acknowledge delivery', async () => {
      await assert.rejects(writer.query("UPDATE links SET blacklist='bad' WHERE id=30001"), { code: '42501' });
      await assert.rejects(writer.query('SELECT email FROM users'), { code: '42501' });
      await assert.rejects(writer.query('DELETE FROM users'), { code: '42501' });
      await assert.rejects(writer.query('UPDATE node_wallpaper_events SET delivered_at=now()'), { code: '42501' });
    });
  } finally {
    await Promise.all([admin.end(), reader?.end(), writer?.end(), redis.close()]);
  }
});
