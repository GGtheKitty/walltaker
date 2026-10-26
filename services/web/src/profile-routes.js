import {HttpError} from './errors.js';
import {renderPage,mergeGraphs} from './pages.js';
import {startVisit,track} from './activity.js';
import {isMarkdown,dumpMarkdown,markdown,renderedProfile,sanitizeProfileHTML,filterProfileDomains} from './profile-content.js';

const actor=ctx=>({actor_id:ctx.auth.user?.id,surrender_id:ctx.auth.surrender?.id || null});
const command=(ctx,op)=>({...actor(ctx),request_key:`web:${ctx.requestId}:${op}`});
const userPath=u=>'/users/'+encodeURIComponent(u.username);
const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
const page=(ctx,template,data={})=>renderPage(ctx,{template,...data});
async function signed(ctx){return ctx.authorize();}
async function userData(ctx,value=ctx.params.username || ctx.params.id,privateData=false){
  const data=await ctx.call('browser','profile-page',{username:value,private:privateData});
  const user=data.graph.users.find(u=>same(u.id,data.user_id));if(!user)throw new HttpError(404,'Missing user or the username was typed incorrectly.');
  const profile=data.graph.profiles.find(p=>same(p.id,user.profile_id)) || null;
  const fallback=data.graph.profiles.filter(p=>same(p.user_id,user.id)).sort((a,b)=>Number(a.id)-Number(b.id))[0];
  return {...data,targetUser:user,profile,details:(profile || fallback)?.content ?? user.details ?? '',isCurrent:same(user.id,ctx.auth.user?.id)};
}
async function domains(ctx,content,record=false){
  const {rules}=await ctx.call('moderation','domain-rules',{}),result=filterProfileDomains(content,rules);
  if(record&&result.domains.length)await ctx.call('moderation','domain-seen',{domains:result.domains});
  return result;
}
async function profileValues(ctx,data){
  const stats=await ctx.call('tracker','statistics',{...actor(ctx),username:data.targetUser.username});
  const filtered=await domains(ctx,data.details);
  if(stats.current?.past_link_id && !data.graph.past_links.some(p=>same(p.id,stats.current.past_link_id))){const loaded=await ctx.call('browser','hydrate',{ids:{past_links:[stats.current.past_link_id]}});data={...data,graph:mergeGraphs(data.graph,loaded.graph)};}
  let orgasmForm=null;
  if(data.isCurrent){try{orgasmForm=await ctx.call('tracker','form',actor(ctx));}catch(error){if(error.status!==403)throw error;}}
  return {...data,orgasmForm,details:filtered.content,renderedDetails:renderedProfile(filtered.content,data.targetUser.advanced),editorHTML:sanitizeProfileHTML(filtered.content),statistics:stats};
}
async function renderUser(ctx,{editing=false,document=false}={}){
  if(editing&&!await signed(ctx))return;
  if(document&&ctx.req.headers['sec-fetch-dest']!=='iframe')return ctx.redirect('/users/'+encodeURIComponent(ctx.params.username));
  const data=await userData(ctx,ctx.params.username,true);
  if(editing&&!data.isCurrent)return ctx.redirect(userPath(data.targetUser));
  ctx.visit=await startVisit(ctx);
  await page(ctx,'profile-user',{...await profileValues(ctx,data),editing,profileDocument:document,...(document?{headers:{'x-robots-tag':'noindex, nofollow'}}:{})});
  if(!document)await track(ctx,'visit:'+ctx.path,{_url:ctx.originalUrl});
}
async function mutation(ctx,op,input={}){return ctx.call('accounts',op,{...command(ctx,op),...input});}
async function profileFailure(ctx,error,back){if(![409,422].includes(error.status))throw error;ctx.flash.set('alert',Object.values(error.errors || {}).flat().join(', ') || error.message);return ctx.redirect(back);}
async function interests(ctx,username){
  const data=await ctx.call('social','kinks',{...actor(ctx),username});
  const hydrated=await ctx.call('browser','hydrate',{ids:{users:[data.user.id]}});
  const graph=mergeGraphs(hydrated.graph,{users:[data.user],kinks:data.kinks});
  return {targetUser:data.user,link:{user_id:data.user.id},graph,isCurrent:same(data.user.id,ctx.auth.user?.id)};
}
async function hydrate(ctx,ids){return Object.values(ids).some(v=>v.length)?(await ctx.call('browser','hydrate',{ids})).graph:{};}
async function kinkMutation(ctx,operation){
  if(!await signed(ctx))return;
  let result;
  try {result=await ctx.call('social',operation,{...command(ctx,operation),...(operation==='kink-add'?{name:ctx.body.kink?.name}:{kink_id:ctx.params.id})});}
  catch(error){if(error.status!==422)throw error;return page(ctx,'profile-interest-error',{error:error.message,name:ctx.body.kink?.name,status:422,headers:{'content-type':'text/vnd.turbo-stream.html; charset=utf-8'}});}
  const data=await interests(ctx,ctx.auth.user.username);
  return page(ctx,'profile-interest-update',{...data,operation,kinkId:result.kink_id,headers:{'content-type':'text/vnd.turbo-stream.html; charset=utf-8'}});
}
export function addProfileRoutes(router){
  router.add('GET','/users/:username/profile-document',ctx=>renderUser(ctx,{document:true}));
  router.add('GET','/users/:username/edit',ctx=>renderUser(ctx,{editing:true}));
  router.add('GET','/users/:id/details',async ctx=>{const data=await userData(ctx,ctx.params.id);const filtered=await domains(ctx,data.details);return page(ctx,'profile-details',{...data,renderedDetails:renderedProfile(filtered.content,data.targetUser.advanced)});});
  router.add('GET','/users/:id/toggle_details_mode',async ctx=>{
    if(!await signed(ctx))return;
    if(ctx.req.method==='HEAD'||ctx.prefetch)return ctx.redirect(userPath(ctx.auth.user)+'/edit');
    let foreign=ctx.req.headers['sec-fetch-site']==='cross-site';for(const value of [ctx.req.headers.origin,ctx.req.headers.referer])if(value){try{foreign ||= new URL(value).origin!==new URL(ctx.config.baseUrl).origin;}catch{foreign=true;}}if(foreign)throw new HttpError(403,'Change profile mode from Walltaker.');
    const data=await userData(ctx,ctx.params.id,true);if(!data.isCurrent)throw new HttpError(403,'Not Authorized.');
    try{await mutation(ctx,'profile-mode',{expected_advanced:data.targetUser.advanced,profile_id:data.profile?.id || null,profile_updated_at:data.profile?.updated_at || null,html:!data.targetUser.advanced&&isMarkdown(data.details)?sanitizeProfileHTML(markdown(data.details)):null});ctx.redirect(userPath(data.targetUser)+'/edit');}catch(error){return profileFailure(ctx,error,userPath(data.targetUser)+'/edit');}
  });
  for(const method of ['PATCH','PUT'])router.add(method,'/users/:id',async ctx=>{
    if(!await signed(ctx))return;const data=await userData(ctx,ctx.params.id,true);if(!data.isCurrent)throw new HttpError(403,'Not Authorized.');
    const submitted=ctx.body.user?.details;if(typeof submitted!=='string')throw new HttpError(422,'Profile description is required.');
    if(Array.from(submitted).length>(data.targetUser.advanced?200000:50000))throw new HttpError(422,'Profile description is too long.');
    const prepared=await domains(ctx,data.targetUser.advanced?submitted:dumpMarkdown(submitted),true);
    try{await mutation(ctx,'profile-content',{content:prepared.content,expected_advanced:data.targetUser.advanced});ctx.flash.set('notice','Successfully updated user.'+(prepared.blocked_domains.length?` Links to blocked ${prepared.blocked_domains.length===1?'domain':'domains'} were removed.`:''));return ctx.redirect(userPath(data.targetUser));}catch(error){return profileFailure(ctx,error,userPath(data.targetUser)+'/edit');}
  });
  router.add('POST','/users/:id/profile',async ctx=>{if(!await signed(ctx))return;const data=await userData(ctx,ctx.params.id);if(!data.isCurrent)throw new HttpError(403,'Not Authorized.');try{await mutation(ctx,'profile-select',{profile_id:ctx.body.profile_selector_form?.profile_id});ctx.redirect(userPath(data.targetUser)+'/edit');}catch(error){return profileFailure(ctx,error,userPath(data.targetUser)+'/edit');}});
  router.add('GET','/users/:username',async ctx=>{
    ctx.visit=await startVisit(ctx);const data=await userData(ctx,ctx.params.username);await page(ctx,'profile-shell',data);await track(ctx,'visit:'+ctx.path,{_url:ctx.originalUrl});
  });
  for(const url of ['/profiles','/users/:user_id/profiles'])router.add('GET',url,async ctx=>{
    if(!await signed(ctx))return;
    const data=await ctx.call('browser','profiles',{page:ctx.query.page || 1,...(ctx.params.user_id?{user_id:ctx.params.user_id}:{})});
    return page(ctx,'profile-styles',{...data,profiles:data.profile_ids.map(id=>data.graph.profiles.find(p=>same(p.id,id))),targetUser:data.graph.users.find(u=>same(u.id,data.user_id))});
  });
  router.add('GET','/profiles/:id/preview',async ctx=>{
    if(!await signed(ctx))return;const data=await ctx.call('browser','profile-preview',{profile_id:ctx.params.id});
    const profile=data.graph.profiles.find(p=>same(p.id,data.profile_id)),targetUser={...data.graph.users.find(u=>same(u.id,data.preview_user_id)),username:'BrightFeather',advanced:true,profile_id:profile.id};
    const filtered=await domains(ctx,profile.content);
    const statistics=await ctx.call('tracker','statistics',{...actor(ctx),username:ctx.auth.user.username});
    return page(ctx,'profile-user',{...data,profile,targetUser,details:filtered.content,renderedDetails:renderedProfile(filtered.content,true),preview:true,isCurrent:true,interestUsername:data.graph.users.find(u=>same(u.id,data.preview_user_id))?.username,statistics:{days:statistics.days,total:statistics.total,caused:statistics.caused,current:null,nnn_enabled:false},graph:mergeGraphs(data.graph,{users:[targetUser]})});
  });
  router.add('GET','/profiles/:id',async ctx=>{if(!await signed(ctx))return;const data=await ctx.call('browser','profile-style',{profile_id:ctx.params.id});return page(ctx,'profile-style',{...data,profile:data.graph.profiles.find(p=>same(p.id,data.profile_id))});});
  router.add('POST','/profiles',async ctx=>{if(!await signed(ctx))return;await mutation(ctx,'profile-create');ctx.redirect(userPath(ctx.auth.user)+'/edit');});
  for(const method of ['PATCH','PUT'])router.add(method,'/profiles/:id',async ctx=>{
    if(!await signed(ctx))return;try{
      if(ctx.body.profile_rename_form)await mutation(ctx,'profile-rename',{profile_id:ctx.params.id,name:ctx.body.profile_rename_form.name});
      else if(ctx.body.profile_adder_form){await mutation(ctx,'profile-copy',{profile_id:ctx.params.id});return ctx.redirect(userPath(ctx.auth.user));}
      else{if(!ctx.body.profile || !['0','1',0,1,true,false,'true','false','on','off'].includes(ctx.body.profile.public))throw new HttpError(400,'Profile visibility is required.');await mutation(ctx,'profile-share',{profile_id:ctx.params.id,public:ctx.body.profile?.public});const data=await userData(ctx,ctx.auth.user.username,true);return page(ctx,'profile-sharing',{...data,headers:{'content-type':'text/vnd.turbo-stream.html; charset=utf-8'}});}
      ctx.redirect(userPath(ctx.auth.user)+'/edit');
    }catch(error){return profileFailure(ctx,error,userPath(ctx.auth.user)+'/edit');}
  });
  router.add('DELETE','/profiles/:id',async ctx=>{if(!await signed(ctx))return;await mutation(ctx,'profile-delete',{profile_id:ctx.params.id});ctx.redirect(userPath(ctx.auth.user)+'/edit');});
  router.add('GET','/users/:user_id/kinks',async ctx=>page(ctx,'profile-interests',await interests(ctx,ctx.params.user_id)));
  router.add('GET','/kinks/new',async ctx=>{if(!await signed(ctx))return;return page(ctx,'profile-interest-form');});
  router.add('GET','/kinks/:id',async ctx=>{
    const data=await ctx.call('social','kink',{...actor(ctx),kink_id:ctx.params.id});const graph=await hydrate(ctx,{users:data.users.map(u=>u.id)});return page(ctx,'profile-interest',{kink:data.kink,usersList:data.users,graph});
  });
  for(const url of ['/kinks','/kinks/:id'])router.add('POST',url,ctx=>kinkMutation(ctx,'kink-add'));
  router.add('POST','/kinks/:id/star',ctx=>kinkMutation(ctx,'kink-star'));
  router.add('DELETE','/kinks/:id',ctx=>kinkMutation(ctx,'kink-remove'));
  router.add('POST','/kinks/:id/test/e621',async ctx=>{
    const data=await ctx.call('social','kink',{...actor(ctx),kink_id:ctx.params.id});
    const posts=await ctx.call('e621','search',{tags:data.kink.name,limit:1,policy:null});const result=await ctx.call('social','kink-status',{kink_id:data.kink.id,works:posts.length>0});
    return page(ctx,'profile-interest-status',{kink:{...data.kink,works_on_e621:result.works},failed:!result.works,headers:{'content-type':'text/vnd.turbo-stream.html; charset=utf-8'}});
  });
  router.add('GET','/link_lists',async ctx=>{
    const mine=ctx.query.filter==='mine';if(mine&&!ctx.auth.user)return ctx.redirect('/link_lists');
    const data=await ctx.call('social','community-interests',{...actor(ctx),query:ctx.query.q || '',mine,page:ctx.query.page || 1});
    const ids=[...new Set(Object.values(data.previews).flatMap(p=>p.links.map(l=>l.id)))],graph=await hydrate(ctx,{links:ids});return page(ctx,'profile-community',{...data,graph,mine,query:ctx.query.q || ''});
  });
  router.add('GET','/link_lists/:id',async ctx=>{
    const data=await ctx.call('social','community-links',{...actor(ctx),kink_id:ctx.params.id,page:ctx.query.page || 1});const graph=await hydrate(ctx,{links:data.links.map(l=>l.id)});return page(ctx,'profile-community-links',{...data,graph});
  });
}
