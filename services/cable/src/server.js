import {createClient} from 'redis';
import {createGateway} from './gateway.js';
import {createRpcClient} from './rpc.js';
for(const key of ['REDIS_URL','SECRET_KEY_BASE','REALTIME_RPC_URL'])if(!process.env[key])throw Error(key+' is required');
const subscriber=createClient({url:process.env.REDIS_URL,disableOfflineQueue:true,socket:{connectTimeout:3000}});
let ready=false,subscribed=false;
const gateway=createGateway({rpc:createRpcClient({url:process.env.REALTIME_RPC_URL,secretKeyBase:process.env.SECRET_KEY_BASE}),isReady:()=>ready});
const unavailable=()=>{ready=false;gateway.unavailable();};
subscriber.on('error',error=>{console.warn(JSON.stringify({event:'cable-redis-error',code:error.code || error.name}));unavailable();});subscriber.on('reconnecting',unavailable);subscriber.on('end',unavailable);subscriber.on('ready',()=>{if(subscribed)ready=true;});
await subscriber.connect();await subscriber.subscribe(process.env.CABLE_REDIS_CHANNEL || '__anycable__',message=>gateway.broadcast(message));subscribed=true;ready=true;
gateway.server.listen(Number(process.env.PORT || 8080),'0.0.0.0',()=>console.log('Node websocket gateway listening on '+gateway.server.address().port));
let stopping=false;
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{
  if(stopping)return;stopping=true;ready=false;await gateway.stop();
  // Pub/sub reconnection must not hold shutdown open past Docker's grace period.
  let timer;try{if(subscriber.isOpen)await Promise.race([subscriber.close(),new Promise(resolve=>{timer=setTimeout(()=>{try{subscriber.destroy();}catch{}resolve();},1500);})]);}catch{}finally{clearTimeout(timer);}
  process.exit(0);
});
