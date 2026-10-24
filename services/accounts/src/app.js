import http from 'node:http';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { AccountError } from './errors.js';
export const accountToken = (secret) => createHmac('sha256',secret).update('walltaker:accounts:commands:v1').digest('hex');
export const accountEventToken = (secret) => createHmac('sha256',secret).update('walltaker:accounts:events:v1').digest('hex');
export function createServer({ manage,health,secretKeyBase,logger=console }) {
  const expected = Buffer.from(`Bearer ${accountToken(secretKeyBase)}`);
  return http.createServer(async (request,response) => {
    const send = (status,data) => { response.writeHead(status,{ 'content-type':'application/json','cache-control':'no-store','x-walltaker-backend':'node-accounts' }); response.end(JSON.stringify(data)); };
    try {
      const url = new URL(request.url,'http://localhost');
      if (url.pathname==='/up' && request.method==='GET') { await health(); return send(200,{ status:'ok' }); }
      const supplied = Buffer.from(request.headers.authorization || '');
      if (supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) return send(403,{ message:'Forbidden.' });
      const operation = /^\/_internal\/accounts\/([a-z-]+)$/.exec(url.pathname)?.[1];
      if (!operation) return send(404,{ message:'Not found.' });
      if (request.method!=='POST') return send(405,{ message:'POST required.' });
      if (request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json') return send(415,{ message:'JSON required.' });
      let size=0; const chunks=[];
      for await (const chunk of request) { size+=chunk.length;if(size>1024*1024) return send(413,{ message:'Request too large.' });chunks.push(chunk); }
      let input;
      try { input=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400,{ message:'Invalid JSON.' }); }
      return send(200,await manage(operation,input));
    } catch (error) {
      if (error instanceof AccountError) return send(error.status,{ message:error.message,...(error.errors ? { errors:error.errors } : {}) });
      logger.warn(`Accounts request failed: ${error.code || error.name}`);
      return send(503,{ message:'Accounts temporarily unavailable. Please retry.' });
    }
  });
}
export function startDelivery({ pool,secretKeyBase,railsUrl,fetchImpl=fetch,logger=console,interval=1000 }) {
  let running,stopped=false;
  const drain=async () => {
    const rows=(await pool.query('SELECT id FROM node_account_events WHERE delivered_at IS NULL AND available_at<=CURRENT_TIMESTAMP ORDER BY id LIMIT 10')).rows;
    for (const {id} of rows) {
      if(stopped)break;
      try {
        const response=await fetchImpl(`${railsUrl}/_internal/account-events/${id}.json`,{ method:'POST',headers:{ authorization:`Bearer ${accountEventToken(secretKeyBase)}` },signal:AbortSignal.timeout(15000),redirect:'error' });
        await response.arrayBuffer(); if(!response.ok)throw new Error('Account delivery failed');
      } catch(error) {
        logger.warn(`Account event delivery failed: ${error.code || error.name}`);
        await pool.query(`UPDATE node_account_events SET delivery_attempts=delivery_attempts+1,
          available_at=CURRENT_TIMESTAMP+LEAST(300,POWER(2,LEAST(delivery_attempts,8)))*INTERVAL '1 second',updated_at=CURRENT_TIMESTAMP
          WHERE id=$1 AND delivered_at IS NULL`,[id]);
      }
    }
  };
  const timer=setInterval(()=>{if(running||stopped)return;running=drain().catch(error=>logger.warn(`Account delivery failed: ${error.code||error.name}`)).finally(()=>{running=null;});},interval);
  timer.unref();return async()=>{stopped=true;clearInterval(timer);await running;};
}
