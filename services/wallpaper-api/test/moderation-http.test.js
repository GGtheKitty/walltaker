import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiServer} from '../src/app.js';
import {createModerationHandler,moderationToken} from '../src/moderation-handler.js';
import {CommandError} from '../src/updates.js';



test('moderation routes require their own credential, JSON, POST and bounded bodies; errors retain status',async()=>{
 const calls=[];const server=createApiServer({repository:{},store:{},secretKeyBase:'secret',baseUrl:'https://example.test',
  moderationHandler:createModerationHandler({secretKeyBase:'secret',manage:async(op,input)=>{calls.push([op,input]);if(op==='denied')throw new CommandError(403,'Denied');return {ok:true};}})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/_internal/moderation/entries`;
 const headers={authorization:'Bearer '+moderationToken('secret'),'content-type':'application/json'};
 try {
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(url,{headers})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(url,{method:'POST',headers,body:'no'})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({content:'x'.repeat(4*1024*1024+1)})})).status,413);
  const response=await fetch(url,{method:'POST',headers,body:'{"actor_id":1}'});assert.equal(response.status,200);
  assert.equal(response.headers.get('x-walltaker-backend'),'node-moderation');assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(calls,[['entries',{actor_id:1}]]);
  assert.equal((await fetch(url.replace('entries','denied'),{method:'POST',headers,body:'{}'})).status,403);
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
