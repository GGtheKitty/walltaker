import { browserEventSeeds } from './browser-events.js';
import { browserGraph } from './browser-graph.js';
import { BROWSER_USER_FIELDS,browserId } from './browser-sessions.js';
import { CommandError } from './updates.js';
const rows=async(c,sql,args=[]) => (await c.query(sql,args)).rows;
const one=async(c,sql,args=[]) => (await rows(c,sql,args))[0];
const fail=(status,message)=>{throw new CommandError(status,message);};
const visitFields='id,user_id,ip,visit_token,visitor_token,started_at';
const tables={users:'users',links:'links',profiles:'profiles',past_links:'past_links',comments:'comments',messages:'messages',threads:'message_threads',participants:'message_thread_participants',friendships:'friendships',leashes:'leashes',surrenders:'surrenders',kinks:'kinks',memberships:'kink_havers',icons:'user_icons',notifications:'notifications',visits:'ahoy_visits',bans:'banned_ips',reports:'reports',pledges:'nut_pledges',scoops:'scoops',orgasms:'nuttracker_orgasms',clients:'wallpaper_clients'};
const access=(alias='l',viewer='$2')=>`(${alias}.user_id=${viewer} OR EXISTS(SELECT 1 FROM leashes WHERE master_id=${viewer} AND pet_id=${alias}.user_id) OR
 ((${alias}.never_expires=true OR ${alias}.expires>CURRENT_TIMESTAMP) AND (${alias}.friends_only=false OR EXISTS(SELECT 1 FROM friendships f WHERE f.confirmed=true
  AND ((f.sender_id=${viewer} AND f.receiver_id=${alias}.user_id) OR(f.receiver_id=${viewer} AND f.sender_id=${alias}.user_id))))))`;

