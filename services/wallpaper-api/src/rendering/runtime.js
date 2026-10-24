import{createHmac,pbkdf2Sync,randomUUID}from'node:crypto';
import{Html,raw,string,escape,truth,blank,equal,Record,Range,Duration,Constant,Scope,modelKey,modelPlural,plural}from'./values.js';
import{attributes,tag,input,FormBuilder,createRoutes,parameterPairs,sanitize,simpleFormat,stripTags,durationWords}from'./html.js';
import{dispatch}from'./methods.js';
import{Evaluator}from'./evaluator.js';
export class Runtime {
 constructor(engine,document){
  this.engine=engine;this.metadata={...engine.metadata,...document.context?.render_metadata};Object.assign(this,document);this.context={base_url:engine.baseUrl,...document.context};this.assigns={...document.assigns};
  this.services=engine.services || {};this.buffer={};this.output=[];this.contents=new Map();this.body='';this.localStack=[];this.templateStack=[];
  this.evaluator=new Evaluator(this);this.tagObject={};this.streamObject={};this.mainRoutes={};this.self={};this.jsonObject={};this.jsonValue={};this.jsonTarget=this.jsonValue;this.routes=createRoutes(this.metadata,this.context);this.now=engine.now || Date.now;
 }
 put(value,safe=false){this.output.push(safe||value instanceof Html?string(value):escape(value));if(this.output.length>100000)throw Error('Rendered output limit exceeded');}
 async capture(block,...args){const previous=this.output;this.output=[];try{const value=await block(...args);return raw(this.output.length?this.output.join(''):value===this.buffer||value&&typeof value==='object'&&!(value instanceof Html)&&!(value instanceof Date)?'':string(value));}finally{this.output=previous;}}
 async template(name,locals={},partial=false){
  if(this.templateStack.length>=35)throw Error('Template recursion limit exceeded');
  const resolved=this.engine.resolve(name,{partial,prefix:this.templateStack.at(-1)?.split('/').slice(0,-1).join('/') || this.context.controller_path,format:this.context.format || 'html'});
  locals={...locals};const scope=new Scope(null,locals);
  for(const [key,expression]of Object.entries(this.engine.localDefaults?.[resolved] || {}))if(!Object.hasOwn(locals,key)){locals[key]=await this.evaluator.run(expression,scope);scope.set(key,locals[key]);}
  this.templateStack.push(resolved);this.localStack.push(locals);
  try{return await this.capture(()=>this.evaluator.run(this.engine.templates[resolved],scope));}
  catch(error){if(!error.template)error.template=resolved;throw error;}finally{this.templateStack.pop();this.localStack.pop();}
 }
 async yield(args){return raw(args?.length?this.contents.get(string(args[0])) || '':this.body);}
 async lookup(name,scope){if(scope?.has(name))return scope.get(name);return this.helper(name,[],null,scope);}
 dispatch(...args){return dispatch(this,...args);}
 async binary(a,op,b){
  if(['==','==='].includes(op))return equal(a,b);if(op==='!=')return !equal(a,b);
  if(op==='>')return a>b;if(op==='<')return a<b;if(op==='>=')return a>=b;if(op==='<=')return a<=b;
  if(op==='+'){if(a instanceof Date&&b instanceof Duration)return new Date(a.getTime()+b.seconds*1000);return typeof a==='number'&&typeof b==='number'?a+b:string(a)+string(b);}
  if(op==='-'){if(a instanceof Date)return b instanceof Date?(a.getTime()-b.getTime())/1000:new Date(a.getTime()-(b instanceof Duration?b.seconds:b)*1000);return a-b;}
  if(op==='*')return typeof a==='string'?a.repeat(b):a*b;if(op==='/')return a/b;if(op==='%')return a%b;
  throw Error('Unknown presentation operator: '+op);
 }
 truncate(value,options={}){const chars=[...string(value)],length=options.length || 30;if(chars.length<=length)return string(value);let text=chars.slice(0,length-3).join('');if(options.separator&&text.includes(options.separator))text=text.slice(0,text.lastIndexOf(options.separator));return text+'...';}
 domId(value,prefix){if(typeof value==='string'||typeof value==='number')return string(value);const key=this.metadata.models[value?.type]?.singular || modelKey(value?.type || 'record');return [prefix || (value?.id==null?'new':null),key,value?.id].filter(v=>v!=null).join('_');}
 assetPath(value){const source=string(value);if(/^(?:https?:|data:|\/)/.test(source))return source;return (this.metadata.asset_prefix || '/assets').replace(/\/$/,'')+'/'+(this.metadata.assets[source] || source);}
 optionsForSelect(choices,selected){return (Array.isArray(choices)?choices:Object.entries(choices || {})).map(value=>{const pair=Array.isArray(value)?value:[value,value],label=pair[0],id=pair[1];return string(tag('option',label,{value:id,selected:Array.isArray(selected)?selected.map(String).includes(String(id)):String(selected)===String(id)}));}).join('');}
 async tagHelper(name,args,block){if(name==='attributes')return raw(attributes(args[0]));const opts=args[0]&&typeof args[0]==='object'&&!(args[0] instanceof Html)?args[0]:args[1] || {};const content=block?await this.capture(block):typeof args[0]==='object'?'':args[0];return tag(name==='relative_time'?'relative-time':name,content,opts);}
 async streamHelper(action,args,block){const target=args[0] instanceof Record?this.domId(args[0]):args[0],options=args[1] || {};let html=block?await this.capture(block):options.partial?await this.render([options.partial,options.locals || {}]):options.html || '';return raw(`<turbo-stream${attributes({action,target})?' '+attributes({action,target}):''}>${action==='remove'?'':`<template>${string(html)}</template>`}</turbo-stream>`);}
 async render(args){
  let name=args[0],options=args[1] || {};
  if(name&&typeof name==='object'&&!Array.isArray(name)&&!(name instanceof Record)){options=name;name=options.partial || options.template;}
  if(Array.isArray(name)){let html='';for(const record of name)html+=string(await this.render([record]));return raw(html);}
  if(name instanceof Record){const model=this.metadata.models[name.type] || {collection:modelPlural(name.type),element:modelKey(name.type)};return this.template(model.collection+'/'+model.element,{[model.element]:name,...options},true);}
  if(options.collection){let html='';for(const value of options.collection)html+=string(await this.template(name,{...options.locals,[options.as || String(name).split('/').at(-1)]:value},true));return raw(html);}
  const locals={...options.locals,...(args[1] && !options.locals?args[1]:{})};
  return this.template(name,locals,!options.template);
 }
 async helper(name,args=[],block=null,scope=null){
  const ctx=this.context,user=ctx.current_user;
  if(/_(?:path|url)$/.test(name)&&(this.metadata.routes[name.replace(/_(?:path|url)$/,'')]||this.metadata.engine_routes?.[name.replace(/_(?:path|url)$/,'')]))return this.routes.route(name,args);
  if(['main_app','tag','turbo_stream'].includes(name))return {main_app:this.mainRoutes,tag:this.tagObject,turbo_stream:this.streamObject}[name];
  if(name==='render')return this.render(args);
  if(name==='json')return this.jsonObject;
  if(name==='current_user')return user || null;
  if(name==='is_surrender_controller_session?')return !!ctx.surrender;
  if(name==='surrender_controller')return ctx.surrender?.associations?.controller_user || null;
  if(name==='params'||name==='filter_params')return ctx.parameters || {};
  if(name==='flash')return ctx.flash || {};
  if(name==='request')return {original_url:ctx.original_url || ctx.base_url+ctx.path,path:ctx.path,env:ctx.request_env || {}};
  if(name==='response')return {status:ctx.status || 200};
  if(name==='action_name')return ctx.action_name;
  if(name==='_filtered_referrer')return ctx.referrer || null;
  if(name==='local_assigns')return this.localStack.at(-1) || {};
  if(name==='walltaker_base_url')return ctx.base_url;
  if(name==='walltaker_url')return ctx.base_url+(args[0]?'/'+string(args[0]).replace(/^\//,''):'');
  if(name==='content_for?')return this.contents.has(string(args[0]));
  if(name==='content_for'){this.contents.set(string(args[0]),block?string(await this.capture(block)):string(args[1]));return null;}
  if(name==='dom_id')return this.domId(...args);
  if(name==='turbo_frame_tag')return tag('turbo-frame',block?await this.capture(block):'',{id:args[0] instanceof Record?this.domId(args[0]):args[0],...args[1]});
  if(name==='turbo_stream_from'){
   const stream=args.filter(v=>v!=null&&!(typeof v==='object'&&!(v instanceof Record))).map(value=>value instanceof Record?this.engine.globalId(value):string(value)).join(':');
   return tag('turbo-cable-stream-source','',{channel:'Turbo::StreamsChannel','signed-stream-name':this.engine.signStream(stream)});
  }
  if(name==='link_to'){
   let label,url,opts;if(block){url=args[0];opts=args[1] || {};label=await this.capture(block);}else{label=args[0];url=args[1] ?? args[0];opts=args[2] || {};}
   url=url==='back'?ctx.referrer || '#':url instanceof Record?this.routes.polymorphic(url):url&&typeof url==='object'?await this.urlFor(url):url;
   return tag('a',label,{href:url,...opts});
  }
  if(name==='button_to'){
   let label,url,opts;if(block){url=args[0];opts=args[1] || {};label=await this.capture(block);}else if(args.length===1 || args[1]&&typeof args[1]==='object'&&!(args[1] instanceof Record)){url=args[0];opts=args[1] || {};label=url instanceof Record?url.label():'Submit';}else{label=args[0];url=args[1];opts=args[2] || {};}
   if(url instanceof Record)url=this.routes.polymorphic(url);if(typeof url==='object')url=await this.urlFor(url);
   const method=string(opts.method || 'post').toLowerCase(),{method:_,params,form,...buttonOptions}=opts;
   const extra=parameterPairs(params || {}).map(([k,v])=>string(input('hidden',k,v,{id:null,autocomplete:'off'}))).join('');
   return tag('form',raw(this.formTokens(method)+extra+string(tag('button',label,{type:'submit',...buttonOptions}))),{class:'button_to',method:method==='get'?'get':'post',action:url,...form});
  }
  if(name==='form_with'){
   const opts=args[0] || {},model=opts.model,record=Array.isArray(model)?model.at(-1):model;
   const url=opts.url || (record?this.routes.polymorphic(model):ctx.path),method=string(opts.method || (record?.id&&!record?.meta?.new_record?'patch':'post')).toLowerCase();
   const builder=new FormBuilder(this,model,opts),body=block?await this.capture(block,builder):raw('');
   const formOptions={...opts,...opts.html};for(const k of ['model','url','method','scope','local','authenticity_token','html'])delete formOptions[k];
   return tag('form',raw(this.formTokens(method)+string(body)),{action:url,'accept-charset':'UTF-8',method:method==='get'?'get':'post',...formOptions});
  }
  if(name==='button_tag'){const opts=typeof args[0]==='object'?args[0]:args[1] || {};return tag('button',block?await this.capture(block):typeof args[0]==='string'?args[0]:'Button',{name:'button',type:'submit',...opts});}
  if(name==='label_tag')return tag('label',args[1] ?? string(args[0]).replaceAll('_',' '),{for:args[0],...args[2]});
  const fieldTypes={text_field_tag:'text',password_field_tag:'password',hidden_field_tag:'hidden',check_box_tag:'checkbox',submit_tag:'submit'};
  if(fieldTypes[name]){
   if(name==='submit_tag')return input('submit','commit',args[0] || 'Save changes',args[1]);
   const opts=name==='check_box_tag'?args[3] || {}:args[2] || {};return input(fieldTypes[name],args[0],name==='password_field_tag'?'':args[1] ?? '',{...(name==='check_box_tag'?{checked:args[2]}:{}),...opts});
  }
  if(name==='options_for_select')return raw(this.optionsForSelect(args[0],args[1]));
  if(name==='options_from_collection_for_select'){const rows=[];for(const v of args[0] || [])rows.push([await this.dispatch(v,args[2],[]),await this.dispatch(v,args[1],[])]);return raw(this.optionsForSelect(rows,args[3]));}
  if(name==='grouped_options_for_select')return raw(Object.entries(args[0] || {}).map(([label,choices])=>string(tag('optgroup',raw(this.optionsForSelect(choices,args[1])),{label}))).join(''));
  if(name==='polymorphic_url'||name==='polymorphic_path'||name==='new_polymorphic_path')return this.routes.polymorphic(args[0],{absolute:name.endsWith('_url'),newRecord:name.startsWith('new_')});
  if(name==='url_for')return this.urlFor(args[0]);
  if(name==='image_tag'){const opts={...args[1]};if(opts.size){const [width,height]=String(opts.size).split('x');Object.assign(opts,{width,height:height || width});delete opts.size;}return tag('img','',{src:this.assetPath(args[0]),...opts});}
  if(name==='image_url')return /^(?:https?:|data:)/.test(string(args[0]))?args[0]:ctx.base_url+this.assetPath(args[0]);
  if(name==='favicon_link_tag')return tag('link','',{rel:'icon',type:'image/png',href:this.assetPath(args[0])});
  if(name==='stylesheet_link_tag')return raw(args.filter(v=>typeof v==='string').map(source=>string(tag('link','',{rel:'stylesheet',href:this.assetPath(source+'.css'),...(typeof args.at(-1)==='object'?args.at(-1):{})}))).join('\n'));
  if(name==='javascript_importmap_tags'){
   const importmap=JSON.stringify(this.metadata.importmap).replaceAll('<','\\u003c');
   return raw(`<script type="importmap" data-turbo-track="reload">${importmap}</script>`+(this.metadata.preloads || []).map(href=>string(tag('link','',{rel:'modulepreload',href}))).join('')+'<script type="module">import "application"</script>');
  }
  if(name==='csrf_meta_tags')return ctx.csrf_token?raw(string(tag('meta','',{name:'csrf-param',content:'authenticity_token'}))+string(tag('meta','',{name:'csrf-token',content:ctx.csrf_token}))):raw('');
  if(name==='csp_meta_tag')return raw('');
  if(name==='action_cable_meta_tag')return tag('meta','',{name:'action-cable-url',content:ctx.base_url.replace(/^http/,'ws')+'/cable'});
  if(name==='video_tag'||name==='audio_tag'){const options=typeof args.at(-1)==='object'?args.at(-1):{};return tag(name.slice(0,-4),block?await this.capture(block):'',{src:this.assetPath(args[0]),...options});}
  if(name==='inline_svg_tag'){const svg=this.metadata.inline_svgs?.[args[0]];if(!svg)throw Error('Missing inline image');return raw(svg.replace('<svg','<svg '+attributes(args[1])));}
  if(name==='sanitize')return sanitize(args[0],args[1] || {});
  if(name==='simple_format')return simpleFormat(...args);
  if(name==='strip_tags')return stripTags(args[0]);
  if(name==='truncate')return this.truncate(...args);
  if(name==='pluralize')return `${args[0] ?? 0} ${args[2] && args[0]!==1?args[2]:plural(args[1],Number(args[0]))}`;
  if(name==='number_with_delimiter')return Number(args[0] || 0).toLocaleString('en-US');
  if(name==='number_to_human_size'){const n=Number(args[0] || 0),units=['Bytes','KB','MB','GB','TB'];let index=0,size=n;while(size>=1024&&index<4){size/=1024;index++;}return (index?Number(size.toFixed(2)):size)+' '+units[index];}
  if(['time_ago_in_words','distance_of_time_in_words_to_now'].includes(name))return durationWords(args[0],new Date(this.now()));
  if(name==='distance_of_time_in_words')return durationWords(args[0],args[1]);
  if(name==='time_tag')return tag('time',block?await this.capture(block):args[1] || (args[0] instanceof Date?args[0].toISOString():args[0]),{datetime:args[0] instanceof Date?args[0].toISOString():args[0],...args[2]});
  if(name==='area_chart'||name==='line_chart'){
   const id='chart-'+randomUUID(),data=JSON.stringify(args[0]).replaceAll('<','\\u003c'),opts=args[1] || {},json=JSON.stringify(opts).replaceAll('<','\\u003c');
   return raw(`<div id="${id}" style="height: ${escape(opts.height || '300px')}; width: 100%">Loading...</div><script>(function(){const draw=()=>{if(window.Chartkick)new Chartkick.${name==='area_chart'?'AreaChart':'LineChart'}(${JSON.stringify(id)},${data},${json})};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw,{once:true});else draw()})();</script>`);
  }
  if(name==='pagy_nav')return this.pagyNav(args[0]);
  if(name==='pagy_info'){const p=args[0];return raw(`Displaying ${p.count || 0} ${escape(args[1]?.item_name || 'items')}`);}
  if(name==='rand')return Math.floor(Math.random()*(args[0] || 1));
  if(name==='client_for_user_agent')return (ctx.clients || []).find(client=>client.attrs?.match_text&&string(args[0]).includes(client.attrs.match_text)) || null;
  if(name==='link_id_for_decoration')return ctx.decorations?.[args[0]] || args[0];
  if(name==='has_requests?')return user?((this._friendRequests ??= (await this.services.social?.('friend-requests-count',{actor_id:user.id,surrender_id:ctx.surrender?.id})))?.count || 0)>0:false;
  if(name==='notifications'){
   if(this._notifications)return this._notifications;if(!user)return [];
   const result=await this.services.social?.('notifications',{actor_id:user.id,surrender_id:ctx.surrender?.id,header:true});return this._notifications=(result?.notifications || []).map(row=>this.engine.record('Notification',row));
  }
  if(name==='tracker_pledges_enabled?'||name==='tracker_pledge'){
   const target=args[0] || this.assigns.user || user;if(!target)return name==='tracker_pledge'?null:!!ctx.flags?.nnn_enabled;
   const cache=this.assigns.tracker_status || (this.assigns.tracker_status={});cache[target.id] ||= await this.services.tracker?.('pledge-status',{username:target.attrs.username,actor_id:user?.id,surrender_id:ctx.surrender?.id}) || {nnn_enabled:false,current:null};
   return name==='tracker_pledge'?(cache[target.id].current?this.engine.record('NutPledge',cache[target.id].current):null):cache[target.id].nnn_enabled;
  }
  if(name==='convert_all_e621_links_to_source_links'){
   let text=string(args[0]);for(const match of [...text.matchAll(/https:\/\/e621\.net\/posts\/(\d+)(?:\?[\w=&%+]*)?/g)]){const data=await this.services.e621?.post({post_id:match[1]});const url=data?.post?.file?.url || data?.file?.url;if(!url)return 'Dead link :(';text=text.replaceAll(match[0],url);}return text;
  }
  if(name==='get_search_base'){
   const link=args[0],aligned=link&&(await this.dispatch(link,'check_ability',['is_kink_aligned']));
   const result=await this.services.e621?.query({tags:'',policy:link?{blacklist:link.attrs.blacklist,theme:link.attrs.theme,min_score:link.attrs.min_score,can_show_videos:await this.dispatch(link,'check_ability',['can_show_videos']),is_kink_aligned:aligned,kinks:aligned?(link.associations.user?.associations.kinks || []).map(k=>k.attrs.name):[]}:null});return result?.suffix || '';
  }
  if(name==='next_wizard_path')return this.routes.route('link_wizard_path',[this.context.route_parameters.link_id,ctx.next_step || this.assigns.step]);
  if(name==='lizard_to_description')return this.metadata.lizard_descriptions?.[args[0]]?.[String(!!args[1])] || '';
  if(Object.hasOwn(this.assigns,name))return this.assigns[name];
  if(Object.hasOwn(ctx,name))return ctx[name];
  if(['notice','failed','sample','tight','css_class','background','text_shown','fit_mode','preloaded_links'].includes(name))return ({sample:false,tight:false,failed:false,background:'#212121',text_shown:true,fit_mode:'cover'})[name] ?? null;
  throw Error('Unknown presentation helper: '+name);
 }
 async jsonHelper(name,args,block){
  if(name==='cache!')return block();
  if(name==='extract!'){for(const key of args.slice(1))this.jsonTarget[key]=await this.dispatch(args[0],key,[]);return null;}
  if(name==='merge!'){Object.assign(this.jsonTarget,args[0]);return null;}
  if(name==='partial!'){const options=args[1] || {};return this.template(args[0],options,true);}
  if(name==='array!'){
   const values=args[0] || [],options=args[1] || {},list=[],parent=this.jsonTarget;this.jsonValue=list;
   for(const value of values){this.jsonTarget={};if(block)await block(value);else if(options.partial)await this.template(options.partial,{[options.as || options.partial.split('/').at(-1)]:value},true);else this.jsonTarget=value;list.push(this.jsonTarget);}
   this.jsonTarget=parent;return null;
  }
  if(name==='child!'){const parent=this.jsonTarget;const child={};if(!Array.isArray(parent))throw Error('JSON child requires an array');this.jsonTarget=child;await block();parent.push(child);this.jsonTarget=parent;return null;}
  if(block){const parent=this.jsonTarget;this.jsonTarget={};if(['layers','rows','cells'].includes(name))this.jsonTarget=[];await block();parent[name]=this.jsonTarget;this.jsonTarget=parent;return null;}
  this.jsonTarget[name]=args[0];return null;
 }
 formTokens(method){let html='';if(!['get','post'].includes(method))html+=string(input('hidden','_method',method,{id:null,autocomplete:'off'}));if(method!=='get'&&this.context.csrf_token)html+=string(input('hidden','authenticity_token',this.context.csrf_token,{id:null,autocomplete:'off'}));return html;}
 async urlFor(value){if(typeof value==='string')return value;if(value instanceof Record)return this.routes.polymorphic(value);const opts={...(value || {})},controller=opts.controller || this.context.controller_path,action=opts.action || 'index';delete opts.controller;delete opts.action;if(opts.params){Object.assign(opts,opts.params);delete opts.params;}const candidates=[`${action==='index'?'':action+'_'}${controller.replaceAll('/','_')}${action==='index'?'_index':''}_path`,`${controller}_path`];for(const candidate of candidates){try{return this.routes.route(candidate,[opts]);}catch{}}const base=controller==='links'?'/links':'/'+controller;return base+(action==='index'?'':action==='new'?'/new':'/'+action)+(Object.keys(opts).length?'?'+new URLSearchParams(opts):'');}
 pagyNav(p){if(!p)return raw('');let html='';const last=p.pages || p.last || Math.ceil(p.count/(p.items || 20)),current=p.page || 1,param=p.page_param || 'page';for(let page=1;page<=last;page++){if(last>12&&Math.abs(page-current)>2&&page!==1&&page!==last)continue;const url=new URL(this.context.original_url || this.context.base_url+this.context.path);url.searchParams.set(param,page);html+=string(tag('a',page,{href:url.pathname+url.search,class:page===current?'page active':'page'}))+' ';}return tag('nav',raw(html),{class:'pagy-nav pagination','aria-label':'Pages'});}
}
