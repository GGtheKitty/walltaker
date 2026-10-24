import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApiServer } from '../src/app.js';
import { createSessionViewer, viewerToken } from '../src/auth.js';
import { createReactionWriter } from '../src/reactions.js';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/rails.json', import.meta.url)));

async function setup(t, options = {}) {
  const writes = [], users = [], cookies = [];
  const row = { ...fixture.row, user_id: '123' };
  const server = createApiServer({ ...fixture, logger: { error() {} },
    repository: { find: async (id) => id === String(row.id) ? row : null },
    store: { limit: async () => 0, connected: async () => new Set() },
    authenticateKey: async (key) => key === 'owner-key' ? '123' : key === 'other-key' ? '456' : null,
    sessionViewer: async (headers) => { cookies.push(headers.cookie); return headers.cookie === 'valid-cookie' ? '456' : null; },
    writeReaction: async (command) => { writes.push(command); },
    readUser: async (query) => { users.push(query); return query.username === 'Missing' ? null : query; },
    ...options,
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return { base: `http://127.0.0.1:${server.address().port}`, writes, users, cookies };
}

test('reaction API accepts owner keys in JSON, form bodies, and query parameters', async (t) => {
  const { base, writes } = await setup(t);
  const path = `/api/links/${fixture.row.id}/response.json`;
  const json = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'test-retry' },
    body: JSON.stringify({ api_key: 'owner-key', type: 'ok', text: 'Thanks' }) });
  assert.equal(json.status, 200);
  const expected = { ...fixture.detail }; delete expected.url;
  assert.deepEqual(await json.json(), expected);
  assert.equal(writes[0].owner_id, '123');
  assert.equal(writes[0].request_key, 'test-retry');
  const form = await fetch(base + path, { method: 'POST', body: new URLSearchParams({ api_key: 'owner-key', type: 'came', text: 'Test' }) });
  assert.equal(form.status, 200); assert.equal(writes[1].type, 'came');
  assert.equal((await fetch(base + path + '?api_key=owner-key', { method: 'POST' })).status, 200);
  assert.equal(writes[2].type, 'horny'); assert.equal(writes[2].text, '');
});

test('missing, wrong, other-account keys and browser cookies cannot authorize reactions', async (t) => {
  const { base, writes } = await setup(t);
  for (const key of ['', 'invalid', 'other-key']) {
    const response = await fetch(`${base}/api/links/${fixture.row.id}/response.json?api_key=${key}`, {
      method: 'POST', headers: { cookie: 'valid-cookie' },
    });
    assert.equal(response.status, 403);
  }
  assert.equal((await fetch(base + '/api/links/1/response.json?api_key=owner-key', { method: 'POST' })).status, 404);
  assert.equal(writes.length, 0);
});

test('reaction API rejects malformed, oversized and unsupported bodies before writing', async (t) => {
  const { base, writes } = await setup(t);
  const path = `/api/links/${fixture.row.id}/response.json?api_key=owner-key`;
  for (const [body, status] of [['{', 400], ['[]', 400], ['null', 400], [' '.repeat(65537), 413]]) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(response.status, status);
  }
  assert.equal((await fetch(base + path, { method: 'POST', body: 'text/plain' })).status, 415);
  assert.equal(writes.length, 0);
});

test('user-status authenticates keys and cookies with invalid-key precedence', async (t) => {
  const { base, users, cookies } = await setup(t);
  for (const [query, cookie, expected] of [['', '', null], ['', 'valid-cookie', '456'],
    ['?api_key=owner-key', 'valid-cookie', '123'], ['?api_key=invalid', 'valid-cookie', null], ['?api_key=', 'valid-cookie', '456']]) {
    const response = await fetch(base + '/api/users/Example.json' + query, { headers: { cookie } });
    assert.equal(response.status, 200); assert.equal((await response.json()).viewerId, expected);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('vary'), 'Cookie');
  }
  assert.equal(users.length, 5); assert.equal(cookies.length, 3);
  assert.equal((await fetch(base + '/api/users/Missing.json')).status, 404);
});

test('new endpoints preserve HEAD and preflight and reject unsupported methods', async (t) => {
  const { base, writes } = await setup(t);
  assert.equal((await fetch(base + '/api/users/Example.json', { method: 'HEAD' })).status, 200);
  const path = `/api/links/${fixture.row.id}/response.json`;
  const options = await fetch(base + path, { method: 'OPTIONS' });
  assert.equal(options.status, 204);
  assert.match(options.headers.get('access-control-allow-headers'), /Idempotency-Key/);
  assert.equal((await fetch(base + path)).status, 405);
  assert.equal((await fetch(base + '/api/users/Example.json', { method: 'POST' })).status, 405);
  assert.equal(writes.length, 0);
});

test('session viewer forwards only cookies with its own service credential', async () => {
  let sent;
  const resolve = createSessionViewer({ secretKeyBase: 'test', railsUrl: 'http://web', fetchImpl: async (url, options) => {
    sent = { url, options }; return Response.json({ user_id: 123 });
  } });
  assert.equal(await resolve({}), null);
  assert.equal(await resolve({ cookie: 'session', authorization: 'bad', 'user-agent': 'private' }), 123);
  assert.equal(sent.url, 'http://web/_internal/api-viewer.json');
  assert.deepEqual(sent.options.headers, { authorization: `Bearer ${viewerToken('test')}`, cookie: 'session' });
  assert.equal(sent.options.redirect, 'error');
  const unavailable = createSessionViewer({ secretKeyBase: 'test', railsUrl: 'http://web', fetchImpl: async () => new Response(null, { status: 503 }) });
  await assert.rejects(unavailable({ cookie: 'session' }));
});

test('invalid reaction types, IDs, keys and long text fail before database access', async () => {
  const write = createReactionWriter({ connect: () => assert.fail('Invalid input reached SQL') });
  for (const changes of [{ type: 'bad' }, { type: 4 }, { type: {} }, { link_id: '1 OR 1=1' },
    { request_key: 'bad key' }, { text: '😀'.repeat(256) }, { text: {} }]) {
    await assert.rejects(write({ link_id: '1', type: 'ok', text: '', ...changes }), { status: 400 });
  }
});
