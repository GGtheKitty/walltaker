import {HttpError} from './errors.js';
import {renderPage, mergeGraphs} from './pages.js';
import {startVisit, track} from './activity.js';

export const wizardSteps = ['intro','summon','control','kinks','gender','surprise','no_fun','orgasmic_conclusion'];
const settings = ['expires','terms','blacklist','friends_only','never_expires','theme','min_score','custom_url'];
const pick = (object, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(object || {},k)).map(k => [k,object[k]]));
const actor = ctx => ({actor_id:ctx.auth.user?.id,surrender_id:ctx.auth.surrender?.id || null});
const command = (ctx,op) => ({...actor(ctx),request_key:`web:${ctx.requestId}:${op}`});
const path = link => '/links/'+link.id;
const wizardPath = (link,step) => path(link)+'/wizard/'+step;
const values = ctx => ({...ctx.query,...ctx.body});
const attributes = ctx => ({...ctx.query.link,...ctx.body.link});
const jsonRequest = ctx => ctx.path.endsWith('.json') || /application\/json/.test(ctx.req.headers.accept || '');
async function json(ctx,link,status=200) {
  const setter = link.set_by_id ? await ctx.call('browser','user',{user_id:link.set_by_id}).catch(error => {if(error.status===404)return null;throw error;}) : null;
  const user = setter?.graph.users.find(u => String(u.id)===String(link.set_by_id));
  ctx.send(status,JSON.stringify({...pick(link,['id','expires','user_id','terms','blacklist','post_url','post_thumbnail_url','post_description','created_at','updated_at','post_url_backup']),set_by:user?.username || null,url:ctx.config.baseUrl+path(link)+'.json'}),{'content-type':'application/json'});
}
async function allowed(ctx,write=false) {
  if (!await ctx.authorize()) return false;
  if (write && ctx.auth.user.quarantined) throw new HttpError(403,'This account cannot change wallpapers or links.');
  return true;
}
async function visit(ctx) { ctx.visit = await startVisit(ctx); }
async function snapshot(ctx,purpose='show',identifier=ctx.params.id || ctx.params.link_id) {
  const result = await ctx.call('browser','link',{identifier:String(identifier).replace(/\.json$/,''),purpose});
  const link = result.graph.links.find(l => String(l.id)===String(result.link_id));
  if (!link) throw new HttpError(404,'This link is not available.');
  return {...result,link};
}
async function page(ctx,template,data={}) { return renderPage(ctx,{template,...data}); }
async function banned(ctx) {
  const result = await ctx.call('activity','visit',{visit_token:ctx.cookies.values.ahoy_visit || '',visitor_token:ctx.cookies.values.ahoy_visitor || '',ip:ctx.ip});
  if (result.ban || ctx.auth.user?.quarantined) throw new HttpError(403,'Wallpaper selection is unavailable for this account or connection.');
}
export function linkPolicy(data) {
  const {link,graph} = data, abilities = new Set((graph.abilities || []).filter(a => String(a.link_id)===String(link.id)).map(a => a.ability));
  const memberships = graph.memberships || [];
  const kinks = (graph.kinks || []).filter(k => memberships.some(m => String(m.user_id)===String(link.user_id) && String(m.kink_id)===String(k.id))).map(k => k.name);
  return {...pick(link,['blacklist','theme','min_score']),can_show_videos:abilities.has('can_show_videos'),is_kink_aligned:abilities.has('is_kink_aligned'),kinks};
}
function selectionPermission(ctx,data) {
  const restricted = (data.graph.abilities || []).some(a => String(a.link_id)===String(data.link.id) && a.ability==='is_master_only');
  const master = (data.graph.leashes || []).find(l => String(l.pet_id)===String(data.link.user_id));
  if (restricted && (!master || String(master.master_id)!==String(ctx.auth.user?.id))) throw new HttpError(403,'Only this user’s owner can select a wallpaper.');
}
async function updateTest(ctx,link,graph) {
  try {
    const posts = await ctx.call('e621','search',{tags:'',limit:100,policy:linkPolicy({link,graph})});
    const count=posts.length;
    if(count>99)ctx.flash.set('notice','Many posts are selectable with these settings.');
    else if(count>0)ctx.flash.set(count>30?'notice':'alert',`Only ${count} ${count===1?'post':'posts'} can be selected with these settings. You may not get many wallpapers.${count===99?'🎈':''}`);
    else ctx.flash.set('alert','No posts are selectable with these settings! Check if your theme tag is an aliased tag, or if your blacklist is impossible.');
  } catch (error) { if(error.status!==503)throw error;ctx.flash.set('alert',"E621 may be down. You can save your link for now, though we can't verify that posts match your filter criteria at the moment."); }
  ctx.redirect(path(link)+'/edit');
}
async function save(ctx,creating=false) {
  const input = attributes(ctx);
  if (!creating && Object.hasOwn(input,'post_id')) {
    if (ctx.auth.user && !await allowed(ctx,true))return;
    await banned(ctx);await visit(ctx);
    const data = await snapshot(ctx,'update');selectionPermission(ctx,data);
    let post;
    try {post = await ctx.call('e621','select',{post_id:input.post_id,policy:linkPolicy(data)});}
    catch(error){if(error.status!==422)throw error;ctx.flash.set('alert','Enter a valid e621 post ID (only the number).');return ctx.redirect(path(data.link));}
    if (!post?.file?.url) {ctx.flash.set('alert','Post could not be found or was blacklisted.');return ctx.redirect(path(data.link));}
    const {link} = data;
    await ctx.call('wallpaper','update',{request_key:`web:${ctx.requestId}:wallpaper`,link_id:link.id,post_id:post.id,set_by_id:ctx.auth.user?.id || null,post_url:post.file.url,post_thumbnail_url:post.sample?.url || post.preview?.url || null,post_description:post.description || '',tags:Object.values(post.tags || {}).flat().join(' ')+' rating:'+post.rating,count_self:false,ahoy_visit_id:ctx.visit?.id || null,
      expected_policy:pick(link,['user_id','blacklist','theme','min_score','friends_only','never_expires','expires']),...(ctx.auth.user ? {activity:{...actor(ctx),visit:ctx.visit}} : {})});
    ctx.flash.set('notice','Link was successfully updated.');return ctx.redirect(path(link));
  }
  if (!await allowed(ctx,true))return;
  await visit(ctx);
  let data = creating ? {link:{expires:new Date(Date.now()+86400000).toISOString(),min_score:0},graph:{}} : await snapshot(ctx,'edit');
  if (!creating && Object.hasOwn(input,'response_type')) {
    await ctx.call('wallpaper','reaction',{request_key:`web:${ctx.requestId}:reaction`,link_id:data.link.id,owner_id:ctx.auth.user.id,type:input.response_type,text:input.response_text || '',expected_post_url:data.link.post_url});
    ctx.flash.set('notice','Link was successfully updated.');return ctx.redirect(path(data.link));
  }
  try {
    const result = await ctx.call('links',creating ? 'create' : 'update',{...command(ctx,creating?'create':'update'),...(creating?{}:{link_id:data.link.id}),attributes:pick(input,settings),ahoy_visit_id:ctx.visit?.id || null});
    if(values(ctx).commit==='Update and Test') {
      const fresh=await snapshot(ctx,'edit',result.link.id);return updateTest(ctx,result.link,fresh.graph);
    }
    if (jsonRequest(ctx))return json(ctx,result.link,creating?201:200);
    ctx.flash.set('notice',`Link was successfully ${creating?'created':'updated'}.`);ctx.redirect(path(result.link));
  } catch(error) {
    if(error.status!==422)throw error;
    if(jsonRequest(ctx))return ctx.send(422,JSON.stringify(error.errors || {base:[error.message]}),{'content-type':'application/json'});
    return page(ctx,'wallpaper-form',{...data,link:{...data.link,...pick(input,settings)},errors:error.errors || {base:[error.message]},creating,status:422});
  }
}
async function comments(ctx,isNew=false) {
  const data=await snapshot(ctx,'show',ctx.params.link_id);
  if(isNew)return page(ctx,'wallpaper-comment-form',data);
  const result=await ctx.call('social','comments',{...actor(ctx),link_id:data.link.id});
  const ids=[...new Set(result.comments.map(c=>c.user_id))];
  const hydrated=ids.length?await ctx.call('browser','hydrate',{ids:{users:ids}}):{};
  return page(ctx,'wallpaper-comments',{...data,graph:mergeGraphs(data.graph,hydrated.graph),comments:result.comments});
}
async function searchData(ctx) {
  const input=values(ctx);
  if(input.link) {const data=await snapshot(ctx,'search',input.link);selectionPermission(ctx,data);return {...data,policy:linkPolicy(data)};}
  if(input.message_thread) {
    if(!await allowed(ctx))return;
    const thread=await ctx.call('browser','thread',{thread_id:input.message_thread});return {thread_id:thread.thread_id,graph:thread.graph,policy:null};
  }
  throw new HttpError(422,'Choose a wallpaper link or message thread first.');
}
async function e621(ctx,results=false) {
  await banned(ctx);
  const data=await searchData(ctx);if(!data)return;
  const input=values(ctx);let posts=[],unavailable=false;
  if(results)try { posts=await ctx.call('e621','search',{...pick(input,['tags','after','before']),tags:input.tags || '',limit:15,policy:data.policy}); }
  catch(error){if(error.status!==503)throw error;unavailable=true;}
  return page(ctx,results?'wallpaper-e621-results':'wallpaper-e621',{...data,tags:input.tags || '',pageNumber:Math.max(1,Number(input.page_number)||1),posts,unavailable,fullRerender:!!input.full_rerender,status:unavailable?503:200});
}
export function addWallpaperRoutes(router) {
  for(const url of ['/links','/links.json'])router.add('GET',url,async ctx=>{
    if(!await allowed(ctx))return;
    const result=await ctx.call('links','list',actor(ctx));
    if(jsonRequest(ctx)) {const links=await Promise.all(result.links.map(async l=>({...pick(l,['id','expires','user_id','terms','blacklist','post_url','post_thumbnail_url','post_description','created_at','updated_at','post_url_backup']),url:ctx.config.baseUrl+path(l)+'.json'})));return ctx.send(200,JSON.stringify(links),{'content-type':'application/json'});}
    const hydrated=result.links.length?await ctx.call('browser','hydrate',{ids:{links:result.links.map(l=>l.id)}}):{};
    return page(ctx,'wallpaper-list',{links:result.links,graph:hydrated.graph});
  });
  router.add('GET','/links/new',async ctx=>{if(!await allowed(ctx))return;return page(ctx,'wallpaper-form',{creating:true,link:{min_score:0,expires:new Date(Date.now()+86400000).toISOString()}});});
  router.add('POST','/links',ctx=>save(ctx,true));
  router.add('GET','/links/wizard',async ctx=>{
    if(!await allowed(ctx,true))return;
    if(ctx.req.method==='HEAD'||ctx.prefetch)return ctx.redirect('/links');
    let foreign=ctx.req.headers['sec-fetch-site']==='cross-site';
    for(const value of [ctx.req.headers.origin,ctx.req.headers.referer])if(value){try{foreign ||= new URL(value).origin!==new URL(ctx.config.baseUrl).origin;}catch{foreign=true;}}
    if(foreign)throw new HttpError(403,'Start the wizard from Walltaker.');
    await visit(ctx);const result=await ctx.call('links','wizard-start',{...command(ctx,'wizard-start'),ahoy_visit_id:ctx.visit?.id || null});ctx.redirect(wizardPath(result.link,'intro'));
  });
  router.add('GET','/browse',async ctx=>{const data=await ctx.call('discovery','browse',{});return page(ctx,'wallpaper-browse',data);});
  for(const url of ['/search','/search/index'])router.add('GET',url,ctx=>page(ctx,'wallpaper-search',{query:ctx.query.q || '',only_online:ctx.query.only_online==='1'}));
  for(const url of ['/search/query','/search/results'])router.add('GET',url,async ctx=>{
    const data=await ctx.call('discovery','search',{query:ctx.query.q || '',page:ctx.query.page || 1,only_online:ctx.query.only_online || '0'});return page(ctx,'wallpaper-search-results',data);
  });
  for(const [url,results] of [['/porn_search/index',false],['/porn_search/search',true]])router.add('GET',url,ctx=>e621(ctx,results));
  router.add('GET','/porn_search/search/kinks_for/:link_id',async ctx=>{const data=await snapshot(ctx,'search');return page(ctx,'wallpaper-kinks',data);});
  router.add('POST','/porn_search/send_message_and_return/:thread',async ctx=>{
    if(!await allowed(ctx,true))return;const input=values(ctx);
    const result=await ctx.call('social','message-send',{...command(ctx,'message'),thread_id:ctx.params.thread,content:input.message});return ctx.redirect('/messages/'+result.thread_id);
  });
  for(const url of ['/links/:id/walltaker','/links/:id/walltaker.toml'])router.add('GET',url,async ctx=>{const data=await snapshot(ctx,'export');const result=await ctx.call('links','export',{link_id:data.link.id});ctx.send(200,result.text,{'content-type':'application/toml; charset=utf-8','content-disposition':`attachment; filename="walltaker-${data.link.id}.toml"`});});
  router.add('GET','/links/:id/show_similar',async ctx=>{const data=await snapshot(ctx);const result=await ctx.call('discovery','similar',{link_id:data.link.id,viewer_id:ctx.auth.user?.id || null});if(!result.link_id)ctx.flash.set('alert','No other link was found.');return ctx.redirect(result.link_id?'/links/'+result.link_id:path(data.link));});
  router.add('GET','/links/:id/embed',async ctx=>{const data=await snapshot(ctx,'embed');return page(ctx,'wallpaper-embed',{...data,embed:pick(ctx.query,['type','fit','background','hide_text']),headers:{'x-frame-options':null,'content-security-policy':'frame-ancestors *'}});});
  router.add('GET','/links/:id/edit',async ctx=>{if(!await allowed(ctx))return;return page(ctx,'wallpaper-form',{...await snapshot(ctx,'edit'),creating:false});});
  router.add('POST','/links/:id/abilities/:ability',async ctx=>{
    if(!await allowed(ctx,true))return;const data=await snapshot(ctx,'ability');
    await ctx.call('links','toggle-ability',{...command(ctx,'ability'),link_id:data.link.id,ability:ctx.params.ability});
    return ctx.redirect(path(data.link)+(String(ctx.auth.user.id)===String(data.link.user_id)?'/edit':''));
  });
  for(const method of ['PATCH','PUT'])router.add(method,'/links/:id',ctx=>save(ctx));
  router.add('DELETE','/links/:id',async ctx=>{if(!await allowed(ctx,true))return;const data=await snapshot(ctx,'destroy');await ctx.call('links','destroy',{...command(ctx,'destroy'),link_id:data.link.id});ctx.flash.set('notice','Link was successfully destroyed.');return ctx.redirect('/links');});
  router.add('GET','/links/:id',async ctx=>{
    const data=await snapshot(ctx);
    if(jsonRequest(ctx))return json(ctx,data.link);
    await visit(ctx);
    if(ctx.auth.user && ctx.req.method!=='HEAD'&&!ctx.prefetch)await ctx.call('activity','record',{...command(ctx,'view'),link_id:data.link.id,kind:'looked_at',visit:ctx.visit});
    let suffix='';try{suffix=(await ctx.call('e621','query',{tags:'',policy:linkPolicy(data)})).suffix;}catch(error){if(error.status!==503)throw error;}
    return page(ctx,'wallpaper-show',{...data,searchSuffix:suffix});
  });
  for(const [url,isNew] of [['/links/:link_id/comments',false],['/links/:link_id/comments/new',true]])router.add('GET',url,ctx=>comments(ctx,isNew));
  router.add('POST','/links/:link_id/comments',async ctx=>{
    if(!await allowed(ctx,true))return;await visit(ctx);const data=await snapshot(ctx,'show',ctx.params.link_id);
    try {await ctx.call('social','comment-create',{...command(ctx,'comment'),link_id:data.link.id,content:ctx.body.comment?.content,activity_visit:ctx.visit});return ctx.redirect(path(data.link)+'/comments/new');}
    catch(error){if(error.status!==422)throw error;return page(ctx,'wallpaper-comment-form',{...data,comment:ctx.body.comment?.content,error: error.message,status:422});}
  });
  router.add('GET','/links/:link_id/wizard',async ctx=>{if(!await allowed(ctx))return;const data=await snapshot(ctx,'wizard');return ctx.redirect(wizardPath(data.link,data.link.wizard_page || 'orgasmic_conclusion'));});
  router.add('GET','/links/:link_id/wizard/:step',async ctx=>{
    if(!await allowed(ctx))return;const data=await snapshot(ctx,'wizard');
    if(!wizardSteps.includes(ctx.params.step))throw new HttpError(404,'Wizard step not found.');
    const expected=data.link.wizard_page || 'orgasmic_conclusion';if(ctx.params.step!==expected)return ctx.redirect(wizardPath(data.link,expected));
    return page(ctx,'wallpaper-wizard',{...data,step:expected});
  });
  router.add('POST','/links/:link_id/wizard/:step/apply',async ctx=>{
    if(!await allowed(ctx,true))return;const data=await snapshot(ctx,'wizard');
    if(!wizardSteps.includes(ctx.params.step)||ctx.params.step==='orgasmic_conclusion')throw new HttpError(404,'Wizard step not found.');
    try {const result=await ctx.call('links','wizard-apply',{...command(ctx,'wizard'),link_id:data.link.id,step:ctx.params.step,choices:pick(values(ctx),['gooner','impatient','protect','terms','theme','friends_only','blacklisted_genders','blacklisted_parts','blacklisted_sexualities'])});ctx.redirect(wizardPath(data.link,result.next_step));}
    catch(error){if(error.status===409){const fresh=await snapshot(ctx,'wizard');ctx.flash.set('alert',error.message);return ctx.redirect(wizardPath(fresh.link,fresh.link.wizard_page || 'orgasmic_conclusion'));}if(error.status!==422)throw error;return page(ctx,'wallpaper-wizard',{...data,step:ctx.params.step,choices:values(ctx),errors:error.errors || {base:[error.message]},status:422});}
  });
  for(const method of ['PATCH','PUT'])router.add(method,'/links/:link_id/wizard/:step',async ctx=>{if(!await allowed(ctx,true))return;const data=await snapshot(ctx,'wizard');return ctx.redirect(data.link.wizard_page?wizardPath(data.link,data.link.wizard_page):path(data.link));});
  for(const [url,kind] of [['/users/:username/history','received'],['/users/:username/sets','sent']])router.add('GET',url,async ctx=>{
    const user=await ctx.call('browser','user',{username:ctx.params.username});
    const posts=await ctx.call('wallpaper','history',{user_id:user.user_id,kind,limit:50});
    return page(ctx,'wallpaper-history',{graph:user.graph,targetUser:user.graph.users.find(u=>String(u.id)===String(user.user_id)),posts,kind});
  });
}
