import { createHmac, timingSafeEqual } from 'node:crypto';
import { CommandError } from './updates.js';

export const activityToken = secret => createHmac('sha256',secret).update('walltaker:activity:commands:v1').digest('hex');
export function createActivityHandler({secretKeyBase,manage}) {
  const expected = Buffer.from(`Bearer ${activityToken(secretKeyBase)}`);
  return async (request,response,url) => {
    const send = (status,body) => {
      response.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-walltaker-backend':'node-activity'});
      response.end(JSON.stringify(body));
    };
    const supplied = Buffer.from(request.headers.authorization || '');
    if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) return send(403,{message:'Forbidden.'});
    if(request.method!=='POST') return send(405,{message:'POST required.'});
    try {
      if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json') throw new CommandError(415,'JSON required.');
      const operation = /^\/_internal\/activity\/([a-z-]+)$/.exec(url.pathname)?.[1];
      if(!operation) throw new CommandError(404,'Not found.');
      let size=0;const chunks=[];const max=1024*1024;
      if(Number(request.headers['content-length'])>max) throw new CommandError(413,'Request too large.');
      for await(const chunk of request.iterator({destroyOnReturn:false})) {
        size+=chunk.length;if(size>max){request.resume();throw new CommandError(413,'Request too large.');}chunks.push(chunk);
      }
      let input;
      try {input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch {throw new CommandError(400,'Invalid JSON.');}
      if(!input || typeof input!=='object' || Array.isArray(input)) throw new CommandError(400,'JSON object required.');
      return send(200,await manage(operation,input));
    } catch(error) {
      if(error instanceof CommandError)return send(error.status,{message:error.message});
      throw error;
    }
  };
}
