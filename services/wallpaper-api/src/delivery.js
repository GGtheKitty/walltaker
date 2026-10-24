import{browserEventSeeds}from'./browser-events.js';
import{browserGraph}from'./browser-graph.js';
import{graphDocument,reference}from'./rendering/graph.js';
import{filterProfileDomains}from'./profile-domains.js';
const kinds=['wallpaper','reaction','link','account','social','tracker','moderation','automation'];
const tables=Object.fromEntries(kinds.map(kind=>[kind,'node_'+kind+'_events']));
export function createNativeDelivery({pool,browserPool,renderer,redis,queue,discovery,automation,moderation,accounts,sendReset,store,logger=console}) {
 const publish=(stream,html)=>redis.publish('__anycable__',JSON.stringify({stream,data:JSON.stringify(html)}));
 const turbo=(action,target,html='')=>`<turbo-stream action="${action}" target="${target}">${action==='remove'?'':`<template>${html}</template>`}</turbo-stream>`;
 const recordStream=(type,id)=>renderer.globalId({type,id});
 async function readGraph(kind,id){
  const c=await browserPool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const bundle=await browserEventSeeds(c,{kind,event_id:id});const graph=await browserGraph(c,bundle.seeds,{store,internal:true});graph.revoked_surrenders=bundle.revokedSurrenders;
   await c.query('COMMIT');return graph;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 const render=(graph,template,locals={},context={})=>renderer.render(graphDocument(graph,{template,partial:true,locals,context:{controller_path:template.split('/')[0],...context}}));
 async function change(graph,stream,action,target,template,locals={}){return publish(stream,turbo(action,target,template?await render(graph,template,locals):''));}
 const linkIds=graph=>new Set(graph.links.map(row=>String(row.id)));
 const activeUser=(graph,id)=>graph.users.find(user=>String(user.id)===String(id)&&!user.deleted_at);
 async function linkPage(graph,id){
  if(!linkIds(graph).has(String(id)))return;
  await change(graph,recordStream('Link',id),'update','link_'+id,'links/link',{link:reference('Link',id)});
  await change(graph,'link_preview_'+id+'_image','update','preview_image','links/embed_image',{link:reference('Link',id)});
  await change(graph,'link_preview_'+id+'_text','update','preview_text','links/embed_text',{link:reference('Link',id)});
 }
 async function viewers(graph,id){if(linkIds(graph).has(String(id)))await change(graph,'link_viewing_users_'+id,'replace','link_viewing_users_'+id,'links/viewing_users',{link:reference('Link',id)});}
 async function feed(kind){
  const result=await discovery(kind),ids={users:(result.graph?.users || []).map(row=>row.id),links:[...(result.links || []),...(result.graph?.viewed || [])].map(row=>row.id),past_links:(result.recent_posts || []).map(row=>row.id)};
  const c=await browserPool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const seeds={};
   if(ids.users.length)seeds.users=(await c.query('SELECT id FROM users WHERE id=ANY($1::bigint[])',[ids.users])).rows;
   if(ids.links.length)seeds.links=(await c.query('SELECT * FROM links WHERE id=ANY($1::bigint[])',[ids.links])).rows;
   if(ids.past_links.length)seeds.past_links=(await c.query('SELECT * FROM past_links WHERE id=ANY($1::bigint[])',[ids.past_links])).rows;
   if(kind==='viewers')seeds.users=[...(seeds.users || []),...(result.viewers || [])];
   const graph=await browserGraph(c,seeds,{store,internal:true});await c.query('COMMIT');
   if(kind==='recent')await change(graph,'dashboard_recent_posts','replace','recent_posts','dashboard/recent_posts',{recent_posts:(result.recent_posts || []).map(row=>reference('PastLink',row.id))});
   else await change(graph,'dashboard_users_viewing_links','replace','users_viewing_links','dashboard/users_viewing_links',{users_viewing_links:(result.viewers || []).map(row=>reference('User',row.id))});
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 async function notify(graph,id){if(!activeUser(graph,id))return;await change(graph,'header_notifications_'+id,'replace','header_notifications','application/notifications',{notifications:graph.notifications.filter(n=>String(n.user_id)===String(id)).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,5).map(n=>reference('Notification',n.id))});}
 async function removeLink(id){await redis.del('link:'+id+':ws_clients');await publish(recordStream('Link',id),turbo('remove','link_'+id));await queue.enqueue('link:'+id);for(const kind of ['image','text'])await publish('link_preview_'+id+'_'+kind,turbo('update','preview_'+kind));}
 async function surrender(graph,snapshot,revoked=false){await change(graph,recordStream('Surrender',snapshot.id),'replace','surrender_status','layouts/surrender',{surrender:reference('Surrender',snapshot.id),revoked:revoked || graph.revoked_surrenders.includes(String(snapshot.id))});}
 async function newsroom(c,event){
  const state=(await c.query('SELECT generation,rendered_event_id FROM node_newsroom_states WHERE id=1 FOR UPDATE')).rows[0];
  if(!state||String(state.generation)!==String(event.generation)||Number(state.rendered_event_id || 0)>=Number(event.id))return;
  for(const action of event.effects.actions || []){
   if(!['chyron','desk','news_backdrop'].includes(action.target))throw Error('Unknown newsroom target');
   if(action.remove)await publish(action.target,turbo('remove',action.target));
   else {
    const template=action.target==='chyron'?'application/chyron':action.target==='desk'?'news_room/desk':'news_room/backdrop';
    const locals=action.target==='chyron'?{message:action.message}:{news_entry:action.entry};
    await publish(action.target,turbo('update',action.target,await renderer.render({template,partial:true,locals,context:{}})));
   }
  }
  await c.query('UPDATE node_newsroom_states SET rendered_event_id=$1,updated_at=CURRENT_TIMESTAMP WHERE id=1',[event.id]);
 }
 async function scrub(c,event){
  const result=await moderation('domain-scrub-page',{event_id:event.id,after_id:event.effects.scrub_cursor});
  if(!result.profiles.length)return true;
  const {rules}=await moderation('domain-rules',{});
  for(const profile of result.profiles){const filtered=filterProfileDomains(profile.content,rules);if(!filtered.blocked_domains.length||filtered.content===profile.content)continue;
   const saved=await moderation('domain-scrub-save',{event_id:event.id,profile_id:profile.id,expected_content:profile.content,content:filtered.content});if(!saved.saved&&saved.exists)return false;
  }
  await c.query('UPDATE node_moderation_events SET effects=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[event.id,JSON.stringify({...event.effects,scrub_cursor:result.profiles.at(-1).id})]);return false;
 }
 async function effects(c,kind,event){
  if(kind==='automation'){await newsroom(c,event);return true;}
  if(kind==='moderation'&&event.effects.scrub&&!await scrub(c,event))return false;
  if(kind==='account'&&event.operation==='reset-request'){
   const {delivery}=await accounts('delivery-user',{event_id:event.id});if(delivery)await sendReset(delivery,event);return true;
  }
  const graph=await readGraph(kind,event.id),fx=event.effects || {};
  const updateUser=async id=>{const user=activeUser(graph,id);if(user)await queue.enqueue('user:'+user.username);};
  if(kind==='wallpaper'){
   const link=graph.links.find(row=>String(row.id)===String(event.link_id)),past=graph.past_links.find(row=>String(row.id)===String(event.past_link_id));
   if(link&&past){await linkPage(graph,link.id);await queue.enqueue('link:'+link.id);await updateUser(link.user_id);if(past.set_by_id)await updateUser(past.set_by_id);await change(graph,'link_details_'+link.id,'replace','link_details_'+link.id,'links/details',{link:reference('Link',link.id)});await feed('recent');await automation('wallpaper-news',{past_link_id:past.id,request_key:'news-wallpaper:'+past.id});}
  }else if(kind==='reaction'){
   if(linkIds(graph).has(String(event.link_id))){await linkPage(graph,event.link_id);await queue.enqueue('link:'+event.link_id);await updateUser(graph.links.find(l=>String(l.id)===String(event.link_id)).user_id);
    for(const comment of graph.comments.filter(row=>(event.comment_ids || []).map(String).includes(String(row.id))).sort((a,b)=>Number(a.id)-Number(b.id)))await change(graph,'link_comments_'+comment.link_id,'prepend','link_comments','comments/comment',{comment:reference('Comment',comment.id)});
    const notification=graph.notifications.find(n=>String(n.id)===String(event.notification_id));if(notification)await notify(graph,notification.user_id);
    if(event.history_changed){await change(graph,'link_details_'+event.link_id,'replace','link_details_'+event.link_id,'links/details',{link:reference('Link',event.link_id)});await feed('recent');}
   }
  }else if(kind==='link'){
   if(activeUser(graph,event.user_id)){if(event.operation==='destroy'){await removeLink(event.link_id);await feed('viewers');}else{await linkPage(graph,event.link_id);await queue.enqueue('link:'+event.link_id);}await feed('recent');await updateUser(event.user_id);}
  }else if(kind==='social'||kind==='tracker'){
   for(const id of new Set(fx.notifications || []))await notify(graph,id);
   if(kind==='social'){
    const comment=graph.comments.find(row=>String(row.id)===String(fx.comment_id));if(comment)await change(graph,'link_comments_'+comment.link_id,'prepend','link_comments','comments/comment',{comment:reference('Comment',comment.id)});
    const message=graph.messages.find(row=>String(row.id)===String(fx.message_id));if(message)for(const p of graph.participants.filter(p=>String(p.message_thread_id)===String(message.message_thread_id)&&activeUser(graph,p.user_id)))await change(graph,'social_thread_member_'+p.id+'_'+p.user_id,'prepend','message_thread_'+message.message_thread_id,'message_thread/single_message',{message:reference('Message',message.id)});
    for(const id of fx.users || [])await updateUser(id);
    for(const snapshot of fx.surrenders || [])await surrender(graph,snapshot);
    if(fx.scoop_id)await automation('scoop-news',{scoop_id:fx.scoop_id,request_key:'social-scoop:'+event.id});
   }
  }else if(kind==='account'){
   if(event.previous_username)await queue.enqueue('user:'+event.previous_username);await updateUser(event.user_id);
   if(['username','account-delete'].includes(event.operation)){
    await feed('recent');const viewer=graph.users.find(u=>String(u.id)===String(event.user_id));if(viewer?.viewing_link_id)await viewers(graph,viewer.viewing_link_id);await queue.enqueue('dashboard-viewers:all');
    for(const link of graph.links.filter(l=>String(l.user_id)===String(event.user_id))){if(activeUser(graph,event.user_id))await linkPage(graph,link.id);else await removeLink(link.id);await queue.enqueue('link:'+link.id);}
   }
   const notification=graph.notifications.find(n=>String(n.id)===String(event.notification_id));if(notification)await notify(graph,notification.user_id);
  }else if(kind==='moderation'){
   for(const name of new Set(fx.usernames || []))await queue.enqueue('user:'+name);
   for(const id of fx.deleted_links || [])await removeLink(id);
   for(const snapshot of fx.surrenders || [])await surrender(graph,snapshot,true);
   for(const id of fx.users || [])for(const link of graph.links.filter(l=>String(l.user_id)===String(id))){await linkPage(graph,link.id);await queue.enqueue('link:'+link.id);}
   if(fx.usernames?.length||fx.deleted_links?.length){await feed('recent');await queue.enqueue('dashboard-viewers:all');}
  }
  return true;
 }
 async function deliver(kind,id){
  if(!tables[kind]||!/^\d{1,19}$/.test(String(id)))throw Error('Invalid delivery receipt');
  const c=await pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'");
   const event=(await c.query(`SELECT * FROM ${tables[kind]} WHERE id=$1 AND delivered_at IS NULL FOR UPDATE SKIP LOCKED`,[id])).rows[0];
   if(!event){await c.query('COMMIT');return {delivered:false};}
   const done=await effects(c,kind,event);if(done)await c.query(`UPDATE ${tables[kind]} SET delivered_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[id]);
   await c.query('COMMIT');return {delivered:done};
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 return {deliver,feed,async renderRealtime(kind,id){
  if(kind==='dashboard-viewers')return feed('viewers');
  const c=await browserPool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const seeds={links:(await c.query('SELECT * FROM links WHERE id=$1',[id])).rows};const graph=await browserGraph(c,seeds,{store,internal:true});await c.query('COMMIT');if(kind==='link')return linkPage(graph,id);if(kind==='viewers')return viewers(graph,id);throw Error('Invalid realtime render kind');}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 },start({interval=1000}={}){
  let running,stopped=false;
  const drain=async()=>{for(const kind of kinds){if(stopped)return;const pending=(await pool.query(`SELECT id FROM ${tables[kind]} WHERE delivered_at IS NULL AND available_at<=CURRENT_TIMESTAMP ORDER BY id LIMIT 10`)).rows;
   for(const event of pending){if(stopped)return;try{await deliver(kind,event.id);}catch(error){logger.warn(`Native ${kind} delivery failed: ${error.code || error.name}${error.template?' in '+error.template:''}`);await pool.query(`UPDATE ${tables[kind]} SET delivery_attempts=delivery_attempts+1,available_at=CURRENT_TIMESTAMP+LEAST(300,POWER(2,LEAST(delivery_attempts,8)))*INTERVAL '1 second',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND delivered_at IS NULL`,[event.id]);}}
  }};
  const timer=setInterval(()=>{if(running||stopped)return;running=drain().catch(error=>logger.warn('Native delivery queue: '+(error.code || error.name))).finally(()=>{running=null;});},interval);timer.unref();
  return async()=>{stopped=true;clearInterval(timer);await running;};
 }};
}
