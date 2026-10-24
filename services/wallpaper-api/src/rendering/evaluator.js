import{Scope,Range,Constant,truth,equal,string}from'./values.js';
export class Next extends Error {}
// Only a fixed, build-generated template AST is executable. Request data never
// supplies syntax, callable properties, JavaScript source or template paths.
export class Evaluator {
 constructor(runtime){this.r=runtime;this.steps=0;}
 async run(node,scope=new Scope()) {
  if(++this.steps%4096===0)await new Promise(resolve=>setImmediate(resolve));
  if(this.steps>500000)throw Error('Render instruction limit exceeded');
  if(node==null||node===false)return null;
  if(!Array.isArray(node))return node;
  if(!node.length)return null;
  if(typeof node[0]!=='string'){let result=null;for(const part of node)result=await this.run(part,scope);return result;}
  const r=this.r,e=(n)=>this.run(n,scope),type=node[0];
  switch(type) {
   case 'bodystmt':return e(node[1]);
   case 'program':case 'paren':case 'arg_paren':return e(node[1]);
   case 'void_stmt':return null;
   case '@int':return Number(node[1]);
   case '@float':return Number(node[1]);
   case '@label':return node[1].replace(/:$/,'');
   case '@tstring_content':case '@string':return node[1];
   case '@kw':return {nil:null,true:true,false:false,self:r.self}[node[1]];
   case '@const':return new Constant(node[1]);
   case '@ivar':return node[1]==='@output_buffer'?r.buffer:r.assigns[node[1].slice(1)] ?? null;
   case '@ident':return scope.has(node[1])?scope.get(node[1]):r.helper(node[1],[],null,scope);
   case 'var_ref':case 'var_field':return node[1]?.[0]==='@ident'?(scope.get(node[1][1]) ?? null):e(node[1]);
   case 'vcall':case 'fcall':return scope.has(node[1][1])?scope.get(node[1][1]):r.helper(node[1][1],[],null,scope);
   case 'const_path_ref':{const name=(await e(node[1])).name+'::'+node[2][1];return name==='ProfileMarkdown::MAX_LENGTH'?50000:new Constant(name);}
   case 'string_literal':case 'dyna_symbol':return e(node[1]);
   case 'string_content':{let value='';for(const part of node.slice(1))value+=string(await e(part));return value;}
   case 'string_embexpr':return e(node[1]);
   case 'symbol_literal':return e(node[1]);
   case 'symbol':return node[1]?.[1] ?? '';
   case 'array':{const result=[];for(const part of node[1] || [])result.push(await e(part));return result;}
   case 'hash':return node[1]?e(node[1]):{};
   case 'assoclist_from_args':case 'bare_assoc_hash':{
    const hash=Object.create(null);for(const part of node[1] || []){
     if(part[0]==='assoc_splat')Object.assign(hash,await e(part[1]));
     else {const key=await e(part[1]);hash[key]=part[2]===null?await r.lookup(key,scope):await e(part[2]);}
    }return hash;
   }
   case 'args_add_block':{const args=[];for(const part of node[1] || [])args.push(await e(part));if(node[2])args.blockSymbol=await e(node[2]);return args;}
   case 'call':case 'command':case 'command_call':case 'method_add_arg':case 'method_add_block':return this.invoke(node,scope);
   case 'aref':{const object=await e(node[1]),args=await e(node[2]);return r.dispatch(object,'[]',args || [],null,scope);}
   case 'assign':return this.assign(node[1],await e(node[2]),scope);
   case 'opassign':{
    const old=await e(node[1]),op=node[2][1];
    if(op==='||='&&truth(old)||op==='&&='&&!truth(old))return old;
    const value=await e(node[3]);return this.assign(node[1],op==='||='||op==='&&='?value:await r.binary(old,op.slice(0,-1),value),scope);
   }
   case 'binary':{
    const a=await e(node[1]),op=node[2];if(['||','or'].includes(op))return truth(a)?a:e(node[3]);if(['&&','and'].includes(op))return truth(a)?e(node[3]):a;
    return r.binary(a,op,await e(node[3]));
   }
   case 'unary':{const value=await e(node[2]);return ['!','not'].includes(node[1])?!truth(value):node[1]==='-@'?-value:+value;}
   case 'if':case 'elsif':return truth(await e(node[1]))?e(node[2]):e(node[3]);
   case 'unless':return !truth(await e(node[1]))?e(node[2]):e(node[3]);
   case 'else':return e(node[1]);
   case 'ifop':return truth(await e(node[1]))?e(node[2]):e(node[3]);
   case 'if_mod':return truth(await e(node[1]))?e(node[2]):null;
   case 'unless_mod':return !truth(await e(node[1]))?e(node[2]):null;
   case 'case':{
    const value=await e(node[1]);let branch=node[2];while(branch?.[0]==='when'){
     for(const condition of branch[1])if(equal(value,await e(condition)))return e(branch[2]);branch=branch[3];
    }return e(branch);
   }
   case 'regexp_literal':{const body=node[1].map(part=>part[1]).join('').replace(/\\A/g,'^').replace(/\\z/g,'$');const flags=node[2][1].slice(1).replaceAll('m','s');return new RegExp(body,flags);}
   case 'yield':return r.yield(await e(node[1]));
   case 'yield0':return r.yield([]);
   case 'dot2':return new Range(await e(node[1]),await e(node[2]));
   case 'defined':{const name=node[1]?.[1]?.[1];return scope.has(name)?'local-variable':null;}
   case 'next':throw new Next();
   default:throw Error('Unsupported template syntax: '+type);
  }
 }
 async assign(target,value,scope){
  const r=this.r;if(target[0]==='var_field'){
   if(target[1][0]==='@ivar'){r.assigns[target[1][1].slice(1)]=value;return value;}return scope.set(target[1][1],value);
  }
  if(target[0]==='field'){
   const object=await this.run(target[1],scope),key=target[3][1];
   if(object===r.buffer){r.put(value,key==='safe_append');return value;}
   return r.dispatch(object,key+'=',[value],null,scope);
  }
  throw Error('Unsupported template assignment');
 }
 async invoke(node,scope,block=null,args=null){
  const r=this.r,e=n=>this.run(n,scope),type=node[0];
  if(type==='method_add_arg')return this.invoke(node[1],scope,block,(await e(node[2])) || []);
  if(type==='method_add_block'){
   const definition=node[2],params=definition[1]?.[1]?.[1] || [],body=definition[2];
   const callback=async(...values)=>{
    if(params.length>1&&values.length===1&&Array.isArray(values[0]))values=values[0];
    const child=new Scope(scope);for(let i=0;i<params.length;i++)child.values[params[i][1]]=values[i] ?? null;
    try{return await this.run(body,child);}catch(error){if(error instanceof Next)return null;throw error;}
   };
   return this.invoke(node[1],scope,callback,args);
  }
  if(type==='command')return r.helper(node[1][1],await e(node[2]),block,scope);
  if(type==='fcall'||type==='vcall')return r.helper(node[1][1],args || [],block,scope);
  if(type==='call'||type==='command_call'){
   const object=await e(node[1]);if(node[2]?.[1]==='&.'&&object==null)return null;
   const values=type==='command_call'?await e(node[4]):args || [];
   return r.dispatch(object,node[3][1],values,block,scope);
  }
  throw Error('Unsupported template call: '+type);
 }
}
