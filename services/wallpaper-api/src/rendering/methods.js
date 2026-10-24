import{Html,raw,string,blank,truth,equal,Record,Range,Duration,Constant,snake,singular,plural}from'./values.js';
import{FormBuilder,formatDate,marker,markdownSource,markdown}from'./html.js';
const own=(o,k)=>o!=null&&Object.hasOwn(o,k);
const array=value=>value instanceof Map?[...value]:Array.isArray(value)?value:Object.entries(value || {});
const attr=(r,key)=>own(r.associations,key)?r.associations[key]:r.attrs[key];
export async function dispatch(r,object,method,args=[],block=null,scope=null){
 if(!block&&args.blockSymbol)block=value=>dispatch(r,value,args.blockSymbol,[]);
 if(method==='nil?')return object==null;
 if(method==='present?')return !blank(object);
 if(method==='presence')return blank(object)?null:object;
 if(method==='blank?')return blank(object);
 if(method==='freeze')return object;
 if(method==='to_s')return string(object);
 if(method==='to_sym')return string(object);
 if(method==='html_safe')return raw(object);
 if(method==='respond_to?')return object instanceof Record?own(object.attrs,args[0])||own(object.associations,args[0])||['fork_count','details'].includes(args[0]):object!=null;
 if(method==='send'||method==='public_send')return dispatch(r,object,String(args[0]),args.slice(1),block,scope);
 if(object instanceof FormBuilder)return object.call(method,args,block);
 if(object instanceof Constant)return constant(r,object.name,method,args,block,scope);
 if(object===r.jsonObject)return r.jsonHelper(method,args,block);
 if(object===r.tagObject)return r.tagHelper(method,args,block);
 if(object===r.streamObject)return r.streamHelper(method,args,block);
 if(object===r.mainRoutes)return r.routes.route(method,args,true);
 if(object instanceof Record)return record(r,object,method,args,block,scope);
 if(method==='[]'){
  const key=args[0];if(object==null)return null;
  if(key instanceof Range)return object.slice(key.first,key.last+1);
  if(object instanceof Map)return object.get(key) ?? null;
  return object[key] ?? null;
 }
 if(object instanceof Date){
  if(method==='utc'||method==='to_time')return object;
  if(method==='iso8601')return object.toISOString();
  if(method==='strftime')return formatDate(object,args[0]);
  if(method==='to_fs')return formatDate(object,args[0]==='short'?'%d %b %H:%M':undefined);
  if(method==='year')return object.getUTCFullYear();
  if(method==='to_i')return Math.floor(object.getTime()/1000);
 }
 if(object instanceof Duration){if(method==='ago')return new Date(r.now()-object.seconds*1000);if(method==='from_now')return new Date(r.now()+object.seconds*1000);}
 if(typeof object==='number'){
  if(method==='to_i')return Math.trunc(object);if(method==='positive?')return object>0;if(method==='round')return Number(object.toFixed(args[0] || 0));
  const seconds={second:1,seconds:1,minute:60,minutes:60,hour:3600,hours:3600,day:86400,days:86400,week:604800,weeks:604800};if(seconds[method])return new Duration(object*seconds[method]);
 }
 if(typeof object==='string'||object instanceof Html){
  const text=string(object);
  if(method==='to_i')return parseInt(text,10) || 0;
  if(method==='empty?')return text.length===0;if(method==='length'||method==='size')return [...text].length;
  if(method==='first'||method==='last'){const chars=[...text],count=args[0] ?? 1;return (method==='first'?chars.slice(0,count):count?chars.slice(-count):[]).join('');}
  if(method==='downcase')return text.toLowerCase();if(method==='upcase')return text.toUpperCase();if(method==='capitalize')return text.charAt(0).toUpperCase()+text.slice(1).toLowerCase();
  if(method==='parameterize')return text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_]+/g,'-').replace(/^-|-$/g,'').toLowerCase();
  if(method==='humanize')return text.replace(/_id$/,'').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
  if(method==='titlecase'||method==='titleize')return text.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  if(method==='include?')return text.includes(string(args[0]));if(method==='split')return text.split(args[0] instanceof RegExp?args[0]:args[0] ?? /\s+/).filter(v=>v!==undefined);
  if(method==='pluralize')return plural(text,args[0]);
  if(method==='join')return [text].join(args[0]);
  if(method==='truncate')return r.truncate(text,args[0] || {});
  if(method==='scan')return [...text.matchAll(new RegExp(args[0].source,args[0].flags.replaceAll('g','')+'g'))].map(m=>m.length>1?m.slice(1):m[0]);
  if(method==='gsub'||method==='sub'){
   const pattern=args[0] instanceof RegExp?new RegExp(args[0].source,args[0].flags.replaceAll('g','')+(method==='gsub'?'g':'')):args[0];
   const replacement=string(args[1]).replace(/\\0/g,'$&').replace(/\\(\d)/g,'$$$1');
   const result=method==='gsub'&&typeof pattern==='string'?text.replaceAll(pattern,replacement):text.replace(pattern,replacement);
   return object instanceof Html?raw(result):result;
  }
 }
 if(Array.isArray(object)||object instanceof Map){
  const values=array(object);
  if(method==='all'||method==='to_a'||method==='includes'||method==='joins'||method==='left_joins'||method==='active')return object;
  if(method==='length'||method==='size'||method==='count')return block?(await Promise.all(values.map(v=>block(v)))).filter(truth).length:values.length;
  if(method==='empty?')return values.length===0;
  if(method==='first'||method==='last')return args[0]===undefined?values[method==='first'?0:values.length-1] ?? null:method==='first'?values.slice(0,args[0]):values.slice(-args[0]);
  if(method==='limit')return values.slice(0,args[0]);if(method==='reverse')return [...values].reverse();
  if(method==='compact')return values.filter(v=>v!=null);if(method==='uniq')return values.filter((v,i)=>values.findIndex(other=>equal(v,other))===i);
  if(method==='merge'&&Array.isArray(object))return [...new Set([...values,...array(args[0])])];
  if(method==='join')return values.map(string).join(args[0] ?? '');if(method==='to_sentence')return values.length<3?values.map(string).join(' and '):values.slice(0,-1).map(string).join(', ')+', and '+string(values.at(-1));
  if(method==='include?')return values.some(v=>equal(v,args[0]));
  if(method==='each'||method==='each_with_index'){if(block)for(let i=0;i<values.length;i++)await block(values[i],...(method==='each_with_index'?[i]:[]));return object;}
  if(method==='map'){const result=[];for(const v of values)result.push(block?await block(v):await dispatch(r,v,args.blockSymbol,[]));return result;}
  if(method==='filter'||method==='select'||method==='find'||method==='any?'){
   const matches=[];for(const value of values)if(truth(block?await block(value):value)){if(method==='find')return value;if(method==='any?')return true;matches.push(value);}return method==='find'?null:method==='any?'?false:matches;
  }
  if(method==='group_by'){const result=new Map();for(const v of values){const key=block?await block(v):null;let actual=[...result.keys()].find(k=>equal(k,key));if(actual===undefined)actual=key;if(!result.has(actual))result.set(actual,[]);result.get(actual).push(v);}return result;}
  if(method==='pluck'){const result=[];for(const value of values)result.push(await dispatch(r,value,args[0],[]));return result;}
  if(method==='where')return values.filter(v=>Object.entries(args[0] || {}).every(([k,wanted])=>{const actual=v instanceof Record?attr(v,k):v[k];return Array.isArray(wanted)?wanted.some(w=>equal(w,actual)):equal(actual,wanted);}));
  if(method==='order'){
   const fields=typeof args[0]==='string'?[[args[0],'asc']]:Object.entries(args[0] || {});
   return [...values].sort((a,b)=>{for(const [key,direction]of fields){const av=a instanceof Record?attr(a,key):a[key],bv=b instanceof Record?attr(b,key):b[key];let diff=av==null?(bv==null?0:1):bv==null?-1:av<bv?-1:av>bv?1:0;if(direction==='desc')diff=-diff;if(diff)return diff;}return 0;});
  }
  if(method==='max')return Math.max(...values);
  if(method==='for_user')return values.find(v=>String(v.attrs.user_id)===String(args[0]?.id)) || null;
  if(method==='is_public')return values.filter(v=>!v.attrs.friends_only&&(v.attrs.never_expires||new Date(v.attrs.expires)>new Date(r.now())));
  if(method==='new')return new Record(args[0]?.type || 'Kink',args[0] || {},{},{new_record:true});
 }
 if(object?.root_path&&method==='join')return args.join('/');
 if(object&&typeof object==='object'){
  if(method==='fetch'){if(own(object,args[0]))return object[args[0]];if(object instanceof Map&&object.has(args[0]))return object.get(args[0]);if(args.length>1)return args[1];throw Error('Missing presentation key: '+args[0]);}
  if(method==='key?')return own(object,args[0]);
  if(method==='except')return Object.fromEntries(Object.entries(object).filter(([key])=>!args.includes(key)));
  if(method==='merge')return {...object,...args[0]};
  if(method==='each'){if(Array.isArray(object.full_messages)){for(const message of object.full_messages)await block({full_message:message});}else for(const entry of Object.entries(object))await block(entry);return object;}
  if(method==='count'||method==='length'||method==='size')return Array.isArray(object.full_messages)?object.full_messages.length:Object.keys(object).length;
  if(method==='any?')return Array.isArray(object.full_messages)?object.full_messages.length>0:Object.keys(object).length>0;
  if(method==='full_messages')return object.full_messages || [];
  if(own(object,method))return object[method];
 }
 throw Error(`Unknown presentation method ${method} on ${object==null?'nil':typeof object}`);
}
async function record(r,object,method,args,block,scope){
 const a=object.attrs,s=object.associations,m=object.meta,get=k=>own(s,k)?s[k]:a[k];
 if(method==='id')return object.id ?? null;
 if(method.endsWith('=')){a[method.slice(0,-1)]=args[0];return args[0];}
 if(method==='attributes')return a;
 if(method==='new_record?')return !!m.new_record;if(method==='persisted?')return !m.new_record&&object.id!=null;if(method==='destroyed?')return !!m.destroyed;
 if(method==='errors')return m.errors || {full_messages:[]};
 if(method==='instance_variable_defined?')return own(m,args[0].replace('@node_browser_',''));
 if(method==='instance_variable_get')return m[args[0].replace('@node_browser_','')] ?? null;
 if(method==='details'&&object.type==='User'){const p=s.profile || [...s.profiles || []].sort((x,y)=>Number(x.id)-Number(y.id))[0];return p?.attrs.content || '';}
 if(method==='master'&&object.type==='User')return (s.masters || [])[0] || null;
 if(method==='flair'&&object.type==='User')return (s.obeying_leashes || [])[0]?.attrs.flair || null;
 if(method==='current_profile_name')return s.profile?s.profile.attrs.name || 'Unnamed':'<Imported Profile>';
 if(method==='link_label'&&object.type==='WallpaperClient')return blank(a.link_name)?a.name:a.link_name;
 if(method==='next_username_change_at')return a.username_changed_at?new Date(new Date(a.username_changed_at).getTime()+604800000):null;
 if(method==='can_change_username?')return !a.username_changed_at||new Date(a.username_changed_at).getTime()<r.now()-604800000;
 if(method==='fork_count'||method==='number_of_users')return m[method] || 0;
 if(method==='check_ability')return (s.abilities || []).some(edge=>edge.attrs.ability===args[0])&&(args[0]!=='is_master_only'||(s.user?.associations.masters || []).length>0);
 if(method==='is_online?'||method==='online?')return !!m.connected||!!(a.last_ping&&a.last_ping_user_agent&&new Date(a.last_ping).getTime()>r.now()-(a.last_ping_user_agent.includes('widgetExtension')?1200000:60000));
 if(method==='seconds_since_last_set'){const last=s.past_links?.at(-1);return last?(r.now()-new Date(last.attrs.created_at).getTime())/1000:99999;}
 if(method==='post_url_backup'){const token=r.engine.issueMedia(a.post_url);return token?r.context.base_url+'/e621-media?token='+encodeURIComponent(token):null;}
 if(method==='e621_post_md5')return a.post_url?.match(/\/([a-f0-9]{32})\.(?:png|jpe?g|bmp|webm|mp4|gif|webp)(?:\?|$)/i)?.[1] || null;
 if(method==='e621_page_url'){if(a.e621_post_id)return 'https://e621.net/posts/'+a.e621_post_id;const md5=await record(r,object,'e621_post_md5',[]);return md5?'https://e621.net/posts?md5='+md5:null;}
 if(method==='preview_image_url')return /\.(?:mp4|webm)(?:\?|$)/i.test(a.post_url || '')?a.post_thumbnail_url:a.post_url;
 if(method==='other_user')return s.sender&&String(s.sender.id)!==String(args[0]?.id)?s.sender:s.receiver;
 if(method==='controllable')return (s.surrenders || []).some(edge=>String(edge.attrs.user_id)===String(args[0]?.id));
 if(method==='for_user')return (Array.isArray(object)?object:s.surrenders || []).find(edge=>String(edge.attrs.user_id)===String(args[0]?.id)) || null;
 if(method==='controller'&&object.type==='Surrender')return s.controller_user || null;
 if(method==='valid?')return object.type==='Surrender'?!!m.valid:!(m.errors?.full_messages?.length);
 if(method==='active?')return !!m.valid&&!a.pending;
 if(method==='failed?')return !!a.failed_on;if(method==='succeeded?')return a.year<new Date(r.now()).getUTCFullYear()&&!a.failed_on;
 if(method==='redeemed?')return !!a.redeemed_at;
 if(method==='system_account?')return a.system_account||a.username==='evil';
 if(method==='deleted?')return !!a.deleted_at;
 if(method==='interview_image_url')return 'mascot/news/'+({ki:'Ki',warren:'Warren',taylor:'Taylor'}[s.user?.attrs.mascot || 'ki'] || 'Ki')+'InterviewOpen.png';
 if(method==='is_starred?')return (s.kink_havers || []).some(edge=>String(edge.attrs.user_id)===String(args[0]?.id)&&edge.attrs.is_starred);
 if(method==='snapshot'&&object.type==='Link')return `#${object.id}\nCreator: ${s.user?.attrs.username}\n${a.terms || ''}\n\nTheme: ${a.theme || ''}\nBlacklist: ${a.blacklist || ''}\nPost URL: ${a.post_url || ''}\nSet By: ${s.set_by?.attrs.username || 'anon or no one'}\nResponse Text: ${a.response_text || ''}`;
 if(method.endsWith('?')){const key=method.slice(0,-1);if(own(a,key))return !!a[key];if(['horny','came','disgust','ok'].includes(key))return a.response_type===key;}
 if(own(s,method))return s[method];if(own(a,method))return a[method];
 if(['password','password_confirmation','current_password','api_key','email'].includes(method))return null;
 throw Error(`Unknown ${object.type} presentation field: ${method}`);
}
async function constant(r,name,method,args,block,scope){
 const ctx=r.context;
 if(name==='ENV')return dispatch(r,ctx.env || {},method,args,block,scope);
 if(name==='Time'&&['now','current'].includes(method))return new Date(r.now());
 if(name==='Time'&&method==='iso8601')return new Date(args[0]);
 if(name==='Time'&&method==='new')return args.length?new Date(args[0]):new Date(r.now());
 if(name==='Time::DATE_FORMATS')return dispatch(r,{short:'%d %b %H:%M'},method,args,block,scope);
 if(name==='ProfileMarkdown::MAX_LENGTH')return 50000;
 if(name==='CGI'&&method==='escape')return encodeURIComponent(string(args[0])).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()).replaceAll('%20','+');
 if(name==='URI'&&method==='regexp')return /https?:\/\/[^\s<>"']+/;
 if(name==='JSON'&&method==='pretty_generate')return JSON.stringify(args[0],null,2);
 if(name==='SiteConfig'){if(method==='invite_only?')return !!ctx.flags?.invite_only;if(method==='nnn_enabled?')return !!ctx.flags?.nnn_enabled;if(method==='base_url')return ctx.base_url;if(method==='url')return ctx.base_url+(args[0]?'/'+string(args[0]).replace(/^\//,''):'');if(method==='host')return new URL(ctx.base_url).hostname;if(method==='commit_hash')return ctx.env?.COMMIT_HASH || null;if(method==='commit_time')return ctx.env?.RELEASE_CREATED_AT?new Date(ctx.env.RELEASE_CREATED_AT):null;}
 if(name==='ProfileMarkdown'){if(method==='markdown?')return string(args[0]).startsWith(marker);if(method==='source')return markdownSource(args[0]);if(method==='to_html')return markdown(args[0]);}
 if(name==='WallScrubber'&&method==='new')return {scrubber:true};
 if(name==='Rails::Html::Sanitizer'&&method==='white_list_sanitizer')return {allowed_tags:[],allowed_attributes:[]};
 if(name==='Rails'){if(method==='root')return {root_path:true};if(method==='env')return ctx.environment || 'production';if(method==='backtrace_cleaner')return {clean:[]};}
 if(name==='File'&&method==='mtime')return new Date(1000*(ctx.asset_versions?.[string(args[0])] || 0));
 if(name==='LinkPresence'&&method==='online?')return !!args[0]?.meta.connected;
 if(/^Node\w+Backend$/.test(name)&&method==='enabled?')return true;
 if(method==='from_user'&&/^Profile(?:Selector|Rename)Form$/.test(name)){const profile=args[0]?.associations.profile;return new Record(name,{profile_id:profile?.id || null,name:profile?.attrs.name || ''},{},{new_record:true});}
 if(method==='new'||method==='instantiate'){
  const attrs=args[0] || {},associations={};for(const [key,value] of Object.entries(attrs))if(value instanceof Record){associations[key]=value;attrs[key+'_id']=value.id;}
  return new Record(name,attrs,associations,{new_record:method==='new'});
 }
 if(name==='ProfileDomain'&&method==='statuses')return {pending:0,approved:1,blocked:2};
 if(name==='Report'&&method==='model_name')return {singular:'report'};
 throw Error('Unknown presentation constant: '+name+'.'+method);
}
