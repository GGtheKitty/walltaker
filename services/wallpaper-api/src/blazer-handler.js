import {createHmac,timingSafeEqual} from 'node:crypto';
import {readApiBody} from './body.js';
import {CommandError} from './updates.js';
export function createBlazerHandler({secretKeyBase,manage}){
  const expected=Buffer.from('Bearer '+createHmac('sha256',secretKeyBase).update('walltaker:blazer:commands:v1').digest('hex'));
  return async(req,res,url)=>{
    const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-walltaker-backend':'node-blazer'});res.end(JSON.stringify(data));};
    const supplied=Buffer.from(req.headers.authorization || '');if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(403,{message:'Forbidden.'});
    if(req.method!=='POST')return send(405,{message:'POST required.'});
    const op=/^\/_internal\/blazer\/([a-z-]+)$/.exec(url.pathname)?.[1];if(!op)return send(404,{message:'Not found.'});
    try{return send(200,await manage.request(op,await readApiBody(req)));}catch(error){if(error instanceof CommandError)return send(error.status,{message:error.message});throw error;}
  };
}
