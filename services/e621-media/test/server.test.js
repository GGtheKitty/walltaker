import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { createMediaServer } from '../src/server.js';
import { fixture } from './helpers.js';

const mediaPath = `/e621-media?token=${encodeURIComponent(fixture.token)}`;
const logger = { warn() {} };

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function setup(t, handler, options = {}) {
  const requests = [];
  const origin = await listen(t, http.createServer((req, res) => {
    requests.push(req);
    handler(req, res);
  }));
  const proxy = createMediaServer({
    secretKeyBase: fixture.secretKeyBase,
    userAgent: 'Walltaker-test (by test on e621)',
    logger,
    upstreamRequest: (source, requestOptions, callback) => {
      assert.equal(source.href, fixture.source);
      return http.request(new URL(source.pathname, origin), requestOptions, callback);
    },
    ...options,
  });
  return { base: await listen(t, proxy), requests };
}

test('streams media with expected headers and does not forward credentials', async (t) => {
  const { base, requests } = await setup(t, (req, res) => {
    res.writeHead(200, {
      'content-type': 'image/jpeg', 'content-length': 6, 'accept-ranges': 'bytes',
      etag: '"abc"', 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
      'set-cookie': 'upstream=secret', 'x-private-header': 'hidden',
    });
    res.write('abc');
    setTimeout(() => res.end('def'), 10);
  });
  const response = await fetch(base + mediaPath, { headers: {
    cookie: 'session=secret', authorization: 'Bearer secret', 'user-agent': 'untrusted',
  } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'abcdef');
  assert.equal(response.headers.get('content-length'), '6');
  assert.equal(response.headers.get('etag'), '"abc"');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('content-disposition'), 'inline');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-private-header'), null);
  assert.equal(requests[0].headers.cookie, undefined);
  assert.equal(requests[0].headers.authorization, undefined);
  assert.equal(requests[0].headers['user-agent'], 'Walltaker-test (by test on e621)');
  assert.equal(requests[0].headers.referer, 'https://e621.net/');
});

test('forwards HEAD without a response body', async (t) => {
  const { base, requests } = await setup(t, (req, res) => {
    res.writeHead(200, { 'content-length': 123, 'content-type': 'video/webm' });
    res.end();
  });
  const response = await fetch(base + mediaPath, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '123');
  assert.equal(await response.text(), '');
  assert.equal(requests[0].method, 'HEAD');
});

test('preserves byte ranges, If-Range, and partial content', async (t) => {
  const { base, requests } = await setup(t, (req, res) => {
    res.writeHead(206, { 'content-range': 'bytes 2-4/6', 'content-length': 3, 'accept-ranges': 'bytes' });
    res.end('cde');
  });
  const response = await fetch(base + mediaPath, { headers: { range: 'bytes=2-4', 'if-range': '"abc"' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 2-4/6');
  assert.equal(await response.text(), 'cde');
  assert.equal(requests[0].headers.range, 'bytes=2-4');
  assert.equal(requests[0].headers['if-range'], '"abc"');
});

test('rejects missing, tampered, duplicate tokens and unsupported methods before reaching upstream', async (t) => {
  const { base, requests } = await setup(t, () => assert.fail('Unexpected upstream request'));
  for (const path of ['/e621-media', '/e621-media?token=bad', `${mediaPath}x`, `${mediaPath}&token=bad`, '/unknown']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  const post = await fetch(base + mediaPath, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  assert.equal((await fetch(base + '/up')).status, 200);
  assert.equal(requests.length, 0);
});

test('does not follow upstream redirects or expose upstream error bodies', async (t) => {
  for (const status of [302, 403, 404, 429, 500]) {
    await t.test(String(status), async (t) => {
      const { base, requests } = await setup(t, (req, res) => {
        res.writeHead(status, { location: 'http://127.0.0.1/private' });
        res.end('private upstream error');
      });
      const response = await fetch(base + mediaPath, { redirect: 'manual' });
      assert.equal(response.status, status);
      assert.equal(await response.text(), 'Upstream media request failed.');
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(requests.length, 1);
    });
  }
});

test('preserves unsatisfiable range information', async (t) => {
  const { base } = await setup(t, (req, res) => {
    res.writeHead(416, { 'content-range': 'bytes */6' });
    res.end();
  });
  const response = await fetch(base + mediaPath);
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('content-range'), 'bytes */6');
});

test('turns connection failures and timeouts into 502', async (t) => {
  await t.test('connection reset', async (t) => {
    const { base } = await setup(t, (req) => req.socket.destroy());
    assert.equal((await fetch(base + mediaPath)).status, 502);
  });
  await t.test('no response headers', async (t) => {
    const { base } = await setup(t, () => {}, { openTimeout: 30 });
    assert.equal((await fetch(base + mediaPath)).status, 502);
  });
  await t.test('stalled body is terminated', async (t) => {
    const { base } = await setup(t, (req, res) => {
      res.writeHead(200, { 'content-length': 100 });
      res.write('partial');
    }, { readTimeout: 30 });
    const response = await fetch(base + mediaPath);
    await assert.rejects(response.text());
  });
});

test('client disconnect cancels the upstream download', { timeout: 2000 }, async (t) => {
  let closed;
  const disconnected = new Promise((resolve) => { closed = resolve; });
  const { base } = await setup(t, (req, res) => {
    res.on('close', closed);
    res.writeHead(200);
    res.write('first chunk');
  });
  await new Promise((resolve, reject) => {
    const request = http.get(base + mediaPath, (response) => {
      response.once('data', () => { response.destroy(); resolve(); });
    });
    request.on('error', reject);
  });
  await disconnected;
});
