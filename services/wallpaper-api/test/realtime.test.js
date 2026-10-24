import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, pbkdf2Sync } from 'node:crypto';
import { createRealtimeRpc, createStreamVerifier, createRealtimeHandler, rpcToken } from '../src/realtime-rpc.js';
import { createApiServer } from '../src/app.js';
import { clientIdentity, headerIdentity } from '../src/realtime-presence.js';

const secret = 'test-secret';
const baseUrl = 'https://example.test';
const signed = (stream) => {
  const data = Buffer.from(JSON.stringify(stream)).toString('base64');
  const key = pbkdf2Sync(secret, 'turbo/signed_stream_verifier_key', 1000, 64, 'sha256');
  return `${data}--${createHmac('sha256', key).update(data).digest('hex')}`;
};
function fixture() {
  const calls = [];
  const row = { id: '1', user_id: '7' };
  const repository = { findIdentifier: async (id) => ['1','slug'].includes(id) ? row : null, find: async () => row };
  const presence = Object.fromEntries(['join','leave','view','announce','heartbeat'].map((name) => [name, async (...args) => { calls.push([name,...args]); return true; }]));
  const rpc = createRealtimeRpc({ repository, presence, publisher: { linkPayload: async () => ({ success: true,id: 1,online: true }) },
    readUser: async ({ username, viewerId }) => username === 'missing' ? null : { username,authenticated: !!viewerId,self: viewerId === 7,friend: false },
    sessionViewer: async (headers) => headers.cookie ? 7 : null, authenticateKey: async (key) => key === 'valid' ? 7 : null, secretKeyBase: secret, baseUrl });
  return { calls, rpc };
}
test('Turbo subscriptions verify Rails-compatible signatures and reject tampering and non-string payloads', () => {
  const verify = createStreamVerifier(secret);
  const token = signed('private-stream:42');
  assert.equal(verify(token), 'private-stream:42');
  assert.equal(verify(token.replace('42','43') + 'x'), null);
  assert.equal(verify(signed({ arbitrary: 'object' })), null);
  assert.equal(verify('private-stream:42'), null);
});
test('RPC authenticates cookies once, validates origins, and only accepts signed Turbo streams', async () => {
  const { rpc } = fixture();
  const connection = await rpc('connect', { env: { headers: { Cookie: 'signed',Origin: baseUrl } } });
  assert.equal(connection.status,1); assert.equal(connection.env.cstate.node_user,'7');
  assert.equal((await rpc('connect',{ env:{ headers:{ cookie:'signed',origin:'https://other.test' } } })).status,2);
  assert.equal((await rpc('connect',{ env:{ headers:{ origin:'chrome-extension://client' } } })).status,1);
  const identifier = JSON.stringify({ channel:'Turbo::StreamsChannel',signed_stream_name:signed('notifications:7') });
  const result = await rpc('command',{ command:'subscribe',identifier,env:connection.env });
  assert.deepEqual(result.streams,['notifications:7']);
  assert.equal(JSON.parse(result.transmissions[0]).type,'confirm_subscription');
  const bad = await rpc('command',{ command:'subscribe',identifier:JSON.stringify({ channel:'Turbo::StreamsChannel',signed_stream_name:'unsigned' }),env:connection.env });
  assert.equal(bad.status,2); assert.equal(JSON.parse(bad.transmissions[0]).type,'reject_subscription');
});
test('LinkChannel aliases, errors, explicit checks, announcement and disconnect preserve client behavior', async () => {
  const { rpc,calls } = fixture();
  const env = (await rpc('connect',{ env:{ headers:{ 'User-Agent':'Desktop' } } })).env;
  const identifier = JSON.stringify({ channel:'LinkChannel',link_id:'slug',client:'Native client' });
  const subscribed = await rpc('command',{ command:'subscribe',identifier,env });
  assert.deepEqual(subscribed.streams,['Link::1']); assert.equal(JSON.parse(subscribed.transmissions[1]).message.online,true);
  const token = calls.find(([kind]) => kind==='join')[2];
  assert.equal(calls[0][3],'Native client');
  await rpc('command',{ command:'message',identifier,data:JSON.stringify({ action:'check' }),env:subscribed.env });
  assert.equal(calls.filter(([kind]) => kind==='join')[1][2],token);
  await rpc('command',{ command:'message',identifier,data:JSON.stringify({ action:'announce_client',walltakerClient:'Updated client' }),env:subscribed.env });
  assert.ok(calls.some((call) => call[0]==='announce' && call[2]==='Updated client'));
  await rpc('disconnect',{ env:subscribed.env });
  assert.ok(calls.some((call) => call[0]==='leave' && call[2]===token));
  const missing = await rpc('command',{ command:'subscribe',identifier:JSON.stringify({ channel:'LinkChannel' }),env });
  assert.equal(missing.status,2);
  const unknown = await rpc('command',{ command:'subscribe',identifier:JSON.stringify({ channel:'LinkChannel',id:999 }),env });
  assert.equal(JSON.parse(unknown.transmissions[1]).message.why,'Link 999 does not exist.');
});
test('watch_user switches audience streams and unwatch stops the previous subscription', async () => {
  const { rpc } = fixture();
  const env = (await rpc('connect',{ env:{ headers:{ cookie:'signed' } } })).env;
  const identifier = JSON.stringify({ channel:'LinkChannel',id:1 });
  const first = await rpc('command',{ command:'message',identifier,env,data:JSON.stringify({ action:'watch_user',username:'Alice',api_key:'invalid' }) });
  assert.deepEqual(first.streams,['User::Alice::self']);
  assert.equal(JSON.parse(first.transmissions[0]).message.user.authenticated,true);
  const second = await rpc('command',{ command:'message',identifier,env:first.env,data:JSON.stringify({ action:'watch_user',username:'Bob' }) });
  assert.deepEqual(second.stopped_streams,['User::Alice::self']);
  const stop = await rpc('command',{ command:'message',identifier,env:second.env,data:JSON.stringify({ action:'unwatch_user' }) });
  assert.deepEqual(stop.stopped_streams,['User::Bob::self']);
  assert.equal(JSON.parse(stop.transmissions[0]).message.watching,false);
});
test('subscription RPC retries reuse presence membership even when the first response was lost', async () => {
  const { rpc,calls } = fixture();
  const env = (await rpc('connect',{ env:{} })).env;
  const identifier = JSON.stringify({ channel:'LinkChannel',id:1 });
  await rpc('command',{ command:'subscribe',identifier,env });
  await rpc('command',{ command:'subscribe',identifier,env });
  const joins = calls.filter(([kind]) => kind==='join');
  assert.equal(joins[0][2],joins[1][2]);
});
test('WebPresence permits only the authenticated connection identity and known actions', async () => {
  const { rpc,calls } = fixture();
  const env = (await rpc('connect',{ env:{ headers:{ cookie:'signed' } } })).env;
  const identifier = JSON.stringify({ channel:'WebPresenceChannel' });
  await rpc('command',{ command:'message',identifier,env,data:JSON.stringify({ action:'view_link',link_id:1,user_id:999 }) });
  assert.equal(calls[0][1],7); assert.equal(calls[0][3],'1');
  await rpc('command',{ command:'message',identifier,env,data:JSON.stringify({ action:'destroy',link_id:1 }) });
  assert.equal(calls.length,1);
  await rpc('command',{ command:'unsubscribe',identifier,env });
  assert.equal(calls[1][3],null);
});
test('RPC endpoint requires private authentication and bounded, valid request bodies', async () => {
  const server = createApiServer({ repository:{},store:{},secretKeyBase:secret,baseUrl,
    realtimeHandler:createRealtimeHandler({ secretKeyBase:secret,rpc:async () => ({ status:1 }),poll:async () => {} }) });
  await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}/_internal/realtime-rpc/connect`;
  try {
    assert.equal((await fetch(url,{ method:'POST',body:'{}' })).status,403);
    const headers = { authorization:`Bearer ${rpcToken(secret)}` };
    assert.equal((await fetch(url,{ method:'POST',headers,body:'{' })).status,400);
    assert.equal((await fetch(url,{ method:'POST',headers,body:'{}' })).headers.get('x-walltaker-backend'),'node-realtime');
    assert.equal((await fetch(url,{ method:'POST',headers,body:JSON.stringify({ text:'x'.repeat(1024*1024) }) })).status,413);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
test('client identity headers retain compatibility and cap database string lengths', () => {
  assert.equal(headerIdentity({ 'user-agent':'Agent',joihow:'Joi',user_agent:'Extra','wallpaper-engine-client':'1' }), 'Agent Joi Extra Wallpaper-Engine-Client/1');
  assert.equal(clientIdentity({ userAgent:'App' }),'App');
  assert.equal(clientIdentity({ client:'x'.repeat(1000) }).length,255);
});

test('heartbeat renews only socket-owned memberships and viewer identity from authenticated RPC state',async()=>{
 const {rpc,calls}=fixture();const env=(await rpc('connect',{env:{headers:{cookie:'signed'}}})).env;
 const identifier=JSON.stringify({channel:'LinkChannel',id:1});
 const subscribed=await rpc('command',{command:'subscribe',identifier,env});
 const members=Object.values(JSON.parse(subscribed.env.cstate.node_links));
 await rpc('command',{command:'message',identifier,env:subscribed.env,data:JSON.stringify({action:'heartbeat',user_id:999,links:[{id:'999',token:'forged'}]})});
 assert.deepEqual(calls.find(call=>call[0]==='heartbeat'),['heartbeat',members,7,env.cstate.node_connection]);
 const web=JSON.stringify({channel:'WebPresenceChannel'});
 await rpc('command',{command:'message',identifier:web,env:subscribed.env,data:JSON.stringify({action:'heartbeat'})});
 assert.equal(calls.filter(call=>call[0]==='heartbeat').length,2);
});
