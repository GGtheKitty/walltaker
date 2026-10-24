import {createHmac,timingSafeEqual} from 'node:crypto';
import {CommandError} from './updates.js';
import {SESSION_COOKIE,CSRF_COOKIE} from './browser-sessions.js';
export const browserToken=secret=>createHmac('sha256',secret).update('walltaker:browser:commands:v1').digest('hex');
export function createBrowserHandler({secretKeyBase,sessions,data}) {
 const expected=Buffer.from('Bearer '+browserToken(secretKeyBase));
 const sessionOps=new Set(['context','csrf','login','logout','signup','evil','reset-request','authorize','assume','surrender-assume','surrender-return']);
 return async(request,response,url)=>{
  const send=(status,body)=>{response.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-walltaker-backend':'node-browser'});response.end(JSON.stringify(body));};
  const supplied=Buffer.from(request.headers.authorization || '');
  if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))return send(403,{message:'Forbidden.'});
  if(request.method!=='POST')return send(405,{message:'POST required.'});
  try{
   if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')throw new CommandError(415,'JSON required.');
   const op=/^\/_internal\/browser\/([a-z-]+)$/.exec(url.pathname)?.[1];if(!op)throw new CommandError(404,'Not found.');
   if(Number(request.headers['content-length'])>1048576)throw new CommandError(413,'Request too large.');
   let size=0;const chunks=[];
   for await(const chunk of request.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>1048576){request.resume();throw new CommandError(413,'Request too large.');}chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new CommandError(400,'Invalid JSON.');}
   if(!input || typeof input!=='object' || Array.isArray(input))throw new CommandError(400,'JSON object required.');
   const cookie=request.headers.cookie || '';
   let result=await(sessionOps.has(op)?sessions.request(op,input,cookie):data(op,input,cookie));
   if(op==='context')result={...result,...await data('context-data',{},cookie)};
   else if(result.cookies && result.user) {
    const nextCookie=result.cookies.filter(item=>[SESSION_COOKIE,CSRF_COOKIE].includes(item.name)).map(item=>item.name+'='+item.value).join('; ');
    result={...result,...await data('context-data',{},nextCookie)};
   }
   return send(200,result);
  }catch(error){if(error instanceof CommandError)return send(error.status,{message:error.message,errors:error.errors});throw error;}
 };
}
