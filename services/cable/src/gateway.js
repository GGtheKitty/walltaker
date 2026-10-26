import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocketServer,WebSocket} from 'ws';

const forwardedHeaders=['cookie','origin','user-agent','joihow','user_agent','wallpaper-engine-client'];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};

export function createGateway({rpc,isReady=()=>true,logger=console,now=()=>performance.now(),pingInterval=3000,pongTimeout=60000,presenceInterval=30000,maxConnections=1000,maxSubscriptions=1024,maxPending=1024,maxQueuedBytes=4*1024*1024,maxBufferedBytes=4*1024*1024,maxPayload=65536,closeTimeout=1000}={}){
  if(typeof rpc!=='function')throw Error('Realtime RPC is required');
  const connections=new Set(),streams=new Map(),cleanups=new Set();
  // A profile can render 500 live cards. Allow initial subscription/navigation
  // bursts while retaining a 30-command/second sustained rate and byte bounds.
  const burst=maxSubscriptions*2+32;
  let stopping=false,queuedBytes=0,subscriptionCount=0,identifierBytes=0,stopPromise;
  const server=http.createServer({maxHeaderSize:32768,requestTimeout:10000,headersTimeout:10000},(req,res)=>{
    const healthy=!stopping&&isReady();
    if((req.url==='/up'||req.url==='/health')&&['GET','HEAD'].includes(req.method)){
      res.writeHead(healthy?200:503,{'content-type':'application/json','cache-control':'no-store','x-walltaker-gateway':'node'});res.end(req.method==='HEAD'?undefined:JSON.stringify({status:healthy?'ok':'unavailable',service:'node-cable'}));
    }else{res.writeHead(404,{'cache-control':'no-store'});res.end();}
  });
  const wss=new WebSocketServer({noServer:true,perMessageDeflate:false,maxPayload,maxFragments:128,maxBufferedChunks:1024,closeTimeout,handleProtocols:protocols=>protocols.has('actioncable-v1-json')?'actioncable-v1-json':false});
  function unbind(session,identifier,subscription){
    for(const stream of subscription.streams){const entries=streams.get(stream);entries?.delete(subscription);if(!entries?.size)streams.delete(stream);}
    subscription.streams.clear();
  }
  function removeSubscription(session,identifier){const subscription=session.subscriptions.get(identifier);if(!subscription)return;unbind(session,identifier,subscription);session.subscriptions.delete(identifier);subscriptionCount--;identifierBytes-=Buffer.byteLength(identifier);}
  function send(session,value){
    if(session.closed||session.ws.readyState!==WebSocket.OPEN)return;
    if(session.ws.bufferedAmount>maxBufferedBytes){close(session,'server_restart',true,1013);return;}
    const encoded=typeof value==='string'?value:JSON.stringify(value);
    session.ws.send(encoded,error=>{if(error)session.ws.terminate();});
  }
  function close(session,reason='server_restart',reconnect=true,code=1012,transmit=true){
    if(session.closed||session.closing)return;
    session.closing=true;
    // Stop private broadcasts immediately, before a potentially slow RPC cleanup.
    for(const [identifier,subscription] of session.subscriptions)unbind(session,identifier,subscription);
    if(session.ws.readyState===WebSocket.OPEN){if(transmit)session.ws.send(JSON.stringify({type:'disconnect',reason,reconnect}));session.ws.close(code);}
    else session.ws.terminate();
  }
  async function cleanup(session){
    if(!session.cstate.node_connection)return;
    for(let attempt=0;attempt<3;attempt++){
      try{await rpc('disconnect',{env:{headers:session.headers,cstate:session.cstate},identifiers:session.identifiers});return;}
      catch{if(attempt<2)await delay(100*(attempt+1));}
    }
    logger.warn(JSON.stringify({event:'cable-disconnect-cleanup-failed'}));
  }
  function ended(session){
    if(session.closed)return;session.closed=true;connections.delete(session);
    for(const identifier of session.subscriptions.keys())removeSubscription(session,identifier);
    // An in-flight subscribe/view can finish after close. Clean up its final state.
    const promise=session.tail.then(()=>cleanup(session)).catch(()=>{}).finally(()=>cleanups.delete(promise));cleanups.add(promise);
  }
  function mergeState(session,result,subscription){
    if(object(result.env?.cstate))session.cstate={...session.cstate,...result.env.cstate};
    if(subscription&&object(result.env?.istate))subscription.istate={...subscription.istate,...result.env.istate};
  }
  function bind(session,identifier,subscription,result){
    const stopped=new Set(result.stopped_streams || []);
    for(const stream of [...subscription.streams])if(result.stop_streams||stopped.has(stream)){streams.get(stream)?.delete(subscription);if(!streams.get(stream)?.size)streams.delete(stream);subscription.streams.delete(stream);}
    for(const stream of result.streams || []){
      if(typeof stream!=='string'||stream.length>8192||subscription.streams.has(stream))continue;
      subscription.streams.add(stream);if(!streams.has(stream))streams.set(stream,new Set());streams.get(stream).add(subscription);
    }
  }
  async function command(session,input){
    if(session.closed||session.closing||!session.ready)return;
    const {command,identifier,data}=input;
    let subscription=session.subscriptions.get(identifier);
    if(command==='subscribe'){
      if(subscription){send(session,{identifier,type:'confirm_subscription'});return;}
      if(session.subscriptions.size>=maxSubscriptions||subscriptionCount>=20000||identifierBytes+Buffer.byteLength(identifier)>8*1024*1024){close(session,'invalid_request',false,1008);return;}
      subscription={session,identifier,istate:{},streams:new Set()};
      session.subscriptions.set(identifier,subscription);subscriptionCount++;identifierBytes+=Buffer.byteLength(identifier);
    }else if(!subscription)return;
    const result=await rpc('command',{command,identifier,...(command==='message'?{data}:{}),identifiers:session.identifiers,env:{headers:session.headers,cstate:session.cstate,istate:subscription.istate}});
    mergeState(session,result,subscription);
    if(session.closed||session.closing)return;
    // Attach streams before sending the server's confirmation/initial payload.
    if(result.status===1)bind(session,identifier,subscription,result);
    for(const transmission of result.transmissions || [])send(session,transmission);
    if(command==='unsubscribe'||result.status!==1)removeSubscription(session,identifier);
    if(result.disconnect)close(session,'server_restart',true);
  }
  function enqueue(session,work,bytes=0){
    if(session.closed||session.closing)return;
    if(session.pending>=maxPending||session.queuedBytes+bytes>262144||queuedBytes+bytes>maxQueuedBytes){close(session,'invalid_request',false,1008);return;}
    session.pending++;session.queuedBytes+=bytes;queuedBytes+=bytes;
    session.tail=session.tail.then(()=>work()).catch(()=>close(session,'server_restart',true)).finally(()=>{session.pending--;session.queuedBytes-=bytes;queuedBytes-=bytes;});
  }
  function received(session,buffer,binary){
    if(session.closed||session.closing)return;
    const time=now();session.tokens=Math.min(burst,session.tokens+(time-session.tokenTime)*0.03);session.tokenTime=time;
    if(binary||--session.tokens<0){close(session,'invalid_request',false,1008);return;}
    const input=parse(buffer.toString('utf8'));
    if(!object(input)||!['subscribe','unsubscribe','message'].includes(input.command)||typeof input.identifier!=='string'||Buffer.byteLength(input.identifier)>8192||!object(parse(input.identifier))||(input.command==='message'&&(typeof input.data!=='string'||!object(parse(input.data))))){close(session,'invalid_request',false,1008);return;}
    enqueue(session,()=>command(session,input),buffer.length);
  }
  function pong(session,data){
    const challenge=data.toString('hex'),sent=session.pings.get(challenge);if(sent==null)return;
    const time=now();session.deadline=time+pongTimeout;
    for(const [key,timestamp] of session.pings)if(timestamp<=sent)session.pings.delete(key);
    if(session.ready&&!session.closed&&!session.closing&&time-session.lastPresence>=presenceInterval){
      const identifier=[...session.subscriptions.keys()].find(id=>['LinkChannel','WebPresenceChannel'].includes(parse(id)?.channel));
      if(identifier){session.lastPresence=time;enqueue(session,()=>command(session,{command:'message',identifier,data:'{"action":"heartbeat"}'}));}
    }
  }
  function accepted(ws,req){
    const headers=Object.fromEntries(forwardedHeaders.filter(name=>typeof req.headers[name]==='string').map(name=>[name,req.headers[name]]));
    const time=now(),session={ws,headers,cstate:{},identifiers:'{}',subscriptions:new Map(),ready:false,closed:false,closing:false,pending:0,queuedBytes:0,tokens:burst,tokenTime:time,deadline:time+pongTimeout,nextPing:time+pingInterval,lastPresence:-Infinity,pings:new Map(),tail:Promise.resolve()};
    connections.add(session);
    ws.on('message',(data,binary)=>received(session,data,binary));ws.on('pong',data=>pong(session,data));ws.on('close',()=>ended(session));ws.on('error',()=>ws.terminate());
    session.tail=(async()=>{
      const result=await rpc('connect',{env:{headers}});mergeState(session,result);session.identifiers=result.identifiers || '{}';
      if(session.closed)return;
      if(result.status===1&&session.cstate.node_connection){session.ready=true;session.deadline=now()+pongTimeout;for(const transmission of result.transmissions || [])send(session,transmission);}
      else{for(const transmission of result.transmissions || [])send(session,transmission);close(session,'unauthorized',false,1008,!(result.transmissions || []).some(value=>parse(value)?.type==='disconnect'));}
    })().catch(()=>close(session,'server_restart',true));
  }
  server.on('upgrade',(req,socket,head)=>{
    socket.on('error',()=>{});
    let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return;}
    const protocols=String(req.headers['sec-websocket-protocol'] || '').split(',').map(p=>p.trim()).filter(Boolean);
    let status=0;
    if(!['/cable','/cable/'].includes(path))status=404;
    else if(stopping||!isReady()||connections.size>=maxConnections)status=503;
    else if(protocols.length&&!protocols.includes('actioncable-v1-json'))status=400;
    if(status){socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);return;}
    wss.handleUpgrade(req,socket,head,ws=>accepted(ws,req));
  });
  const timer=setInterval(()=>{
    const time=now();
    for(const session of connections){
      if(session.closed||session.closing)continue;
      if(time>=session.deadline){close(session,'server_restart',true,1001);continue;}
      if(!session.ready||time<session.nextPing)continue;
      session.nextPing=time+pingInterval;send(session,{type:'ping',message:Math.floor(Date.now()/1000)});
      if(session.closing)continue;
      for(const [key,sent] of session.pings)if(time-sent>=pongTimeout)session.pings.delete(key);
      const challenge=randomBytes(8);session.pings.set(challenge.toString('hex'),time);session.ws.ping(challenge,undefined,error=>{if(error)session.ws.terminate();});
    }
  },Math.min(pingInterval,1000));timer.unref();
  return {server,
    broadcast(encoded){
      if(typeof encoded!=='string'||Buffer.byteLength(encoded)>16*1024*1024)return;
      const envelope=parse(encoded);if(!object(envelope)||typeof envelope.stream!=='string'||!Object.hasOwn(envelope,'data'))return;
      let message=envelope.data;if(typeof message==='string'){try{message=JSON.parse(message);}catch{return;}}
      for(const subscription of streams.get(envelope.stream) || [])send(subscription.session,{identifier:subscription.identifier,message});
    },
    unavailable(){for(const session of connections)close(session,'server_restart',true);},
    stats:()=>({connections:connections.size,subscriptions:subscriptionCount,streams:streams.size,queuedBytes,cleanups:cleanups.size}),
    stop({timeout=8000}={}){
      if(stopPromise)return stopPromise;
      stopping=true;clearInterval(timer);server.close();
      stopPromise=(async()=>{
        for(const session of connections)close(session,'server_restart',true);
        const until=Date.now()+timeout;
        while((connections.size||cleanups.size)&&Date.now()<until)await delay(10);
        for(const session of connections)session.ws.terminate();
        wss.close();server.closeAllConnections();
      })();return stopPromise;
    },
  };
}
