import{createTokenIssuer}from'../../../e621-media/src/token.js';
import views from './views.json' with {type:'json'};
import metadata from './metadata.json' with {type:'json'};
import{createHmac,pbkdf2Sync}from'node:crypto';
import{Runtime}from'./runtime.js';
import{Record,raw,string,decodeDocument}from'./values.js';
export {Record,raw,string,decodeDocument}from'./values.js';
export function createRenderer({secretKeyBase,baseUrl,services={},now=Date.now,templates=views.templates,localDefaults=views.local_defaults,renderMetadata=metadata}={}) {
 const key=pbkdf2Sync(secretKeyBase,'turbo/signed_stream_verifier_key',1000,64,'sha256');
 const engine={templates,localDefaults,issueMedia:createTokenIssuer(secretKeyBase),metadata:renderMetadata,baseUrl,services,now,
  signStream(stream){const payload=Buffer.from(JSON.stringify(stream)).toString('base64');return payload+'--'+createHmac('sha256',key).update(payload).digest('hex');},
  globalId(record){const app=renderMetadata.global_id_app || 'walltaker';return Buffer.from(`gid://${app}/${record.type}/${record.id}`).toString('base64url');},
  record(type,row){const attrs={...row};for(const [name,value]of Object.entries(attrs))if(value&&typeof value==='string'&&(/_at$/.test(name)||['expires','failed_on'].includes(name))&&!Number.isNaN(Date.parse(value)))attrs[name]=new Date(value);return new Record(type,attrs);},
  resolve(name,{partial=false,prefix='',format='html'}={}){
   if(typeof name!=='string'||name.includes('..')||name.startsWith('/')||name.length>200)throw Error('Invalid template name');
   const names=name.includes('/')?[name]:[prefix?prefix+'/'+name:name,'application/'+name];
   const candidates=[];for(let candidate of names){
    if(partial){const parts=candidate.split('/');if(!parts.at(-1).startsWith('_'))parts[parts.length-1]='_'+parts.at(-1);candidate=parts.join('/');}
    candidates.push(candidate,candidate+'.'+format+'.erb',...(format==='json'?[candidate+'.json.jbuilder']:[]),candidate+'.html.erb',candidate+'.erb');
   }
   const found=candidates.find(candidate=>Object.hasOwn(templates,candidate));if(!found)throw Error('Unknown template: '+name+' ('+prefix+')');return found;
  },
  async render(document){
   if(!document || typeof document!=='object')throw Error('Invalid render document');
   const values=decodeDocument(document),runtime=new Runtime(engine,values);
   const body=await runtime.template(document.template,values.locals,!!document.partial);if(runtime.context.format==='json')return JSON.stringify(runtime.jsonValue);runtime.body=string(body);
   if(document.layout && !(runtime.context.turbo_frame&&document.layout==='application'))return string(await runtime.template('layouts/'+document.layout,{},false));
   return runtime.body;
  },
 };
 return engine;
}
