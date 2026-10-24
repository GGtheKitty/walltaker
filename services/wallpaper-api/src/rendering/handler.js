import{escape}from'./values.js';
import{createHmac,timingSafeEqual}from'node:crypto';
export const renderingToken=secret=>createHmac('sha256',secret).update('walltaker:rendering:v1').digest('hex');
export function createRenderingHandler({secretKeyBase,renderer,publish,logger=console}){
 let active=0;const waiters=[];
 const acquire=()=>{if(active<2){active++;return Promise.resolve(true);}if(waiters.length>=8)return Promise.resolve(false);return new Promise(resolve=>waiters.push(resolve));};
 const release=()=>{const next=waiters.shift();if(next)next(true);else active--;};
 const expected=Buffer.from('Bearer '+renderingToken(secretKeyBase));
 return async(req,res,url)=>{
  const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-walltaker-renderer':'node'});res.end(JSON.stringify(data));};
  const supplied=Buffer.from(req.headers.authorization || '');if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(403,{message:'Forbidden.'});
  if(req.method!=='POST'||url.pathname!=='/_internal/rendering/render')return send(404,{message:'Not found.'});
  if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')return send(415,{message:'JSON required.'});
  const limit=16*1024*1024;if(Number(req.headers['content-length'])>limit)return send(413,{message:'Render document too large.'});
  if(!await acquire())return send(503,{message:'Renderer busy. Please retry.'});
  try{
   const chunks=[];let size=0;for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>limit){req.resume();return send(413,{message:'Render document too large.'});}chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{message:'Invalid JSON.'});}
   if(!input||typeof input!=='object'||Array.isArray(input))return send(400,{message:'Invalid render document.'});
   if(input.operation==='broadcast'||input.operation==='turbo') {
    if((input.operation==='broadcast'&&(!publish||typeof input.stream!=='string'||input.stream.length>4096||/[\x00-\x1f]/.test(input.stream)))||!['append','prepend','replace','update','remove','before','after','refresh'].includes(input.action))return send(422,{message:'Invalid live delivery.'});
    const target=input.target!=null?' target="'+escape(input.target)+'"':input.targets!=null?' targets="'+escape(input.targets)+'"':'';
    const html=input.action==='remove'||input.action==='refresh'?'':input.html!=null?String(input.html):await renderer.render(input);
    const body='<turbo-stream action="'+input.action+'"'+target+'>'+(input.action==='remove'||input.action==='refresh'?'':'<template>'+html+'</template>')+'</turbo-stream>';
    if(input.operation==='turbo')return send(200,{html:body});
    await publish(input.stream,body);return send(200,{delivered:true});
   }
   return send(200,{html:await renderer.render(input)});
  }catch(error){logger.warn(`Node render failed: ${error.template || 'document'}: ${error.message}`);return send(503,{message:'Page rendering is temporarily unavailable.'});}finally{release();}
 };
}
