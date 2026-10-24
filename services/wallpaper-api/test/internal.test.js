import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createInternalHandler, commandToken } from '../src/internal.js';
import { createWallpaperWriter } from '../src/updates.js';

async function setup(t) {
  const writes = [];
  const reads = [];
  const handler = createInternalHandler({ secretKeyBase: 'test-secret',
    writeWallpaper: async (body) => { writes.push(body); return { event_id: '1' }; },
    readHistory: async (query) => { reads.push(query); return [{ id: '2' }]; },
  });
  const server = http.createServer((req,res) => handler(req,res,new URL(req.url,'http://localhost')).catch(() => { res.writeHead(503); res.end(); }));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return { base: `http://127.0.0.1:${server.address().port}`, writes, reads,
    headers: { authorization: `Bearer ${commandToken('test-secret')}`, 'content-type': 'application/json' } };
}

test('internal writes and histories require the separate Node command credential', async (t) => {
  const { base, writes, reads } = await setup(t);
  for (const authorization of ['', 'Bearer invalid']) {
    const response = await fetch(base + '/_internal/wallpaper-updates', {
      method: 'POST', headers: { authorization, cookie: 'authenticated-browser-session' }, body: '{}',
    });
    assert.equal(response.status,403);
  }
  assert.equal((await fetch(base + '/_internal/wallpaper-history?user_id=1')).status,403);
  assert.equal(writes.length,0);
  assert.equal(reads.length,0);
});

test('authenticated command and history queries reach the correct handlers', async (t) => {
  const { base, headers, writes, reads } = await setup(t);
  const response = await fetch(base + '/_internal/wallpaper-updates', { method:'POST', headers, body:JSON.stringify({ link_id:1 }) });
  assert.deepEqual(await response.json(),{ event_id:'1' });
  assert.deepEqual(writes,[{ link_id:1 }]);
  const history = await fetch(base + '/_internal/wallpaper-history?user_id=2&kind=sent&limit=5',{ headers });
  assert.deepEqual(await history.json(),[{ id:'2' }]);
  assert.deepEqual(reads,[{ userId:'2', kind:'sent', limit:'5' }]);
});

test('unsupported content types and malformed JSON never write data', async (t) => {
  const { base, headers, writes } = await setup(t);
  assert.equal((await fetch(base + '/_internal/wallpaper-updates',{ method:'POST', headers, body:'{' })).status,400);
  assert.equal((await fetch(base + '/_internal/wallpaper-updates',{ method:'POST', headers:{ authorization:headers.authorization }, body:'{}' })).status,415);
  assert.equal((await fetch(base + '/_internal/wallpaper-updates',{ headers })).status,404);
  assert.equal(writes.length,0);
});

test('invalid command shapes fail before acquiring a database connection', async () => {
  const write = createWallpaperWriter({ connect: () => assert.fail('Invalid command reached database') });
  for (const value of [null,{}, { link_id:'1 OR 1=1' }, { request_key:'a', link_id:1, post_id:1, post_url:'javascript:alert(1)' }]) {
    await assert.rejects(write(value),{ status:422 });
  }
});
