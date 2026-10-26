import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,pbkdf2Sync} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import http from 'node:http';
import {WebSocket} from 'ws';
import {createGateway} from '../src/gateway.js';
import {createRpcClient} from '../src/rpc.js';
import {createRealtimeRpc,createRealtimeHandler} from '../../wallpaper-api/src/realtime-rpc.js';

const secret='node-cable-tests',baseUrl='https://site.test';
const signed=name=>{const payload=Buffer.from(JSON.stringify(name)).toString('base64'),key=pbkdf2Sync(secret,'turbo/signed_stream_verifier_key',1000,64,'sha256');return payload+'--'+createHmac('sha256',key).update(payload).digest('hex');};
const identifier=(channel,params={})=>JSON.stringify({channel,...params});
async function until(predicate,timeout=1500){const end=Date.now()+timeout;while(!predicate()){if(Date.now()>=end)assert.fail('Timed out waiting for gateway state');await delay(5);}}
async function setup(t,options={}){
  const state={calls:[],joins:new Map(),views:new Map(),heartbeats:0,leaves:0,ready:true};
  const row={id:'1',user_id:'1',post_description:'x'.repeat(20000)};
  const rpc=createRealtimeRpc({secretKeyBase:secret,baseUrl,
    repository:{async findIdentifier(id){return ['1','slug'].includes(id)?row:null;},async find(){return row;}},
    presence:{async join(id,token){state.joins.set(token,id);return true;},async leave(id,token){state.joins.delete(token);state.leaves++;},async view(id,connection,link){if(!id)return;if(link)state.views.set(connection,link);else state.views.delete(connection);},async heartbeat(){state.heartbeats++;},async announce(){}},
    publisher:{async linkPayload(){return {...row,success:true};}},
    readUser:async({username,viewerId})=>username==='missing'?null:{username,authenticated:!!viewerId,self:viewerId===1,friend:viewerId===2},
    sessionViewer:async headers=>headers.cookie==='user=1'?1:headers.cookie==='user=2'?2:null,
    authenticateKey:async key=>key==='owner-key'?1:null,
    authorizeStream:async(stream,user)=>!stream.startsWith('private:')||stream==='private:'+user,
  });
  const gateway=createGateway({rpc:async(method,input)=>{state.calls.push({method,input:structuredClone(input)});return options.rpc?options.rpc(method,input,rpc):rpc(method,input);},isReady:()=>state.ready,logger:{warn(){}},...options.gateway});
  await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));
  const address='ws://127.0.0.1:'+gateway.server.address().port+'/cable';
  t.after(()=>gateway.stop({timeout:1500}));
  async function client({headers={},autoPong=true,protocols=['actioncable-v1-json','actioncable-unsupported']}={}){
    const ws=new WebSocket(address,protocols,{headers,autoPong,perMessageDeflate:false}),messages=[];let closed=false,code;
    ws.on('message',data=>messages.push(JSON.parse(data)));ws.on('close',value=>{closed=true;code=value;});ws.on('error',()=>{});
    await until(()=>ws.readyState!==WebSocket.CONNECTING);t.after(()=>ws.terminate());
    const next=async(predicate=()=>true)=>{await until(()=>messages.some(predicate)||closed);const index=messages.findIndex(predicate);assert.notEqual(index,-1,'Connection closed before expected message');return messages.splice(index,1)[0];};
    const send=(command,id,data,extra={})=>ws.send(JSON.stringify({command,identifier:id,...(data===undefined?{}:{data:JSON.stringify(data)}),...extra}));
    return {ws,messages,next,send,get closed(){return closed;},get code(){return code;}};
  }
  return {state,gateway,address,client};
}
test('standard JSON subprotocol, missing-protocol native clients, welcome and health stay compatible',async t=>{
  const {client,address,state}=await setup(t);for(const protocols of [['actioncable-v1-json','actioncable-unsupported'],[]]){const c=await client({protocols});assert.equal((await c.next()).type,'welcome');assert.equal(c.ws.protocol,protocols.length?'actioncable-v1-json':'');}
  const response=await fetch(address.replace('ws:','http:').replace('/cable','/up'));assert.equal(response.status,200);assert.equal((await response.json()).service,'node-cable');
  assert.equal(state.calls[0].method,'connect');
});
test('channel commands retain the same identifiers, untruncated payloads and independent streams',async t=>{
  const {client,state,gateway}=await setup(t),c=await client();await c.next();const id=identifier('LinkChannel',{id:'slug'});c.send('subscribe',id);assert.equal((await c.next()).type,'confirm_subscription');assert.equal((await c.next()).message.post_description.length,20000);assert.equal(state.joins.size,1);
  c.send('subscribe',id);await c.next();assert.equal(state.joins.size,1);
  c.send('message',id,{action:'watch_user',username:'Alice',api_key:'owner-key'});assert.equal((await c.next()).message.user.self,true);
  gateway.broadcast(JSON.stringify({stream:'User::Alice::self',data:JSON.stringify({user:'private payload'})}));assert.equal((await c.next()).message.user,'private payload');
  c.send('message',id,{action:'unwatch_user'});assert.equal((await c.next()).message.watching,false);gateway.broadcast(JSON.stringify({stream:'User::Alice::self',data:'"removed"'}));await delay(15);assert.equal(c.messages.length,0);
  c.send('unsubscribe',id);await until(()=>state.leaves===1);assert.equal(gateway.stats().subscriptions,0);assert.equal(gateway.stats().streams,0);assert.equal(c.messages.length,0);
});
test('signed Turbo streams and private channel policy are enforced by the existing authority',async t=>{
  const {client,gateway}=await setup(t),c=await client({headers:{cookie:'user=1',origin:baseUrl}});await c.next();
  for(const id of [identifier('Turbo::StreamsChannel',{signed_stream_name:'forged'}),identifier('Turbo::StreamsChannel',{signed_stream_name:signed('private:2')}),identifier('UnknownChannel')]){c.send('subscribe',id);assert.equal((await c.next()).type,'reject_subscription');}
  const id=identifier('Turbo::StreamsChannel',{signed_stream_name:signed('private:1')});c.send('subscribe',id);await c.next();gateway.broadcast(JSON.stringify({stream:'private:1',data:JSON.stringify('<turbo-stream>HTML</turbo-stream>')}));assert.deepEqual(await c.next(),{identifier:id,message:'<turbo-stream>HTML</turbo-stream>'});assert.equal(gateway.stats().subscriptions,1);
});
test('one stream can feed two identifiers without cross-unsubscribe or cross-client leakage',async t=>{
  const {client,gateway}=await setup(t),a=await client(),b=await client();await a.next();await b.next();const id1=identifier('Turbo::StreamsChannel',{signed_stream_name:signed('public')}),id2=identifier('Turbo::StreamsChannel',{signed_stream_name:signed('public'),extra:1});
  a.send('subscribe',id1);await a.next();a.send('subscribe',id2);await a.next();b.send('subscribe',identifier('WebPresenceChannel'));await b.next();
  a.send('unsubscribe',id1);await until(()=>gateway.stats().subscriptions===2);gateway.broadcast(JSON.stringify({stream:'public',data:JSON.stringify({x:1})}));assert.equal((await a.next()).identifier,id2);await delay(10);assert.equal(b.messages.length,0);
});
test('initial live-card subscription bursts fit normal profile/list pages',async t=>{
  const {client,gateway}=await setup(t),c=await client();await c.next();
  for(let n=0;n<128;n++)c.send('subscribe',identifier('Turbo::StreamsChannel',{signed_stream_name:signed('card:'+n)}));
  await until(()=>c.messages.filter(m=>m.type==='confirm_subscription').length===128);assert.equal(c.closed,false);assert.equal(gateway.stats().streams,128);
});
test('foreign-origin cookies are rejected and clients cannot inject identity or state into RPC',async t=>{
  const {client,state}=await setup(t),foreign=await client({headers:{cookie:'user=1',origin:'https://foreign.test'}});assert.equal((await foreign.next()).type,'disconnect');await until(()=>foreign.closed);
  const c=await client({headers:{cookie:'user=1',origin:baseUrl,authorization:'discarded','x-forged-header':'discarded'}});await c.next();const id=identifier('WebPresenceChannel');c.send('subscribe',id,undefined,{env:{cstate:{node_user:'999'}},identifiers:'forged'});await c.next();c.send('message',id,{action:'view_link',link_id:1});await until(()=>state.views.size===1);
  assert.equal(state.calls.at(-1).input.env.cstate.node_user,'1');assert.equal(state.calls.at(-1).input.identifiers,'{}');assert.equal(state.calls.at(-1).input.env.headers.authorization,undefined);assert.equal(state.calls.at(-1).input.env.headers['x-forged-header'],undefined);
});
test('a close after an in-flight subscribe uses its final state and cleans all leases once',async t=>{
  let release,entered=false;const gate=new Promise(resolve=>{release=resolve;});
  const {client,state}=await setup(t,{rpc:async(method,input,rpc)=>{const result=await rpc(method,input);if(input.command==='subscribe'){entered=true;await gate;}return result;}}),c=await client();await c.next();c.send('subscribe',identifier('LinkChannel',{id:1}));await until(()=>entered);c.ws.terminate();release();await until(()=>state.leaves===1);assert.equal(state.joins.size,0);assert.equal(state.calls.filter(c=>c.method==='disconnect').length,1);
});
test('per-socket serialization preserves multiple link/view actions and disconnect retries are idempotent',async t=>{
  let concurrent=0,peak=0,disconnects=0;const {client,state}=await setup(t,{rpc:async(method,input,rpc)=>{if(method==='disconnect'&&++disconnects===1)throw Error('temporary');concurrent++;peak=Math.max(peak,concurrent);await delay(5);try{return await rpc(method,input);}finally{concurrent--;}}}),c=await client({headers:{cookie:'user=1'}});await c.next();
  const a=identifier('LinkChannel',{id:1}),b=identifier('WebPresenceChannel');c.send('subscribe',a);c.send('subscribe',b);c.send('message',b,{action:'view_link',link_id:1});await until(()=>state.views.size===1);c.ws.close();await until(()=>disconnects===2&&state.joins.size===0&&state.views.size===0);assert.equal(peak,1);
});
test('native pong deadlines reset from now, quiet healthy sockets renew leases, unrelated channels do not',async t=>{
  const {client,state}=await setup(t,{gateway:{pingInterval:20,pongTimeout:120,presenceInterval:65}}),c=await client();await c.next();c.send('subscribe',identifier('LinkChannel',{id:1}));await c.next();await c.next();
  await delay(220);assert.equal(c.closed,false);assert.ok(state.heartbeats>=2&&state.heartbeats<=4);assert.ok(c.messages.some(m=>m.type==='ping'));
  const before=state.heartbeats,d=await client();await d.next();d.send('subscribe',identifier('Turbo::StreamsChannel',{signed_stream_name:signed('other')}));await d.next();c.ws.close();await delay(100);assert.equal(state.heartbeats,before);assert.equal(d.closed,false);
});
test('stalled sockets are removed after bounded pong timeout even after many previous good pongs',async t=>{
  const {client,state}=await setup(t,{gateway:{pingInterval:15,pongTimeout:90,presenceInterval:35,closeTimeout:20}}),c=await client({autoPong:false});await c.next();const id=identifier('LinkChannel',{id:1});c.send('subscribe',id);await c.next();await c.next();let responding=true;
  c.ws.on('ping',data=>{if(responding)c.ws.pong(data);});await delay(170);assert.equal(c.closed,false);responding=false;const start=Date.now();await until(()=>c.closed&&state.joins.size===0);assert.ok(Date.now()-start<180);assert.equal(state.leaves,1);
});
test('malformed/binary/oversized messages, excessive queues and subscription limits close safely',async t=>{
  for(const send of [c=>c.ws.send('{'),c=>c.ws.send(Buffer.from('{}')),c=>c.ws.send('x'.repeat(65537)),c=>c.ws.send(JSON.stringify({command:'message',identifier:'{}',data:{action:'heartbeat'}}))]){const {client,state}=await setup(t);const c=await client();await c.next();send(c);await until(()=>c.closed);assert.equal(state.calls.filter(c=>c.method==='command').length,0);}
  const {client,gateway}=await setup(t,{gateway:{maxSubscriptions:1}}),c=await client();await c.next();c.send('subscribe',identifier('WebPresenceChannel'));await c.next();c.send('subscribe',identifier('WebPresenceChannel',{second:true}));await until(()=>c.closed);assert.equal(gateway.stats().subscriptions,0);
});
test('Redis outages force reconnect and fail health',async t=>{
  const {client,gateway,state,address}=await setup(t),c=await client();await c.next();const id=identifier('Turbo::StreamsChannel',{signed_stream_name:signed('public')});c.send('subscribe',id);await c.next();
  const response=await fetch(address.replace('ws:','http:').replace('/cable','/up'));assert.equal(response.status,200);state.ready=false;gateway.unavailable();assert.equal((await c.next(m=>m.type==='disconnect')).reconnect,true);await until(()=>c.closed&&gateway.stats().streams===0);
  assert.equal((await fetch(address.replace('ws:','http:').replace('/cable','/up'))).status,503);
});
test('slow consumers are disconnected without accumulating an unbounded send buffer',async t=>{
  const {client,gateway}=await setup(t,{gateway:{maxBufferedBytes:1024,closeTimeout:20}}),c=await client();await c.next();const id=identifier('Turbo::StreamsChannel',{signed_stream_name:signed('public')});c.send('subscribe',id);await c.next();c.ws._socket.pause();
  const frame=JSON.stringify({stream:'public',data:JSON.stringify('x'.repeat(65536))});
  for(let n=0;n<100;n++)gateway.broadcast(frame);
  await until(()=>gateway.stats().connections===0);c.ws._socket.resume();await until(()=>c.closed);assert.equal(gateway.stats().streams,0);
});
test('flooded command queues stay bounded and a late connect is still cleaned after close',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});let entered=false;
  const {client,state,gateway}=await setup(t,{gateway:{maxPending:2},rpc:async(method,input,rpc)=>{const result=await rpc(method,input);if(method==='connect'){entered=true;await gate;}return result;}}),c=await client();await until(()=>entered);
  for(let n=0;n<5;n++)c.send('subscribe',identifier('WebPresenceChannel',{n}));await until(()=>c.closed);release();await until(()=>state.calls.some(c=>c.method==='disconnect')&&gateway.stats().queuedBytes===0);assert.equal(state.calls.filter(c=>c.method==='command').length,0);
});
test('connection limits and RPC failures fail closed and keep health private',async t=>{
  const {client,address,gateway}=await setup(t,{gateway:{maxConnections:1}}),first=await client();await first.next();
  const ws=new WebSocket(address,'actioncable-v1-json');ws.on('error',()=>{});assert.equal(await new Promise(resolve=>ws.on('unexpected-response',(_req,res)=>{res.resume();resolve(res.statusCode);})),503);ws.terminate();assert.equal((await fetch(address.replace('ws:','http:'))).status,404);
  await gateway.stop({timeout:1000});
  const failed=await setup(t,{rpc:async()=>{throw Error('sensitive backend failure');}}),c=await failed.client();const message=await c.next();assert.equal(message.type,'disconnect');assert.equal(message.reconnect,true);assert.doesNotMatch(JSON.stringify(c.messages),/sensitive/);
});
test('wrong paths and unsupported protocols are refused before application RPC',async t=>{
  const {address,state}=await setup(t);
  for(const [url,protocol] of [[address.replace('/cable','/bad'),'actioncable-v1-json'],[address,'unsupported-only']]){
    const ws=new WebSocket(url,protocol);ws.on('error',()=>{});const status=await new Promise(resolve=>ws.on('unexpected-response',(_req,res)=>{res.resume();resolve(res.statusCode);}));ws.terminate();assert.ok([400,404].includes(status));
  }
  assert.equal(state.calls.length,0);
});
test('HTTP RPC uses its own HMAC credential, bounded concurrency and Node response validation',async t=>{
  let active=0,peak=0;const calls=[];
  const client=createRpcClient({url:'http://realtime/_internal/realtime-rpc',secretKeyBase:secret,concurrency:2,maxQueue:2,fetchImpl:async(url,options)=>{calls.push({url:String(url),options});active++;peak=Math.max(peak,active);await delay(10);active--;return Response.json({status:1});}});
  await Promise.all([client('connect',{}),client('connect',{}),client('connect',{}),client('disconnect',{})]);assert.equal(peak,2);assert.ok(calls[0].url.endsWith('/connect'));assert.equal(calls[0].options.headers.authorization,'Bearer '+createHmac('sha256',secret).update('rpc-cable').digest('hex'));assert.equal(calls[0].options.redirect,'error');
  const bad=createRpcClient({url:'http://realtime/rpc',secretKeyBase:secret,fetchImpl:async()=>Response.json({status:99})});await assert.rejects(bad('connect',{}),/Invalid/);await assert.rejects(client('forged',{}),/Invalid/);
});
test('actual authenticated HTTP RPC transport preserves the protocol and graceful shutdown removes presence',async t=>{
  let leaves=0;const rpc=createRealtimeRpc({secretKeyBase:secret,baseUrl,repository:{async findIdentifier(){return {id:'1'};},async find(){return {id:'1'};}},presence:{async join(){return true;},async leave(){leaves++;},async view(){},async heartbeat(){}},publisher:{async linkPayload(){return {id:'1',success:true};}},sessionViewer:async()=>null,authenticateKey:async()=>null,readUser:async()=>null});
  const handler=createRealtimeHandler({rpc,secretKeyBase:secret}),api=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{api.close(resolve);api.closeAllConnections();}));
  const gateway=createGateway({rpc:createRpcClient({url:'http://127.0.0.1:'+api.address().port+'/_internal/realtime-rpc',secretKeyBase:secret})});await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));t.after(()=>gateway.stop({timeout:100}));
  const ws=new WebSocket('ws://127.0.0.1:'+gateway.server.address().port+'/cable','actioncable-v1-json');ws.on('error',()=>{});const messages=[];ws.on('message',data=>messages.push(JSON.parse(data)));await until(()=>messages.some(m=>m.type==='welcome'));ws.send(JSON.stringify({command:'subscribe',identifier:identifier('LinkChannel',{id:1})}));await until(()=>messages.some(m=>m.message?.success));await gateway.stop({timeout:1000});assert.equal(leaves,1);assert.ok(messages.some(m=>m.type==='disconnect'&&m.reconnect));
});
