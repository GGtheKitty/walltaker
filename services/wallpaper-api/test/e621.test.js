import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createE621Service } from '../src/e621.js';
import { buildSearch } from '../src/e621-policy.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/e621.json', import.meta.url)));
const policy = { blacklist: '', theme: '', min_score: 0, can_show_videos: false, is_kink_aligned: false, kinks: [] };
const post = (id, ext = 'jpg', url = `https://static1.e621.net/data/test/${id}.${ext}`) =>
  ({ id, file: { ext, url }, preview: { url: `https://static1.e621.net/data/preview/${id}.jpg` } });

function store() {
  return {
    data: new Map(), writes: [], pauses: [], slots: 0,
    async get(key) { return this.data.get(key) ?? null; },
    async set(key, value, ttl) { this.writes.push({ key, value, ttl }); this.data.set(key, value); },
    async takeSlot() { this.slots++; return 0; },
    async pause(wait) { this.pauses.push(wait); },
  };
}

test('Node query construction matches the actual Rails builder across all contract fixtures', () => {
  for (const fixture of fixtures) assert.deepEqual(buildSearch(fixture.input), fixture.expected);
});

test('malformed policies, pagination and limits are rejected before upstream requests', () => {
  for (const input of [null, [], { tags: [] }, { limit: 151 }, { limit: 0 }, { after: '1&tags=bad' },
    { before: '0' }, { policy: {} }, { policy: { ...policy, can_show_videos: 'false' } },
    { policy: { ...policy, min_score: -1 } }, { policy: { ...policy, kinks: [null] } }]) {
    assert.throws(() => buildSearch(input), { status: 422 });
  }
});

test('requests use fixed endpoints, encoded queries, configured identity, and no credentials or redirects', async () => {
  let sent;
  const service = createE621Service({ store: store(), userAgent: 'Walltaker-test', fetchImpl: async (url, options) => {
    sent = { url, options }; return Response.json({ posts: [post(1)] });
  } });
  await service.search({ tags: 'fox &page=evil', after: '123', limit: 15, policy });
  const url = new URL(sent.url);
  assert.equal(url.origin, 'https://e621.net'); assert.equal(url.pathname, '/posts.json');
  assert.equal(url.searchParams.get('page'), 'b123');
  assert.match(url.searchParams.get('tags'), /&page=evil/);
  assert.deepEqual(sent.options.headers, { 'user-agent': 'Walltaker-test', accept: 'application/json' });
  assert.equal(sent.options.redirect, 'error'); assert.ok(sent.options.signal);
});

test('image-only links stay filtered on cache hits and cannot share caches with video-enabled searches', async () => {
  const cache = store(); let calls = 0;
  const service = createE621Service({ store: cache, userAgent: 'test', fetchImpl: async () => {
    calls++; return Response.json({ posts: [post(1), post(2, 'mp4'), post(3, 'gif'), post(4, 'webp')] });
  } });
  for (let i = 0; i < 2; i++) assert.deepEqual((await service.search({ tags: 'fox', policy })).map((p) => p.id), [1, 4]);
  assert.equal(calls, 1);
  assert.deepEqual((await service.search({ tags: 'fox', policy: { ...policy, can_show_videos: true } })).map((p) => p.id), [1, 2, 3, 4]);
  assert.equal(calls, 2);
  assert.equal(cache.writes[0].ttl, 2700);
  assert.deepEqual(cache.writes[0].value.map((p) => p.id), [1, 4]);
});

test('random, empty and paginated searches have appropriate cache lifetimes and separate keys', async () => {
  const cache = store(); let calls = 0;
  const service = createE621Service({ store: cache, userAgent: 'test', fetchImpl: async () => {
    calls++; return Response.json({ posts: calls === 2 ? [] : [post(1)] });
  } });
  await service.search({ tags: 'order:random', policy });
  await service.search({ tags: 'empty', policy });
  await service.search({ tags: 'empty', policy });
  await service.search({ tags: 'order:random', after: '100', policy });
  assert.equal(calls, 3); assert.deepEqual(cache.writes.map((row) => row.ttl), [60, 60, 60]);
  assert.equal(new Set(cache.writes.map((row) => row.key)).size, 3);
});

