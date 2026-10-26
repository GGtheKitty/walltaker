import {createHmac} from 'node:crypto';

// A bounded shared executor limits load on the existing private realtime API.
// A socket supplies only channel commands; identity/state always comes from RPC.
export function createRpcClient({url,secretKeyBase,concurrency=4,maxQueue=128,timeout=5000,fetchImpl=fetch}){
  const endpoint=new URL(url);
  if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password)throw Error('Invalid realtime RPC URL');
  const authorization='Bearer '+createHmac('sha256',secretKeyBase).update('rpc-cable').digest('hex');
  let active=0;const queue=[];
  async function perform(method,payload){
    const response=await fetchImpl(new URL(endpoint.href.replace(/\/$/,'')+'/'+method),{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeout),redirect:'error'});
    if(!response.ok){await response.body?.cancel();throw Error('Realtime RPC unavailable');}
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>16*1024*1024)throw Error('Realtime RPC response too large');chunks.push(chunk);}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!result||typeof result!=='object'||![1,2].includes(result.status))throw Error('Invalid realtime RPC response');
    return result;
  }
  function drain(){while(active<concurrency&&queue.length){const job=queue.shift();active++;perform(job.method,job.payload).then(job.resolve,job.reject).finally(()=>{active--;drain();});}}
  return (method,payload)=>new Promise((resolve,reject)=>{
    if(!['connect','command','disconnect'].includes(method))return reject(Error('Invalid RPC method'));
    if(queue.length>=maxQueue)return reject(Error('Realtime RPC queue full'));
    const job={method,payload,resolve,reject};if(method==='disconnect')queue.unshift(job);else queue.push(job);drain();
  });
}
