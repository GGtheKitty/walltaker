import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiServer} from '../src/app.js';
import {createSocialHandler,socialToken} from '../src/social-handler.js';
import {CommandError} from '../src/updates.js';
import {createRealtimeRpc} from '../src/realtime-rpc.js';
import {createHmac,pbkdf2Sync} from 'node:crypto';

test('social routes require their own credential, JSON, POST and bounded bodies; errors retain status',async()=>{
 const calls=[];const server=createApiServer({repository:{},store:{},secretKeyBase:'secret',baseUrl:'https://example.test',
  socialHandler:createSocialHandler({secretKeyBase:'secret',manage:async(op,input)=>{calls.push([op,input]);if(op==='denied')throw new CommandError(403,'Denied');return {ok:true};}})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/_internal/social/friends`;
 const headers={authorization:'Bearer '+socialToken('secret'),'content-type':'application/json'};
 try {
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(url,{headers})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(url,{method:'POST',headers,body:'no'})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({content:'x'.repeat(65537)})})).status,413);
  const response=await fetch(url,{method:'POST',headers,body:'{"actor_id":1}'});assert.equal(response.status,200);
  assert.equal(response.headers.get('x-walltaker-backend'),'node-social');assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(calls,[['friends',{actor_id:1}]]);
  assert.equal((await fetch(url.replace('friends','denied'),{method:'POST',headers,body:'{}'})).status,403);
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('RPC applies current social authorization even to a correctly signed stream',async()=>{
 const secret='test-secret',stream='social_thread_member_7_2';const data=Buffer.from(JSON.stringify(stream)).toString('base64');
 const key=pbkdf2Sync(secret,'turbo/signed_stream_verifier_key',1000,64,'sha256');
 const token=data+'--'+createHmac('sha256',key).update(data).digest('hex');
 const calls=[];const rpc=createRealtimeRpc({secretKeyBase:secret,baseUrl:'https://example.test',authorizeStream:async(name,user)=>{calls.push([name,user]);return false;}});
 const result=await rpc('command',{command:'subscribe',identifier:JSON.stringify({channel:'Turbo::StreamsChannel',signed_stream_name:token}),env:{cstate:{node_connection:'known',node_user:'2'}}});
 assert.equal(result.status,2);assert.deepEqual(result.streams,[]);assert.deepEqual(calls,[[stream,2]]);
});
