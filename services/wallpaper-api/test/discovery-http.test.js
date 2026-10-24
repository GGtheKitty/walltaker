import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiServer} from '../src/app.js';
import {createDiscoveryHandler,discoveryToken} from '../src/discovery-handler.js';
import {CommandError} from '../src/updates.js';

test('discovery routes require their own credential, JSON, POST and bounded bodies; errors retain status',async()=>{
 const calls=[];const server=createApiServer({repository:{},store:{},secretKeyBase:'secret',baseUrl:'https://example.test',
  discoveryHandler:createDiscoveryHandler({secretKeyBase:'secret',read:async(op,input)=>{calls.push([op,input]);if(op==='denied')throw new CommandError(403,'Denied');return {ok:true};}})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/_internal/discovery/search`;
 const headers={authorization:'Bearer '+discoveryToken('secret'),'content-type':'application/json'};
 try {
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(url,{headers})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(url,{method:'POST',headers,body:'no'})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({content:'x'.repeat(65537)})})).status,413);
  const response=await fetch(url,{method:'POST',headers,body:'{"actor_id":1}'});assert.equal(response.status,200);
  assert.equal(response.headers.get('x-walltaker-backend'),'node-discovery');assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(calls,[['search',{actor_id:1}]]);
  assert.equal((await fetch(url.replace('search','denied'),{method:'POST',headers,body:'{}'})).status,403);
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
