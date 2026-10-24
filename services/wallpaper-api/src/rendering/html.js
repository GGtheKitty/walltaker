import sanitizeHtml from 'sanitize-html';
import{marked}from'marked';
import{Html,raw,string,escape,blank,truth,Record,modelKey,modelPlural}from'./values.js';
export const attributes=options=>Object.entries(options || {}).flatMap(([key,value])=>{
 if(key==='class'&&value&&typeof value==='object'){const tokens=v=>Array.isArray(v)?v.flatMap(tokens):typeof v==='object'?Object.keys(v).filter(k=>truth(v[k])):v==null||v===false?[]:[String(v)];value=tokens(value).join(' ');}
 if(key==='data'||key==='aria')return Object.entries(value || {}).map(([name,v])=>v==null?null:`${key}-${name.replaceAll('_','-')}="${escape(typeof v==='object'?JSON.stringify(v):v)}"`).filter(Boolean);
 if(value===null||value===undefined||value===false)return [];
 key=key.replaceAll('_','-');return [value===true?`${key}="${key}"`:`${key}="${escape(Array.isArray(value)?value.join(' '):value)}"`];
}).join(' ');
const voids=new Set(['input','img','source','link','meta','br','hr','base','area','col','embed','param','track','wbr']);
export function tag(name,content='',options={}){if(!/^[a-z][a-z0-9-]*$/.test(name))throw Error('Invalid HTML tag');const attrs=attributes(options);return raw(`<${name}${attrs?' '+attrs:''}>${voids.has(name)?'':(content instanceof Html?content.toString():escape(content))+`</${name}>`}`);}
export function parameterPairs(object,prefix=''){
 const result=[];
 for(const [key,value]of Object.entries(object || {})){
  const name=prefix?prefix+'['+key+']':key;
  if(Array.isArray(value))for(const item of value)result.push([name+'[]',string(item)]);
  else if(value&&typeof value==='object'&&!(value instanceof Record)&&!(value instanceof Date))result.push(...parameterPairs(value,name));
  else if(value!=null)result.push([name,string(value instanceof Record?value.id:value)]);
 }
 return result;
}
export const input=(type,name,value='',options={})=>tag('input','',{type,name,id:name.replace(/\]\[|\[/g,'_').replace(/\]/g,''),value,...options});
export const marker='<!-- walltaker:markdown -->\n';
export const markdownSource=value=>string(value).startsWith(marker)?string(value).slice(marker.length):string(value);
export const markdown=value=>marked.parse(markdownSource(value),{gfm:true,breaks:true});
const advancedTags='table th picture nav header footer ins kbd main marquee section map time area figure figcaption hgroup thead tbody tfoot details summary caption colgroup td tr link a abbr acronym address b big blockquote br cite code dd del dfn div dl dt em h1 h2 h3 h4 h5 h6 hr i img ins kbd li ol p pre samp small span strong sub sup time tt ul var style comment video audio source iframe relative-time sparkly-text'.split(' ');
const advancedAttributes='behavior bgcolor direction hspace datetime scrollamount scrolldelay truespeed align valign vspace style src href class id width height alt lang title rel colspan rowspan controls autoplay loop preload muted shape coords target'.split(' ');
export function sanitize(value,options={}){
 return raw(sanitizeHtml(string(value),{allowedTags:options.scrubber?advancedTags:[...sanitizeHtml.defaults.allowedTags,'img','style','ins'],
  allowedAttributes:{'*':advancedAttributes},allowedSchemes:['http','https','ftp','mailto','tel'],allowedSchemesByTag:{img:['http','https','data']},
  allowVulnerableTags:true,parseStyleAttributes:false,transformTags:{'*':(name,attrs)=>{if(attrs.style&&/(?:expression\s*\(|javascript\s*:|vbscript\s*:)/i.test(attrs.style))delete attrs.style;return {tagName:name,attribs:attrs};}}}));
}
export function simpleFormat(value,options={}){const clean=string(sanitize(value));return raw(clean.replace(/\r\n?/g,'\n').split(/\n\n+/).map(p=>`<p${attributes(options)?' '+attributes(options):''}>${p.replace(/\n/g,'<br />\n')}</p>`).join('\n\n'));}
export const stripTags=value=>sanitizeHtml(string(value),{allowedTags:[],allowedAttributes:{}});
export function durationWords(first,second=new Date()){
 const minutes=Math.round(Math.abs(new Date(second)-new Date(first))/60000);
 if(minutes<1)return 'less than a minute';if(minutes===1)return '1 minute';if(minutes<45)return `${minutes} minutes`;
 if(minutes<90)return 'about 1 hour';if(minutes<1440)return `about ${Math.round(minutes/60)} hours`;
 if(minutes<2520)return '1 day';if(minutes<43200)return `${Math.round(minutes/1440)} days`;
 if(minutes<86400)return 'about 1 month';if(minutes<525600)return `${Math.round(minutes/43200)} months`;
 return `about ${Math.round(minutes/525600)} year${Math.round(minutes/525600)===1?'':'s'}`;
}
export function formatDate(value,format){
 const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const pad=n=>String(n).padStart(2,'0'),hour=date.getUTCHours(),month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getUTCMonth()],day=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getUTCDay()];
 const parts={'%Y':date.getUTCFullYear(),'%m':pad(date.getUTCMonth()+1),'%d':pad(date.getUTCDate()),'%e':String(date.getUTCDate()).padStart(2,' '),'%H':pad(hour),'%I':pad(hour%12||12),'%M':pad(date.getUTCMinutes()),'%S':pad(date.getUTCSeconds()),'%p':hour<12?'AM':'PM','%P':hour<12?'am':'pm','%b':month,'%B':date.toLocaleString('en-US',{month:'long',timeZone:'UTC'}),'%A':day,'%a':day.slice(0,3),'%Z':'UTC','%%':'%'};
 return String(format || '%d %b %H:%M').replace(/%[A-Za-z%]/g,key=>parts[key] ?? key);
}
export function createRoutes(metadata,context){
 const route=(name,args=[],forceMain=false)=>{
  const absolute=name.endsWith('_url');name=name.replace(/_(?:path|url)$/,'');let options={};args=[...args];
  if(args.length && !(args.at(-1) instanceof Record) && typeof args.at(-1)==='object' && !Array.isArray(args.at(-1)))options=args.pop() || {};
  const engine=!forceMain&&context.engine==='nuttracker';let pattern=(engine?metadata.engine_routes?.[name]:null) || metadata.routes[name];
  if(!pattern)throw Error('Unknown route: '+name);
  pattern=pattern.replace('(.:format)',options.format?'.'+encodeURIComponent(options.format):'');delete options.format;
  pattern=pattern.replace(/\(\/:[a-zA-Z_]+\)/g,group=>{const key=group.slice(3,-1);return options[key]!=null||args.some(v=>v!=null)?group.slice(1,-1):'';});
  pattern=pattern.replace(/:([a-zA-Z_]+)/g,(_,key)=>{
   let value=Object.hasOwn(options,key)?options[key]:args.shift();delete options[key];
   if(value instanceof Record)value=key==='username'?value.attrs.username:value.id;
   if(value==null) value=context.route_parameters?.[key];
   if(value==null)throw Error('Missing route parameter '+name+':'+key);
   return encodeURIComponent(string(value));
  });
  const anchor=options.anchor;delete options.anchor;delete options.only_path;const query=new URLSearchParams();
  for(const [key,value] of parameterPairs(options))query.append(key,value);
  return (absolute?context.base_url:'')+pattern+(query.size?'?'+query:'')+(anchor!=null?'#'+encodeURIComponent(anchor):'');
 };
 const polymorphic=(value,{newRecord=false,absolute=false}={})=>{
  let parts=Array.isArray(value)?[...value]:[value];const record=parts.at(-1),type=record instanceof Record?record.type:record instanceof Object&&record.name?record.name:null;
  if(!type) return typeof record==='string'?record:'/';
  const model=metadata.models?.[type] || {route_key:modelPlural(type).split('/').at(-1),singular_route_key:modelKey(type)};
  const parent=parts.length>1?parts[0]:null;let name=(newRecord?'new_':'')+(parent instanceof Record?modelKey(parent.type)+'_':'')+(record?.name&&!newRecord?model.route_key:model.singular_route_key);
  const args=parts.filter(v=>v instanceof Record);if(newRecord&&record instanceof Record)args.pop();if(!newRecord&&record.meta?.new_record){name=(parent instanceof Record?modelKey(parent.type)+'_':'')+model.route_key;args.pop();}
  return route(name+(absolute?'_url':'_path'),args);
 };
 return {route,polymorphic};
}
export class FormBuilder {
 constructor(runtime,model,options={}){this.runtime=runtime;this.model=Array.isArray(model)?model.at(-1):model;this.options=options;this.scope=options.scope || (this.model instanceof Record?(runtime.metadata.models[this.model.type]?.param_key || modelKey(this.model.type)):'');}
 async call(method,args,block){
  if(method==='button'){const opts=typeof args[0]==='object'?args[0]:args[1] || {};return tag('button',block?await this.runtime.capture(block):args[0] || 'Submit',{name:'button',type:'submit',...opts});}
  if(method==='submit'){const opts=typeof args[0]==='object'?args[0]:args[1] || {};const label=typeof args[0]==='string'?args[0]:(this.model?.meta?.new_record?'Create ':'Update ')+(this.model?.type || '');return input('submit','commit',label,opts);}
  const r=this.runtime,field=args[0],name=this.scope?`${this.scope}[${field}]`:String(field),id=this.scope?`${this.scope}_${field}`:String(field);
  const attrs=this.model instanceof Record?this.model.attrs:{};const value=attrs[field] ?? '';
  if(method==='label'){const text=args.length>1&&typeof args[1]!=='object'?args[1]:String(field).replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());const opts=typeof args[1]==='object'?args[1]:args[2] || {};return tag('label',block?await r.capture(block):text,{for:id,...opts});}
  if(method==='text_area'){const opts={...args[1]};if(opts.size){const [cols,rows]=String(opts.size).split('x');Object.assign(opts,{cols,rows});delete opts.size;}return tag('textarea',opts.value ?? value,{name,id,...opts});}
  if(method==='select'){const choices=args[1],opts=args[2] || {},html=args[3] || {};const selected=opts.selected ?? value;return tag('select',raw((opts.include_blank?`<option value="">${escape(typeof opts.include_blank==='string'?opts.include_blank:'')}</option>`:'')+r.optionsForSelect(choices,selected)),{name,id,...html});}
  if(method==='check_box'){
   const opts=args[1] || {},checked=args[2] ?? '1',unchecked=args[3] ?? '0',multiple=opts.multiple;const actualName=name+(multiple?'[]':'');
   return raw(string(input('hidden',actualName,unchecked,{id:null,autocomplete:'off'}))+string(input('checkbox',actualName,checked,{id:id+(multiple?'_'+checked:''),checked:opts.checked ?? (Array.isArray(value)?value.includes(checked):truth(value)&&value!==''&&value!=='0'),...opts})));
  }
  if(method==='radio_button')return input('radio',name,args[1],{id:id+'_'+args[1],checked:String(value)===String(args[1]),...args[2]});
  const types={text_field:'text',password_field:'password',hidden_field:'hidden',number_field:'number',url_field:'url',datetime_field:'datetime-local',range_field:'range'};
  if(types[method])return input(types[method],name,method==='password_field'?'':args[1]?.value ?? (value instanceof Date?(method==='datetime_field'?value.toISOString().slice(0,16):value.toISOString()):value),{id,...args[1]});
  throw Error('Unsupported form field: '+method);
 }
}
