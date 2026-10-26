import assert from 'node:assert/strict';
import http from 'node:http';
import test, { before } from 'node:test';
import { setTimeout } from 'node:timers/promises';

before(async () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch('http://router:8080/ready');
      if (response.ok) return;
    } catch {}
    await setTimeout(100);
  }
  throw new Error('Router did not become ready');
});

test('routes wallpaper reads to Node preserving host, scheme and query', async () => {
  // fetch controls Host itself; use http.get to simulate an outer proxy.
  const result = await new Promise((resolve, reject) => {
    const request = http.get('http://router:8080/api/links/1.json?x=1', { headers: {
      host: 'walltaker.example', 'x-forwarded-proto': 'https', cookie: 'session=test',
    } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    request.on('error', reject);
  });
  assert.equal(result.path, '/api/links/1.json?x=1');
  assert.equal(result.backend, 'node');
  assert.equal(result.headers.host, 'walltaker.example');
  assert.equal(result.headers['x-forwarded-proto'], 'https');
  assert.equal(result.headers.cookie, 'session=test');
});

test('wallpaper/user APIs and browser pages route directly to their Node services', async () => {
  for (const path of ['/api/links.json?online', '/api/links/9/widget.json']) {
    assert.equal((await (await fetch('http://router:8080' + path)).json()).backend, 'node');
  }
  for (const [path, method] of [['/api/links/9/response.json', 'POST'], ['/api/links/9.json', 'POST'],
    ['/api/users/example.json', 'GET'], ['/links/9.json', 'GET']]) {
    assert.equal((await (await fetch('http://router:8080' + path, { method })).json()).backend, path.startsWith('/api/')?'node':'node-web');
  }
});

test('internal presence adapter cannot be reached through the public router', async () => {
  assert.equal((await fetch('http://router:8080/_internal/wallpaper-presence/9.json', { method: 'POST' })).status, 404);
});

test('uses HTTP for direct requests without forwarded scheme', async () => {
  const response = await fetch('http://router:8080/up');
  const result = await response.json();
  assert.equal(result.headers['x-forwarded-proto'], 'http');
});

test('routes media directly to Node without a fallback', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch('http://router:8080/e621-media?token=invalid', { method });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), '');
  }
  const response = await fetch('http://router:8080/e621-media?token=invalid', { method: 'POST' });
  assert.equal(response.status, 405);
});
