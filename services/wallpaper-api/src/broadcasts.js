import {createHmac} from 'node:crypto';
export function createBroadcastClient({secretKeyBase,url='http://node_web:3004',fetchImpl=fetch}){
  const authorization='Bearer '+createHmac('sha256',secretKeyBase).update('walltaker:native-broadcasts:v1').digest('hex');
  return {async render(input){
    const response=await fetchImpl(new URL('/_internal/broadcasts/render',url),{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok){await response.body?.cancel();throw Error('Native broadcast rendering unavailable');}
    let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw Error('Broadcast too large');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');
  }};
}
