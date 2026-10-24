import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createApiServer } from '../src/app.js';
import { createPresenceReporter } from '../src/presence.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/rails.json', import.meta.url)));

async function setup(t, options = {}) {
  const reports = [];
  const queries = [];
  const server = createApiServer({
    ...fixture, logger: { warn() {}, error() {} },
    repository: {
      find: async (id) => id === String(fixture.row.id) ? fixture.row : null,
      list: async (query) => { queries.push(query); return [fixture.row]; }, health: async () => {},
    },
    store: { connected: async () => new Set(), onlineIds: async () => ['12'], limit: async () => 0, health: async () => {} },
    reportPresence: async (...args) => { reports.push(args); }, ...options,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return { base: `http://127.0.0.1:${server.address().port}`, reports, queries };
}

test('returns the legacy detail response and records client presence', async (t) => {
  const { base, reports } = await setup(t);
  const response = await fetch(`${base}/api/links/${fixture.row.id}.json`, { headers: { joihow: 'CustomClient/1' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), fixture.detail);
  assert.equal(reports[0][0], fixture.row.id);
  assert.equal(reports[0][1].joihow, 'CustomClient/1');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('listing treats online parameter presence as true and does not record a heartbeat', async (t) => {
  const { base, reports, queries } = await setup(t);
  const response = await fetch(`${base}/api/links.json?online=false`);
  assert.deepEqual(await response.json(), [fixture.listEntry]);
  assert.equal(queries[0].onlyOnline, true);
  assert.deepEqual(queries[0].onlineIds, ['12']);
  assert.equal(reports.length, 0);
});

test('widget and HEAD polling preserve heartbeat behavior', async (t) => {
  const { base, reports } = await setup(t);
  assert.deepEqual(await (await fetch(`${base}/api/links/${fixture.row.id}/widget.json`)).json(), fixture.widget);
  const head = await fetch(`${base}/api/links/${fixture.row.id}.json`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(reports.length, 2);
});

test('missing links, writes, and preflight do not cause a heartbeat', async (t) => {
  const { base, reports } = await setup(t);
  const missing = await fetch(`${base}/api/links/1.json`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { message: 'This link does not exist.' });
  assert.equal((await fetch(`${base}/api/links/1.json`, { method: 'POST' })).status, 405);
  const preflight = await fetch(`${base}/api/links/1.json`, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.equal(reports.length, 0);
});

test('presence failure does not turn a valid wallpaper into a 404', async (t) => {
  const { base } = await setup(t, { reportPresence: async () => { throw new Error('unavailable'); } });
  assert.equal((await fetch(`${base}/api/links/${fixture.row.id}.json`)).status, 200);
});

test('rate limiting stops the read before presence is recorded', async (t) => {
  const { base, reports } = await setup(t, { store: { limit: async () => 7 } });
  const response = await fetch(`${base}/api/links/${fixture.row.id}.json`);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '7');
  assert.equal(reports.length, 0);
});

test('database failures return a generic 503 instead of a missing-link response', async (t) => {
  const { base } = await setup(t, { repository: { find: async () => { throw new Error('database credentials'); } } });
  const response = await fetch(`${base}/api/links/1.json`);
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('credentials'), false);
});

test('presence adapter uses separate non-cookie credentials and only client identity headers', async () => {
  let sent;
  const report = createPresenceReporter({ secretKeyBase: fixture.secretKeyBase, railsUrl: 'http://web:3000',
    fetchImpl: async (url, options) => { sent = { url, options }; return new Response(null, { status: 204 }); } });
  await report(123, { cookie: 'session=secret', authorization: 'untrusted', 'user-agent': 'Client/1', joihow: 'Identity' });
  assert.equal(sent.url, 'http://web:3000/_internal/wallpaper-presence/123.json');
  assert.match(sent.options.headers.authorization, /^Bearer [0-9a-f]{64}$/);
  assert.equal(sent.options.headers.cookie, undefined);
  assert.equal(sent.options.headers['user-agent'], 'Client/1');
  assert.equal(sent.options.redirect, 'error');
});
