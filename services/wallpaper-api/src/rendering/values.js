// Presentation values only. No record can execute SQL or expose object prototypes.
export class Html { constructor(value=''){this.value=String(value);}toString(){return this.value;} }
export const raw=value=>value instanceof Html?value:new Html(value ?? '');
export const string=value=>value==null?'':value instanceof Date?value.toISOString():value instanceof Record?value.label():String(value);
export const escape=value=>string(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const truth=value=>value!==null && value!==undefined && value!==false;
export const blank=value=>value==null || value===false || typeof value==='string' && !value.trim() || Array.isArray(value)&&!value.length || value instanceof Map&&!value.size;
export const equal=(a,b)=>a instanceof Record&&b instanceof Record?a.type===b.type&&String(a.id)===String(b.id):a===b;
export const snake=value=>String(value).replace(/([a-z\d])([A-Z])/g,'$1_$2').replaceAll('::','/').toLowerCase();
export const singular=value=>({people:'person',kink_havers:'kink_haver',abilities:'ability'}[value] || value.replace(/ies$/,'y').replace(/s$/,''));
export const plural=(value,count)=>count===1?value:({person:'people',ability:'abilities',entry:'entries',history:'histories'}[value] || (/y$/.test(value)?value.replace(/y$/,'ies'):value+'s'));
export const modelKey=type=>({ 'Nuttracker::Orgasm':'orgasm','Ahoy::Visit':'visit','Ahoy::Event':'event' }[type] || snake(type));
export const modelPlural=type=>({ 'Nuttracker::Orgasm':'nuttracker/orgasms','Ahoy::Visit':'ahoy/visits','Ahoy::Event':'ahoy/events' }[type] || plural(modelKey(type)));
export class Record {
 constructor(type,attrs={},associations={},meta={}) {this.type=type;this.attrs=attrs;this.associations=associations;this.meta=meta;}
 get id(){return this.attrs.id;}
 label(){return this.type==='User'?this.attrs.username:this.type==='Link'?'Link #'+this.id:this.type==='Kink'?this.attrs.name:this.attrs.name || `${this.type} #${this.id}`;}
}
export class Scope {
 constructor(parent=null,values={}){this.parent=parent;this.values=Object.assign(Object.create(null),values);}
 has(key){return Object.hasOwn(this.values,key)||!!this.parent?.has(key);}
 get(key){return Object.hasOwn(this.values,key)?this.values[key]:this.parent?.get(key);}
 set(key,value){let scope=this;while(scope.parent&&!Object.hasOwn(scope.values,key))scope=scope.parent;if(!Object.hasOwn(scope.values,key))scope=this;scope.values[key]=value;return value;}
}
export class Range {constructor(first,last){this.first=first;this.last=last;}}
export class Duration {constructor(seconds){this.seconds=seconds;}}
export class Constant {constructor(name){this.name=name;}}
export function decodeDocument(document) {
 const records=new Map();
 for(const [key,value] of Object.entries(document.records || {}))records.set(key,new Record(value.type));
 const decode=value=>{
  if(Array.isArray(value))return value.map(decode);
  if(!value || typeof value!=='object')return value;
  if(value.$object)return Object.fromEntries(value.$object.map(([key,v])=>[key,decode(v)]));
  if(value.$ref)return records.get(value.$ref) || null;
  if(value.$html!==undefined)return raw(value.$html);
  if(value.$time)return new Date(value.$time);
  if(value.$map)return new Map(value.$map.map(([k,v])=>[decode(k),decode(v)]));
  if(value.$constant)return new Constant(value.$constant);
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
 };
 for(const [key,value] of Object.entries(document.records || {})) {
  const r=records.get(key);r.attrs=decode(value.attributes || {});r.associations=decode(value.associations || {});r.meta=decode(value.meta || {});
 }
 return {assigns:decode(document.assigns || {}),locals:decode(document.locals || {}),context:decode(document.context || {}),records};
}

// Data hashes have an explicit envelope; user-controlled keys can never masquerade
// as a safe-HTML value or a record reference in the rendering protocol.
export function encodeValue(value){
 if(value instanceof Date)return {$time:value.toISOString()};
 if(value instanceof Html)return {$html:value.toString()};
 if(Array.isArray(value))return value.map(encodeValue);
 if(value&&typeof value==='object')return {$object:Object.entries(value).map(([k,v])=>[k,encodeValue(v)])};
 return value;
}
