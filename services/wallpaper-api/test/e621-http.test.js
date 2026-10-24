import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createApiServer } from '../src/app.js';
import { createE621Handler, e621Token } from '../src/e621-handler.js';
import { commandToken } from '../src/internal.js';

async function setup(t) {
  const calls = [];
  const service = Object.fromEntries(['query', 'search', 'select', 'post'].map((operation) => [operation, async (input) => {
    calls.push({ operation, input }); return { operation };
  }]));
  const server = createApiServer({ secretKeyBase: 'test', baseUrl: 'https://example.test',
    e621Handler: createE621Handler({ secretKeyBase: 'test', service }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return { base: `http://127.0.0.1:${server.address().port}/_internal/e621`, calls,
    headers: { authorization: `Bearer ${e621Token('test')}`, 'content-type': 'application/json' } };
}

test('e621 operations use their own service credential and never accept browser or wallpaper credentials', async (t) => {
  const { base, calls } = await setup(t);
  for (const authorization of ['', 'Bearer bad', `Bearer ${commandToken('test')}`]) {
    assert.equal((await fetch(base + '/search', { method: 'POST', headers: { authorization, cookie: 'valid-session' }, body: '{}' })).status, 403);
  }
  assert.equal(calls.length, 0);
});

test('all four authenticated operations reach the e621 service', async (t) => {
  const { base, headers, calls } = await setup(t);
  for (const operation of ['query', 'search', 'select', 'post']) {
    const response = await fetch(base + '/' + operation, { method: 'POST', headers, body: JSON.stringify({ tags: 'fox', post_id: 123 }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('x-walltaker-backend'), 'node-e621');
    assert.deepEqual(await response.json(), { operation });
  }
  assert.equal(calls.length, 4);
});

test('invalid JSON, body size, method, content type and operation never reach the service', async (t) => {
  const { base, headers, calls } = await setup(t);
  for (const [body, status] of [['{', 400], ['[]', 400], ['x'.repeat(65537), 413]]) {
    assert.equal((await fetch(base + '/search', { method: 'POST', headers, body })).status, status);
  }
  assert.equal((await fetch(base + '/search', { headers })).status, 405);
  assert.equal((await fetch(base + '/unknown', { method: 'POST', headers, body: '{}' })).status, 404);
  assert.equal((await fetch(base + '/search', { method: 'POST', headers: { authorization: headers.authorization }, body: '{}' })).status, 415);
  assert.equal(calls.length, 0);
});
