import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from 'redis';
import {WebSocket} from 'ws';
import {createRealtimeRpc,createRealtimeHandler} from '../../wallpaper-api/src/realtime-rpc.js';

async function waitFor(predicate,timeout=8000){const until=Date.now()+timeout;while(!await predicate()){if(Date.now()>until)throw Error('Gateway integration timed out');await delay(10);}}
test('gateway process relays real Redis, recovers subscriber loss, and drains leases on SIGTERM',{skip:!process.env.TEST_REDIS_URL},async t=>{
  let joins=0,leaves=0,child,output='',address;
  const sockets=[],leases=new Set(),redis=createClient({url:process.env.TEST_REDIS_URL});redis.on('error',()=>{});await redis.connect();
  const secret='redis-gateway-test',rpc=createRealtimeRpc({secretKeyBase:secret,baseUrl:'https://site.test',repository:{async findIdentifier(){return {id:'1'};},async find(){return {id:'1'};}},presence:{async join(_id,token){joins++;leases.add(token);return true;},async leave(_id,token){leaves++;leases.delete(token);},async view(){},async heartbeat(){}},publisher:{async linkPayload(){return {id:'1',success:true};}},sessionViewer:async()=>null,authenticateKey:async()=>null,readUser:async()=>null});
  const handler=createRealtimeHandler({rpc,secretKeyBase:secret}),api=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    for(const ws of sockets)ws.terminate();
    if(child&&child.exitCode==null){child.kill('SIGTERM');try{await waitFor(()=>child.exitCode!=null,10000);}catch{child.kill('SIGKILL');}}
    await redis.close();await new Promise(resolve=>{api.close(resolve);api.closeAllConnections();});
  });
  child=spawn(process.execPath,['src/server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',REDIS_URL:process.env.TEST_REDIS_URL,SECRET_KEY_BASE:secret,REALTIME_RPC_URL:'http://127.0.0.1:'+api.address().port+'/_internal/realtime-rpc'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>{output+=chunk;const match=/listening on (\d+)/.exec(output);if(match)address='ws://127.0.0.1:'+match[1]+'/cable';});child.stderr.on('data',chunk=>{output+=chunk;});
  await waitFor(()=>address||child.exitCode!=null);assert.ok(address,output.slice(0,2000));
  async function connect(){
    const ws=new WebSocket(address,'actioncable-v1-json'),messages=[];sockets.push(ws);ws.on('error',()=>{});ws.on('message',data=>messages.push(JSON.parse(data)));await waitFor(()=>messages.some(m=>m.type==='welcome'));return {ws,messages};
  }
  const id=JSON.stringify({channel:'LinkChannel',id:1});
  const first=await connect();first.ws.send(JSON.stringify({command:'subscribe',identifier:id}));await waitFor(()=>first.messages.some(m=>m.message?.success));assert.equal(leases.size,1);
  await redis.publish('__anycable__','not JSON');await redis.publish('__anycable__',JSON.stringify({stream:'Link::1',data:JSON.stringify({id:1,marker:'real Redis'})}));await waitFor(()=>first.messages.some(m=>m.message?.marker==='real Redis'));
  // This is a dedicated test Redis. Only the child gateway has a pub/sub socket.
  assert.equal(await redis.sendCommand(['CLIENT','KILL','TYPE','pubsub']),1);
  await waitFor(()=>first.messages.some(m=>m.type==='disconnect'&&m.reconnect));await waitFor(()=>leases.size===0);
  const health=address.replace('ws:','http:').replace('/cable','/up');await waitFor(async()=>{try{return (await fetch(health)).ok;}catch{return false;}});
  const second=await connect();second.ws.send(JSON.stringify({command:'subscribe',identifier:id}));await waitFor(()=>second.messages.some(m=>m.message?.success));await redis.publish('__anycable__',JSON.stringify({stream:'Link::1',data:'"after reconnect"'}));await waitFor(()=>second.messages.some(m=>m.message==='after reconnect'));
  child.kill('SIGTERM');await waitFor(()=>child.exitCode!=null,10000);assert.equal(child.exitCode,0,output.slice(-2000));assert.ok(second.messages.some(m=>m.type==='disconnect'&&m.reconnect));assert.equal(leases.size,0);assert.equal(joins,2);assert.equal(leaves,2);
});