export function createBrowserData({pool,sessions,store,accounts}) {
 return async(operation,input={},cookie='')=>{
  const current=await sessions.resolve(cookie),actor=current.user,viewer=actor?.id || null;
  const c=await pool.connect();
  try {
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const seeds={};let result={};
   const user=async value=>{
    const row=await one(c,`SELECT ${BROWSER_USER_FIELDS} FROM users WHERE ${browserId(value)?'id':'username'}=$1 AND deleted_at IS NULL`,[value]);
    return row || fail(404,'User not found.');
   };
   const graph=async(internal=false)=>browserGraph(c,seeds,{store,viewerId:viewer,internal});
   if(operation==='context-data') {
    seeds.users=actor?[actor]:[];if(current.surrender)seeds.surrenders=[current.surrender];
    result.graph=await graph();
   } else if(operation==='user' || operation==='profile-page' || operation==='settings') {
    let target=operation==='settings'?(current.surrender?current.surrender.controller_user_id:viewer):input.user_id || input.username;
    if(operation==='settings' && !actor)fail(403,'Please log in.');
    let selected=await user(target);seeds.users=[selected];
    const self=actor && String(actor.id)===String(selected.id);
    if((self && input.private) || operation==='settings') {
     const privateData=await accounts('browser-private-user',{actor_id:actor.id,surrender_id:current.surrender?.id || null,target_id:selected.id});
     selected={...selected,...privateData.user};seeds.users=[selected];
    }
    result={user_id:selected.id,is_current_user:!!self};
    if(operation==='profile-page') {
     const friends=viewer && await one(c,'SELECT id FROM friendships WHERE confirmed=true AND ((sender_id=$1 AND receiver_id=$2) OR(sender_id=$2 AND receiver_id=$1))',[viewer,selected.id]);
     result.has_friendship=!!friends;
     seeds.links=await rows(c,`SELECT l.* FROM links l WHERE l.user_id=$1 AND ${access('l')} ORDER BY l.id LIMIT 500`,[selected.id,viewer]);
     result.link_ids=seeds.links.map(l=>l.id);
     const online=await store.onlineIds();
     const live=seeds.links.filter(l=>online.includes(String(l.id)) || l.last_ping && new Date(l.last_ping)>new Date(Date.now()-(l.last_ping_user_agent?.includes('widgetExtension')?1200000:60000)));
     result.any_links_online=live.length>0;result.most_recent_pinged_link_id=[...seeds.links].sort((a,b)=>new Date(b.last_ping || 0)-new Date(a.last_ping || 0))[0]?.id || null;
     seeds.past_links=await rows(c,'SELECT * FROM past_links WHERE user_id=$1 ORDER BY id DESC LIMIT 5',[selected.id]);result.past_link_ids=seeds.past_links.map(p=>p.id);
     if(self) {
      const profiles=await accounts('profiles-own',{actor_id:viewer});seeds.profiles=profiles.profiles;result.profile_ids=seeds.profiles.map(p=>p.id);
     }
    }
    result.graph=await graph();
   } else if(operation==='link') {
    const identifier=input.identifier;
    if(typeof identifier!=='string' && !Number.isSafeInteger(identifier))fail(404,'Link not found.');
    const link=await one(c,`SELECT l.* FROM links l JOIN users u ON u.id=l.user_id WHERE ${browserId(identifier)?'l.id':'l.custom_url'}=$1 AND u.deleted_at IS NULL AND ${access('l')}`,[identifier,viewer]);
    if(!link)fail(404,'This link is not available.');
    if(['edit','destroy','wizard'].includes(input.purpose) && String(link.user_id)!==String(viewer))fail(403,'Only the link owner can do that.');
    seeds.links=[link];result={link_id:link.id};
    result.has_friendship=!!(viewer && await one(c,'SELECT id FROM friendships WHERE confirmed=true AND ((sender_id=$1 AND receiver_id=$2) OR(sender_id=$2 AND receiver_id=$1))',[viewer,link.user_id]));
    result.graph=await graph();
   } else if(operation==='profiles' || operation==='profile-style' || operation==='profile-preview') {
    if(!actor)fail(403,'Please log in.');
    if(operation==='profiles') {
     const page=Number(input.page || 1);if(!Number.isSafeInteger(page)||page<1||page>100000)fail(422,'Invalid page.');
     const owner=input.user_id==null?null:await user(input.user_id);
     seeds.profiles=await rows(c,`SELECT p.* FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.public=true AND u.deleted_at IS NULL
      AND ($1::bigint IS NULL OR p.user_id=$1) ORDER BY p.id LIMIT 5 OFFSET $2`,[owner?.id || null,(page-1)*5]);
     result={profile_ids:seeds.profiles.map(p=>p.id),page,count:Number((await one(c,`SELECT count(*) FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.public=true AND u.deleted_at IS NULL AND ($1::bigint IS NULL OR p.user_id=$1)`,[owner?.id || null])).count),user_id:owner?.id || null};
     if(owner)seeds.users=[owner];
    } else {
     if(!browserId(input.profile_id))fail(404,'Profile not found.');
     const profile=await one(c,'SELECT p.* FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.public=true AND u.deleted_at IS NULL',[input.profile_id]);if(!profile)fail(404,'Profile not found.');
     seeds.profiles=[profile];result={profile_id:profile.id};
     if(operation==='profile-preview') {
      const base=await one(c,`SELECT ${BROWSER_USER_FIELDS} FROM users WHERE username='evil' AND deleted_at IS NULL`);
      seeds.users=base?[base]:[actor];result.preview_user_id=seeds.users[0].id;
      seeds.links=await rows(c,'SELECT l.* FROM links l JOIN users u ON u.id=l.user_id WHERE l.friends_only=false AND (l.never_expires=true OR l.expires>CURRENT_TIMESTAMP) AND u.deleted_at IS NULL ORDER BY l.id LIMIT 2');
      result.link_ids=seeds.links.map(l=>l.id);
      seeds.past_links=await rows(c,`SELECT p.* FROM past_links p JOIN links l ON l.id=p.link_id JOIN users u ON u.id=l.user_id WHERE l.friends_only=false AND (l.never_expires=true OR l.expires>CURRENT_TIMESTAMP) AND u.deleted_at IS NULL ORDER BY p.id DESC LIMIT 5`);
      result.past_link_ids=seeds.past_links.map(p=>p.id);
     }
    }
    result.graph=await graph();
   } else if(operation==='relationship') {
    if(!actor || ![input.first_id,input.second_id].some(id=>String(id)===String(viewer)))fail(403,'Not authorized.');
    const friendship=await one(c,'SELECT * FROM friendships WHERE ((sender_id=$1 AND receiver_id=$2) OR(sender_id=$2 AND receiver_id=$1)) AND ($3=false OR confirmed=true) ORDER BY id LIMIT 1',[input.first_id,input.second_id,input.confirmed!==false]);
    seeds.friendships=friendship?[friendship]:[];result={friendship_id:friendship?.id || null,graph:await graph()};
   } else if(operation==='event-data') {
    const bundle=await browserEventSeeds(c,input);Object.assign(seeds,bundle.seeds);
    result={graph:{...await graph(true),revoked_surrenders:bundle.revokedSurrenders}};
   } else if(operation==='hydrate') {
    let total=0;
    for(const [key,list] of Object.entries(input.ids || {})) {
     if(!Object.hasOwn(tables,key) || !Array.isArray(list) || list.some(id=>!browserId(id)) || list.length>2000)fail(422,'Invalid render graph request.');
     total+=list.length;if(total>5000)fail(422,'Render graph is too large.');
     seeds[key]=list.length?await rows(c,`SELECT ${key==='users'?BROWSER_USER_FIELDS:key==='visits'?visitFields:'*'} FROM ${tables[key]} WHERE id=ANY($1::bigint[])`,[list]):[];
    }
    result.graph=await graph(true);
   } else if(operation==='thread') {
    if(!actor || !browserId(input.thread_id))fail(403,'Please log in.');
    const thread=await one(c,'SELECT t.* FROM message_threads t WHERE t.id=$1 AND EXISTS(SELECT 1 FROM message_thread_participants p WHERE p.message_thread_id=t.id AND p.user_id=$2)',[input.thread_id,viewer]);
    if(!thread)fail(404,'Thread not found.');seeds.threads=[thread];result={thread_id:thread.id,graph:await graph()};
   } else if(operation==='site-clients')result={clients:await rows(c,"SELECT * FROM wallpaper_clients WHERE section='clients' ORDER BY position,id LIMIT 500")};
   else if(operation==='site')result={flags:current.flags,clients:(await graph()).clients};
   else if(operation==='decoration')result={emoji:(await one(c,'SELECT emoji FROM emoji_link_decorations WHERE link_id=$1',[input.link_id]))?.emoji || null};
   else fail(404,'Unknown browser data operation.');
   await c.query('COMMIT');return result;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 };
}
