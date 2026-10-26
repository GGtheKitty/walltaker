import {HttpError} from './errors.js';
import {renderPage,mergeGraphs} from './pages.js';
import {dumpMarkdown,markdownSource,filterProfileDomains} from './profile-content.js';
import {startVisit} from './activity.js';
import {helpHeads} from './templates/help.js';

const actor=ctx=>({actor_id:ctx.auth.user?.id,surrender_id:ctx.auth.surrender?.id || null});
const command=(ctx,op)=>({...actor(ctx),request_key:`web:${ctx.requestId}:${op}`});
const mod=(ctx,op,input={})=>ctx.call('moderation',op,{...command(ctx,op),...input});
const page=(ctx,template,data={})=>{const {user,users,...values}=data;return renderPage(ctx,{template,...values,staffUsers:users,headers:{'x-walltaker-moderation':'node',...values.headers}});};
const pick=(obj,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(obj || {},k)).map(k=>[k,obj[k]]));
function field(value,max=255){if(value==null)return '';if(typeof value!=='string'||value.length>max)throw new HttpError(422,'Invalid or oversized text.');return value;}
const query=(path,params)=>path+'?'+new URLSearchParams(params);
function safeReturn(ctx,fallback){const value=ctx.body.return_to;if(typeof value!=='string')return fallback;try{const url=new URL(value,ctx.config.baseUrl);if(url.origin===new URL(ctx.config.baseUrl).origin&&!/[\\\r\n]/.test(value)&&!/%(?:0[ad]|5c)/i.test(value))return url.pathname+url.search+url.hash;}catch{}return fallback;}
async function write(ctx,op,input,to,notice){
  try{const result=await mod(ctx,op,input);if(notice)ctx.flash.set('notice',typeof notice==='function'?notice(result):notice);ctx.redirect(typeof to==='function'?await to(result):to);}
  catch(error){if(error.status!==422&&error.status!==409)throw error;ctx.flash.set('alert',error.message.slice(0,1200));ctx.redirect(typeof to==='string'?to:'/mod_tools');}
}
function target(ctx){return ctx.params.link_id?{reportable_type:'Link',reportable_id:ctx.params.link_id}:{reportable_type:'User',reportable_id:ctx.params.user_id};}
async function userDocument(ctx,id){const data=await mod(ctx,'user',{user_id:id});return {...data,editUser:data.user,detailsSource:data.user?.advanced?(data.profile?.content || data.user.details || ''):markdownSource(data.profile?.content || data.user?.details || '')};}
export function addModerationRoutes(router){
  router.add('GET','/help',async ctx=>{const data=await ctx.call('browser','site-clients',{});await renderPage(ctx,{template:'help-index',clients:data.clients});});
  for(const name of ['faq','client_guide','deprecated_client_guide'])router.add('GET','/help/'+name,ctx=>renderPage(ctx,{template:'help-'+name,headContent:helpHeads[name],mainClass:name==='client_guide'?'client-guide':undefined}));
  for(const prefix of ['/links/:link_id','/users/:user_id']){
    router.add('GET',prefix+'/reports/new',async ctx=>{if(!await ctx.authorize())return;const input=target(ctx);await mod(ctx,'report-target',input);await page(ctx,'mod-report-new',{reportAction:(input.reportable_type==='Link'?'/links/':'/users/')+input.reportable_id+'/reports'});});
    router.add('POST',prefix+'/reports',async ctx=>{if(!await ctx.authorize())return;const input=target(ctx),url=(input.reportable_type==='Link'?'/links/':'/users/')+input.reportable_id+'/reports/new';await write(ctx,'report-create',{...input,reason:field(ctx.body.report?.reason,10000)},url,'Report was successfully created.');});
  }
  for(const path of ['/mod_tools','/mod_tools/'])router.add('GET',path,async ctx=>{if(!await ctx.authorize('admin'))return;await page(ctx,'mod-dashboard',{dashboard:await mod(ctx,'dashboard')});});
  for(const [path,op,template] of [['invites','invites','mod-invites'],['emoji_links','emoji-links','mod-emojis'],['user_icons','user-icons','mod-icons'],['clients','clients','mod-clients'],['profile_domains','domains','mod-domains'],['users/deleted','deleted-users','mod-deleted'],['quarantine','quarantine','mod-quarantine'],['events','events','mod-events']]){
    router.add('GET','/mod_tools/'+path,async ctx=>{if(!await ctx.authorize('admin'))return;const data=await mod(ctx,op,pick(ctx.query,['page','pending_page','approved_page','blocked_page']));await page(ctx,template,{...data,modData:data,queryParams:ctx.query,currentPath:ctx.path});});
  }
  for(const [name,template] of [['system','mod-system'],['activity','mod-activity']])router.add('GET','/mod_tools/analytics/'+name,async ctx=>{if(!await ctx.authorize('admin'))return;await page(ctx,template,{metrics:await ctx.call('activity',name,actor(ctx))});});
  for(const path of ['/mod_tools/users','/mod_tools/users/'])router.add('GET',path,async ctx=>{if(!await ctx.authorize('admin'))return;const search=field(ctx.query.query || ctx.query.email);const data=await mod(ctx,'user',{query:search});await page(ctx,'mod-user',{...data,editUser:data.user,search,lookupFailure:search&&!data.user?'That user does not exist.':null,detailsSource:data.user?.advanced?(data.profile?.content || data.user.details || ''):markdownSource(data.profile?.content || data.user?.details || '')});});
  router.add('POST','/mod_tools/users/update',async ctx=>{
    if(!await ctx.authorize('admin'))return;const attrs=pick(ctx.body.user,['email','username','details','set_count','quarantined','flagged','is_reporter','is_cutie','is_supporter']);let document=await userDocument(ctx,ctx.body.user?.id),error;
    try{
      if(Object.hasOwn(attrs,'details')){const {rules}=await mod(ctx,'domain-rules');const content=filterProfileDomains(document.editUser.advanced?field(attrs.details,200000):dumpMarkdown(field(attrs.details,50000)),rules);attrs.details=content.content;if(content.domains.length)await mod(ctx,'domain-seen',{domains:content.domains});}
      await mod(ctx,'user-update',{user_id:document.editUser.id,attributes:attrs,expected_advanced:!!document.editUser.advanced});document=await userDocument(ctx,document.editUser.id);
    }catch(failure){if(![409,422].includes(failure.status))throw failure;error=failure.message;document={...document,editUser:{...document.editUser,...pick(attrs,['username','email','set_count','quarantined','flagged','is_reporter','is_cutie','is_supporter'])},detailsSource:ctx.body.user?.details ?? document.detailsSource};}
    await page(ctx,'mod-user-update',{...document,error,status:error?422:200,headers:{'content-type':'text/vnd.turbo-stream.html; charset=utf-8'}});
  });
  for(const path of ['/mod_tools/passwords','/mod_tools/passwords/'])router.add('GET',path,async ctx=>{if(!await ctx.authorize('admin'))return;await mod(ctx,'admin-session');await page(ctx,'mod-password',{reset:{},email:''});});
  router.add('POST','/mod_tools/passwords/update',async ctx=>{if(!await ctx.authorize('admin'))return;let reset,status=200;const email=field(ctx.body.email);try{reset=await mod(ctx,'password-reset',{email,case_sensitive:ctx.body.commit==='Try to generate a reset link (case sensitive)'});}catch(error){if(error.status!==422)throw error;reset={warning:error.message};status=422;}await page(ctx,'mod-password',{reset,email,status});});
  for(const [path,key,name,to] of [['global_toggles/nnn','nnn_enabled','NNN','/mod_tools'],['invites/toggle','invite_only','Invite-only mode','/mod_tools/invites']])router.add('POST','/mod_tools/'+path,async ctx=>{if(!await ctx.authorize('admin'))return;await write(ctx,'setting-toggle',{key},to,r=>`${name} ${r.enabled?'enabled':'disabled'}.`);});
  for(const [url,base,scope,keys,notice] of [['invites','invite',null,[],'Invite code'],['emoji_links','emoji','emoji_link_decoration',['link_id','emoji'],'Emoji link'],['user_icons','icon','user_icon',['username','icon_name'],'User icon'],['clients','client','wallpaper_client',['name','section','url','platform','match_text','link_name','icon_name','device_type','deprecated'],'Client']]){
    for(const [method,suffix,verb] of [['POST','','create'],['PATCH','/:id','update'],['DELETE','/:id','delete']]){
      if(base==='invite'&&verb==='update')continue;
      router.add(method,'/mod_tools/'+url+suffix,async ctx=>{if(!await ctx.authorize('admin'))return;const attrs=pick(ctx.body[scope],keys);await write(ctx,base+'-'+verb,{id:ctx.params.id,...(base==='client'?{attributes:attrs}:attrs)},'/mod_tools/'+url,base==='invite'?`Invite code ${verb==='create'?'generated':'deleted'}.`:notice+' saved.');});
    }
  }
  for(const direction of ['up','down'])router.add('POST','/mod_tools/clients/:id/move_'+direction,async ctx=>{if(!await ctx.authorize('admin'))return;await write(ctx,'client-move',{id:ctx.params.id,direction},'/mod_tools/clients','Client saved.');});
  router.add('PATCH','/mod_tools/profile_domains/:id',async ctx=>{if(!await ctx.authorize('admin'))return;await write(ctx,'domain-update',{id:ctx.params.id,status:ctx.body.profile_domain?.status},'/mod_tools/profile_domains',r=>`${r.domain} is now ${r.status}.`);});
  for(const [method,path,op] of [['POST','users/:user/restore','user-restore'],['DELETE','users/:user/purge','user-purge']])router.add(method,'/mod_tools/'+path,async ctx=>{if(!await ctx.authorize('admin'))return;await write(ctx,op,{user_id:ctx.params.user},async r=>ctx.body.return_to==='deleted_accounts'?'/mod_tools/users/deleted':op==='user-purge'?'/mod_tools/users':query('/mod_tools/users',{email:(await mod(ctx,'user',{user_id:r.user_id})).user.email}),r=>op==='user-purge'?'Deleted account was permanently purged.':r.restored_original?'Account restored.':'Account restored, but its original username was unavailable.');});
  router.add('POST','/mod_tools/users/assume/:user',async ctx=>{if(!await ctx.authorize('admin'))return;await mod(ctx,'user-assume',{user_id:ctx.params.user});const result=await ctx.call('browser','assume',{user_id:ctx.params.user,ip:ctx.ip});ctx.transition(result);ctx.visit=await startVisit(ctx);if(ctx.visit)await ctx.call('activity','visit-authenticate',{...ctx.visit,user_id:result.user.id});ctx.redirect('/');});
  for(const [path,op] of [['update','user-quarantine'],['ban','user-ipban']])router.add('POST','/mod_tools/quarantine/'+path+'/:user',async ctx=>{if(!await ctx.authorize('admin'))return;await write(ctx,op,{user_id:ctx.params.user},safeReturn(ctx,'/mod_tools/quarantine#user_'+ctx.params.user));});
  router.add('POST','/mod_tools/events/ban/:event',async ctx=>{if(!await ctx.authorize('admin'))return;await write(ctx,'event-ipban',{event_id:ctx.params.event},'/mod_tools/events','IP banned.');});
  router.add('GET','/mod_tools/reports',async ctx=>{if(!await ctx.authorize('admin'))return;const data=await mod(ctx,'reports',{closed:!!ctx.query.closed});await page(ctx,'mod-reports',{...data,currentPath:ctx.path});});
  for(const suffix of ['','/edit'])router.add('GET','/mod_tools/reports/:id'+suffix,async ctx=>{if(!await ctx.authorize('admin'))return;const data=await mod(ctx,'report',{report_id:ctx.params.id});await page(ctx,'mod-report',{...data,currentPath:ctx.path});});
  router.add('DELETE','/mod_tools/reports/:id',async ctx=>{if(!await ctx.authorize('admin'))return;await write(ctx,'report-close',{report_id:ctx.params.id},'/mod_tools/reports/'+ctx.params.id,'Closed ticket');});
  for(const method of ['PATCH','PUT'])router.add(method,'/mod_tools/reports/:id',async ctx=>{if(!await ctx.authorize('admin'))return;await mod(ctx,'report',{report_id:ctx.params.id});ctx.redirect('/mod_tools/reports/'+ctx.params.id);});
  router.add('DELETE','/mod_tools/links/:id',async ctx=>{if(!await ctx.authorize('admin'))return;await write(ctx,'link-delete',{link_id:ctx.params.id},'/mod_tools/reports','Link was successfully destroyed.');});
  for(const path of ['/lizard_tools','/lizard_tools/'])router.add('GET',path,async ctx=>{if(!await ctx.authorize('lizard'))return;await mod(ctx,'lizard-index');await page(ctx,'mod-lizard-index');});
  for(const mascot of ['ki','warren','taylor'])router.add('GET','/lizard_tools/'+mascot,async ctx=>{if(!await ctx.authorize('lizard'))return;const data=await mod(ctx,'lizard-browse',{mascot,page:ctx.query.page || 1});const hydrated=await ctx.call('browser','hydrate',{ids:{links:data.links.map(l=>l.id)}});await page(ctx,'mod-lizard',{...data,mascot,graph:mergeGraphs(hydrated.graph,{links:data.links,users:data.users})});});
}
