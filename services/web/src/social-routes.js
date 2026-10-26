import {HttpError} from './errors.js';
import {renderPage,mergeGraphs} from './pages.js';
import {startVisit,track} from './activity.js';

const actor=ctx=>({actor_id:ctx.auth.user?.id,surrender_id:ctx.auth.surrender?.id || null});
const command=(ctx,op)=>({...actor(ctx),request_key:`web:${ctx.requestId}:${op}`});
const social=(ctx,op,input={})=>ctx.call('social',op,{...command(ctx,op),...input});
const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
const userPath=u=>'/users/'+encodeURIComponent(u.username);
const page=(ctx,template,data={})=>renderPage(ctx,{template,...data});
async function hydrate(ctx,ids,overlay={}){const clean=Object.fromEntries(Object.entries(ids).filter(([,list])=>list.length));return mergeGraphs(Object.keys(clean).length?(await ctx.call('browser','hydrate',{ids:clean})).graph:{},overlay);}
function back(ctx,fallback){try{const u=new URL(ctx.req.headers.referer);if(u.origin===new URL(ctx.config.baseUrl).origin)return u.pathname+u.search;}catch{}return fallback;}
function navigation(ctx,fallback){
  if(ctx.req.method==='HEAD'||ctx.prefetch){ctx.redirect(fallback);return false;}
  let foreign=ctx.req.headers['sec-fetch-site']==='cross-site';
  for(const value of [ctx.req.headers.origin,ctx.req.headers.referer])if(value){try{foreign ||= new URL(value).origin!==new URL(ctx.config.baseUrl).origin;}catch{foreign=true;}}
  if(foreign)throw new HttpError(403,'Please use this control from Walltaker.');return true;
}
function field(value,max=50000){if(value==null)return '';if(typeof value!=='string'||value.length>max)throw new HttpError(422,'Invalid or oversized text.');return value;}
async function mutation(ctx,op,input,location,notice){
  try{const result=await social(ctx,op,input);if(notice)ctx.flash.set('notice',notice);ctx.redirect(typeof location==='function'?location(result):location);}
  catch(error){if(error.status!==422)throw error;ctx.flash.set('alert',error.message.slice(0,1200));ctx.redirect(op.startsWith('friend-')?'/friendships':op.startsWith('thread-')||op==='message-send'?'/messages':op==='leash-create'?'/leashes/new':op.startsWith('leash-')?userPath(ctx.auth.user)+'/leashes':op.startsWith('surrender-')?'/surrenders/new':op==='scoop-create'?'/scoops/new':'/scoops');}
}
async function friends(ctx){const data=await social(ctx,'friends');return {...data,graph:await hydrate(ctx,{friendships:data.friendships.map(f=>f.id)},{friendships:data.friendships})};}
async function messageContent(ctx,messages){
  const cache=new Map();const prepared=[];
  for(const message of messages){let content=message.content || '';
    for(const match of [...content.matchAll(/https:\/\/e621\.net\/posts\/(\d+)(?:\?[\w=&%+]*)?/g)]){
      // Bound external lookups per page; unresolved links remain usable text.
      if(!cache.has(match[1])&&cache.size>=20)continue;
      if(!cache.has(match[1])){try{cache.set(match[1],(await ctx.call('e621','post',{post_id:match[1]})).post?.file?.url || null);}catch(error){if(error.status!==503)throw error;cache.set(match[1],undefined);}}
      const url=cache.get(match[1]);if(url===null){content='Dead link :(';break;}if(url)content=content.replaceAll(match[0],url);
    }
    prepared.push({...message,content});
  }
  return prepared;
}
async function thread(ctx,before=false){
  const data=await social(ctx,before?'messages-before':'thread',{thread_id:ctx.params.id,...(before?{after_id:ctx.query.after_id}:{})});
  return {...data,messages:await messageContent(ctx,data.messages),graph:await hydrate(ctx,{threads:[data.thread.id],participants:data.participants.map(p=>p.id),messages:data.messages.map(m=>m.id)},{threads:[data.thread],participants:data.participants,messages:data.messages})};
}
async function transition(ctx,op,input={}){
  const result=await ctx.call('browser',op,{...command(ctx,op),...input,ip:ctx.ip});ctx.transition(result);
  ctx.visit=await startVisit(ctx);if(ctx.visit)await ctx.call('activity','visit-authenticate',{...ctx.visit,user_id:result.user.id});
  if(op==='surrender-return')ctx.flash.set('notice',`Returned to ${result.user.username}.`);ctx.redirect('/');
}
export function addSocialRoutes(router){
  for(const path of ['/friendships','/friendships/requests'])router.add('GET',path,async ctx=>{
    if(!await ctx.authorize())return;const data=await friends(ctx);ctx.visit=await startVisit(ctx);await page(ctx,'social-friends',{...data,requests:ctx.path.endsWith('/requests')});await track(ctx,'visit:'+ctx.path,{_url:ctx.originalUrl});
  });
  router.add('GET','/friendships/new',async ctx=>{if(!await ctx.authorize())return;await page(ctx,'social-friend-new',{receiver:field(ctx.query.with,255)});});
  router.add('GET','/friendships/:id',async ctx=>{if(!await ctx.authorize())return;const {friendship}=await social(ctx,'friend',{friendship_id:ctx.params.id});await page(ctx,'social-friend-show',{friendship,graph:await hydrate(ctx,{friendships:[friendship.id]},{friendships:[friendship]})});});
  router.add('POST','/friendships',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'friend-request',{username:field(ctx.body.receiver_username,255)},back(ctx,'/'),'Friend request sent!');});
  router.add('PUT','/friendships/:id/accept',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'friend-accept',{friendship_id:ctx.params.id},'/friendships','Friendship Accepted!');});
  router.add('DELETE','/friendships/:id',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'friend-delete',{friendship_id:ctx.params.id},'/friendships','Friendship was successfully destroyed.');});
  router.add('GET','/messages',async ctx=>{if(!await ctx.authorize())return;const data=await social(ctx,'threads');await page(ctx,'social-threads',{...data,graph:await hydrate(ctx,{threads:data.threads.map(t=>t.id)},{threads:data.threads})});});
  router.add('GET','/messages/new',async ctx=>{if(!navigation(ctx,'/messages')||!await ctx.authorize())return;await mutation(ctx,'thread-create',{},r=>'/messages/'+r.thread_id+'/edit');});
  router.add('GET','/messages/resolve_thread_with/:user_id',async ctx=>{if(!navigation(ctx,'/messages')||!await ctx.authorize())return;await mutation(ctx,'thread-resolve',{user_id:ctx.params.user_id},r=>'/messages/'+r.thread_id);});
  router.add('GET','/messages/:id/edit',async ctx=>{if(!await ctx.authorize())return;const data=await thread(ctx),list=await friends(ctx);await page(ctx,'social-thread-edit',{...data,friendships:list.friendships,graph:mergeGraphs(data.graph,list.graph)});});
  router.add('GET','/messages/:id/load_more',async ctx=>{if(!await ctx.authorize())return;await page(ctx,'social-message-history',{...await thread(ctx,true),headers:{'content-type':'text/vnd.turbo-stream.html; charset=utf-8'}});});
  router.add('GET','/messages/:id',async ctx=>{if(!await ctx.authorize())return;await page(ctx,'social-thread',await thread(ctx));});
  router.add('POST','/messages/:id/send',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'message-send',{thread_id:ctx.params.id,content:field(ctx.body.message?.content)},'/messages/'+ctx.params.id);});
  for(const method of ['PATCH','PUT'])router.add(method,'/messages/:id',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'thread-name',{thread_id:ctx.params.id,name:field(ctx.body.message_thread?.name,255),reset:ctx.body.commit==='Reset'},'/messages/'+ctx.params.id+'/edit');});
  for(const [method,op] of [['POST','thread-add'],['DELETE','thread-remove']])router.add(method,'/messages/:id/users/:user_id',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,op,{thread_id:ctx.params.id,user_id:ctx.params.user_id},op==='thread-remove'&&same(ctx.params.user_id,ctx.auth.user.id)?'/messages':'/messages/'+ctx.params.id+'/edit');});
  for(const method of ['PATCH','PUT'])router.add(method,'/messages/:message_thread_id/participants/:id',async ctx=>{
    if(!await ctx.authorize())return;await social(ctx,'thread-notify',{thread_id:ctx.params.message_thread_id,participant_id:ctx.params.id,notify:field(ctx.body.message_thread_participant?.notify,10)});
    const data=await social(ctx,'thread',{thread_id:ctx.params.message_thread_id});await page(ctx,'social-thread-controls',{...data,headers:{'content-type':'text/vnd.turbo-stream.html; charset=utf-8'}});
  });
  router.add('GET','/notifications',async ctx=>{if(!await ctx.authorize('surrendered'))return;const data=await social(ctx,'notifications');await page(ctx,'social-notifications',{allNotifications:data.notifications});});
  router.add('GET','/notifications/:id',async ctx=>{if(!navigation(ctx,'/notifications')||!await ctx.authorize('surrendered'))return;const data=await social(ctx,'notification-read',{notification_id:ctx.params.id});ctx.redirect(data.link);});
  router.add('DELETE','/notifications',async ctx=>{if(!await ctx.authorize('surrendered'))return;await mutation(ctx,'notifications-clear',{},back(ctx,'/'));});
  router.add('GET','/users/:user_id/leashes',async ctx=>{
    const data=await social(ctx,'leashes',{username:ctx.params.user_id});await page(ctx,'social-leashes',{...data,targetUser:data.user,graph:await hydrate(ctx,{leashes:data.leashes.map(l=>l.id),users:[data.user.id]},{users:[data.user],leashes:data.leashes})});
  });
  router.add('GET','/leashes/new',async ctx=>{if(!await ctx.authorize())return;await page(ctx,'social-leash-new',await friends(ctx));});
  for(const suffix of ['','/edit'])router.add('GET','/leashes/:id'+suffix,async ctx=>{
    if(!await ctx.authorize())return;const data=await social(ctx,'leash',{leash_id:ctx.params.id});if(suffix&&!same(data.leash.master_id,ctx.auth.user.id))throw new HttpError(403,'Not authorized.');await page(ctx,suffix?'social-leash-edit':'social-leash-show',{...data,graph:await hydrate(ctx,{leashes:[data.leash.id]},{leashes:[data.leash]})});
  });
  router.add('POST','/leashes',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'leash-create',{friendship_id:ctx.body.leash?.friendship_id},userPath(ctx.auth.user)+'/leashes');});
  for(const method of ['PATCH','PUT'])router.add(method,'/leashes/:id',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'leash-update',{leash_id:ctx.params.id,flair:field(ctx.body.leash?.flair,1000)},'/leashes/'+ctx.params.id+'/edit','Flair was successfully updated.');});
  router.add('DELETE','/leashes/:id',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'leash-delete',{leash_id:ctx.params.id},userPath(ctx.auth.user)+'/leashes','Leash released.');});
  router.add('GET','/surrenders',async ctx=>{if(!await ctx.authorize())return;const data=await social(ctx,'surrenders');await page(ctx,'social-surrenders',{...data,currentSurrender:data.surrenders[0]});});
  router.add('GET','/surrenders/new',async ctx=>{if(!await ctx.authorize())return;await page(ctx,'social-surrender-new',await friends(ctx));});
  router.add('GET','/surrenders/:id',async ctx=>{
    if(!await ctx.authorize('surrendered'))return;const data=await social(ctx,'surrender',{id:ctx.params.id});if(!same(data.surrender.user_id,ctx.auth.user.id))throw new HttpError(403,'Not authorized.');
    const profile=await ctx.call('browser','profile-page',{username:ctx.auth.user.username});await page(ctx,'social-surrender',{...data,...profile,graph:mergeGraphs(profile.graph,await hydrate(ctx,{surrenders:[data.surrender.id]},{surrenders:[data.surrender]}))});
  });
  router.add('POST','/surrenders',async ctx=>{if(!await ctx.authorize())return;const input=ctx.body.surrender || {};await mutation(ctx,'surrender-create',{friendship_id:input.friendship,duration:field(input.duration,10),accepted:field(input.accepted_consequences,10),pending:field(input.pending,10)},r=>'/surrenders/'+r.surrender_id,'Surrender was successfully created. Now just wait...');});
  router.add('DELETE','/surrenders/:id',async ctx=>{if(!await ctx.authorize('surrendered'))return;await mutation(ctx,'surrender-delete',{id:ctx.params.id},'/surrenders','Surrender was successfully destroyed.');});
  router.add('POST','/surrenders/:id/assume',async ctx=>{if(!await ctx.authorize())return;await transition(ctx,'surrender-assume',{id:ctx.params.id});});
  router.add('POST','/surrenders/return_to_controller',async ctx=>{if(!await ctx.authorize('surrendered'))return;await transition(ctx,'surrender-return');});
  router.add('GET','/scoops',async ctx=>{if(!await ctx.authorize())return;const data=await social(ctx,'scoops');await page(ctx,'social-scoops',{...data,graph:await hydrate(ctx,{scoops:data.scoops.map(s=>s.id)},{scoops:data.scoops})});});
  router.add('GET','/scoops/new',async ctx=>{if(!await ctx.authorize())return;await page(ctx,'social-scoop-form',{scoop:null});});
  for(const suffix of ['','/edit'])router.add('GET','/scoops/:id'+suffix,async ctx=>{
    if(suffix&&!await ctx.authorize())return;const data=await social(ctx,'scoop',{scoop_id:ctx.params.id,edit:!!suffix});await page(ctx,suffix?'social-scoop-form':'social-scoop',{...data,graph:await hydrate(ctx,{scoops:[data.scoop.id]},{scoops:[data.scoop]})});
  });
  router.add('POST','/scoops',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'scoop-create',{details:field(ctx.body.scoop?.details)},'/scoops');});
  for(const method of ['PATCH','PUT'])router.add(method,'/scoops/:id',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'scoop-update',{scoop_id:ctx.params.id,details:field(ctx.body.scoop?.details)},'/scoops/'+ctx.params.id+'/edit','Updated!');});
  router.add('DELETE','/scoops/:id',async ctx=>{if(!await ctx.authorize())return;await mutation(ctx,'scoop-delete',{scoop_id:ctx.params.id},'/scoops','Scoop removed.');});
  router.add('GET','/leaderboard',async ctx=>{const data=await social(ctx,'leaderboard');await page(ctx,'social-leaderboard',{setters:data.users,graph:await hydrate(ctx,{users:data.users.map(u=>u.id)},{users:data.users})});});
  for(const path of ['/news_room','/news_room/index'])router.add('GET',path,async ctx=>{const data=await ctx.call('automation','newsroom',{});await page(ctx,'social-newsroom',{newsEntry:{...data.entry,image_url:data.entry.image_url || data.backdrop_url},mainClass:'full-width'});});
}