test('concurrent identical requests share one upstream request', async () => {
  const cache = store(); let calls = 0;
  const service = createE621Service({ store: cache, userAgent: 'test', fetchImpl: async () => {
    calls++; return Response.json({ posts: [post(1)] });
  } });
  const results = await Promise.all(Array.from({ length: 10 }, () => service.search({ tags: 'fox', policy })));
  assert.equal(calls, 1); assert.equal(cache.slots, 1); assert.equal(results.length, 10);
});

test('post selection reapplies the full policy and refuses mismatched IDs and unavailable media', async () => {
  const urls = [];
  const service = createE621Service({ store: store(), userAgent: 'test', fetchImpl: async (url) => {
    urls.push(new URL(url)); return Response.json({ posts: [post(123), post(456, 'jpg', null), post(789, 'mp4')] });
  } });
  assert.equal((await service.select({ post_id: 123, policy: { ...policy, theme: 'forest', blacklist: 'gore', min_score: 50 } })).id, 123);
  assert.match(urls[0].searchParams.get('tags'), /id:123 -flash forest -gore score:>50 -animated/);
  assert.equal(urls[0].searchParams.get('limit'), '1');
  assert.equal(await service.select({ post_id: 456, policy }), null);
  assert.equal(await service.select({ post_id: 789, policy }), null);
  assert.equal(await service.select({ post_id: 999, policy }), null);
  await assert.rejects(service.select({ post_id: '123 order:random', policy }), { status: 422 });
});

test('post metadata is cached in Node and missing IDs use a short negative cache', async () => {
  const cache = store(); const urls = [];
  const service = createE621Service({ store: cache, userAgent: 'test', fetchImpl: async (url) => {
    urls.push(url); return url.includes('/404.json') ? new Response(null, { status: 404 }) : Response.json({ post: post(123) });
  } });
  for (let i = 0; i < 2; i++) assert.equal((await service.post({ post_id: 123 })).post.id, 123);
  for (let i = 0; i < 2; i++) assert.deepEqual(await service.post({ post_id: 404 }), { post: null });
  assert.deepEqual(urls, ['https://e621.net/posts/123.json', 'https://e621.net/posts/404.json']);
  assert.deepEqual(cache.writes.map((row) => row.ttl), [2700, 60]);
});

test('shared request gate waits without exceeding the queue deadline', async () => {
  let time = 1000; let calls = 0;
  const waits = [400, 300, 0, 9000]; const cache = store();
  cache.takeSlot = async () => waits.shift();
  const service = createE621Service({ store: cache, userAgent: 'test', now: () => time, sleep: async (wait) => { time += wait; },
    fetchImpl: async () => { calls++; return Response.json({ posts: [] }); } });
  await service.search({ tags: 'a' }); assert.equal(time, 1700); assert.equal(calls, 1);
  await assert.rejects(service.search({ tags: 'b' }), { status: 503 }); assert.equal(calls, 1);
});

test('upstream throttling pauses other consumers, does not retry, and is not cached as an empty result', async () => {
  const cache = store(); let calls = 0;
  const service = createE621Service({ store: cache, userAgent: 'test', fetchImpl: async () => {
    calls++; return calls === 1 ? new Response(null, { status: 429, headers: { 'retry-after': '2' } }) : Response.json({ posts: [post(1)] });
  } });
  await assert.rejects(service.search({ tags: 'fox' }), { status: 503 });
  assert.equal(calls, 1); assert.deepEqual(cache.pauses, [2000]); assert.equal(cache.data.size, 0);
  assert.equal((await service.search({ tags: 'fox' }))[0].id, 1);
});

test('malformed, oversized, redirected and failed upstream responses fail without unsafe results', async () => {
  for (const [response, maxBytes] of [[() => new Response('not JSON'), 1024], [() => Response.json({ error: 'bad' }), 1024],
    [() => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }), 1024],
    [() => new Response('too big for four bytes'), 4], [() => { throw new Error('private network detail'); }, 1024]]) {
    const cache = store();
    const service = createE621Service({ store: cache, userAgent: 'test', maxBytes, fetchImpl: async () => response() });
    await assert.rejects(service.search({ tags: 'fox' }), { status: 503, message: 'e621 search temporarily unavailable.' });
    assert.equal(cache.writes.length, 0);
  }
});

test('Redis failures fail closed and never bypass the shared request gate', async () => {
  const cache = store(); cache.takeSlot = async () => { throw new Error('Redis down'); };
  const service = createE621Service({ store: cache, userAgent: 'test', fetchImpl: async () => assert.fail('Gate bypassed') });
  await assert.rejects(service.search({ tags: 'fox' }), { status: 503 });
});
