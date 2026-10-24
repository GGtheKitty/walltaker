import{encodeValue}from'./values.js';
const models={users:'User',links:'Link',profiles:'Profile',past_links:'PastLink',comments:'Comment',messages:'Message',threads:'MessageThread',participants:'MessageThreadParticipant',friendships:'Friendship',leashes:'Leash',surrenders:'Surrender',kinks:'Kink',memberships:'KinkHaver',icons:'UserIcon',notifications:'Notification',clients:'WallpaperClient',visits:'Ahoy::Visit',bans:'BannedIp',reports:'Report',pledges:'NutPledge',scoops:'Scoop',orgasms:'Nuttracker::Orgasm',abilities:'LinkAbility'};
export const reference=(type,id)=>id==null?null:{$ref:type+':'+id};
export function graphDocument(graph,options={}){
 const records={},rows={};
 const encodeAttrs=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value!=null&&(value instanceof Date||typeof value==='string'&&(/_at$/.test(key)||['expires','failed_on'].includes(key))&&!Number.isNaN(Date.parse(value)))?{$time:new Date(value).toISOString()}:encodeValue(value)]));
 for(const [key,type]of Object.entries(models)){rows[key]=graph[key] || [];for(const row of rows[key]){
  const attrs={...row};if(type==='Link'&&typeof attrs.response_type==='number')attrs.response_type=['horny','came','disgust','ok'][attrs.response_type];
  if(type==='Notification'&&typeof attrs.notification_type==='number')attrs.notification_type=['friend_request_sent','friend_request_received','friend_request_they_accepted','post_response','added_to_message_thread','new_message','orgasm_credited_to_you','comment_on_your_link','surrender_event','leash'][attrs.notification_type];
  if(type==='User'&&typeof attrs.colour_preference==='number')attrs.colour_preference=['auto','light','dark'][attrs.colour_preference];
  if(type==='ProfileDomain'&&typeof attrs.status==='number')attrs.status=['pending','approved','blocked'][attrs.status];
  delete attrs.password_digest;delete attrs.password_reset_token;
  records[type+':'+row.id]={type,attributes:encodeAttrs(attrs),associations:{},meta:{new_record:false,graph:true}};
 }}
 const ref=(key,id)=>records[models[key]+':'+id]?reference(models[key],id):null;
 const list=(key,field,id)=>(rows[key] || []).filter(row=>String(row[field])===String(id)).map(row=>ref(key,row.id));
 const attach=(key,row,associations,meta={})=>{const item=records[models[key]+':'+row.id];Object.assign(item.associations,associations);Object.assign(item.meta,meta);};
 for(const row of rows.users){
  const owned=(rows.leashes || []).filter(edge=>String(edge.pet_id)===String(row.id)),held=(rows.leashes || []).filter(edge=>String(edge.master_id)===String(row.id));
  const membership=(rows.memberships || []).filter(edge=>String(edge.user_id)===String(row.id));
  const surrender=rows.surrenders.find(s=>String(s.user_id)===String(row.id)&&s.expires_at&&new Date(s.expires_at)>new Date());
  const currentPledge=rows.pledges.find(p=>String(p.user_id)===String(row.id)&&p.year===new Date().getUTCFullYear());
  attach('users',row,{profile:ref('profiles',row.profile_id),profiles:list('profiles','user_id',row.id),link:list('links','user_id',row.id),past_links:list('past_links','set_by_id',row.id),kinks:membership.map(h=>ref('kinks',h.kink_id)),kink_havers:membership.map(h=>ref('memberships',h.id)),obeying_leashes:owned.map(l=>ref('leashes',l.id)),held_leashes:held.map(l=>ref('leashes',l.id)),masters:owned.map(l=>ref('users',l.master_id)),pets:held.map(l=>ref('users',l.pet_id)),viewing_link:ref('links',row.viewing_link_id),user_icon:ref('icons',rows.icons.find(i=>String(i.user_id)===String(row.id))?.id),current_surrender:ref('surrenders',surrender?.id),current_nut_pledge:ref('pledges',currentPledge?.id)});
 }
 for(const row of rows.links)attach('links',row,{user:ref('users',row.user_id),set_by:ref('users',row.set_by_id),forked_from:ref('links',row.forked_from_id),abilities:list('abilities','link_id',row.id),past_links:list('past_links','link_id',row.id),viewing_users:list('users','viewing_link_id',row.id),comments:list('comments','link_id',row.id)},{connected:(graph.connected || []).map(String).includes(String(row.id)),fork_count:(graph.fork_counts || []).find(p=>String(p.link_id)===String(row.id))?.count || 0});
 for(const row of rows.past_links)attach('past_links',row,{user:ref('users',row.user_id),set_by:ref('users',row.set_by_id),link:ref('links',row.link_id)});
 for(const row of rows.comments)attach('comments',row,{user:ref('users',row.user_id),link:ref('links',row.link_id)});
 for(const row of rows.messages)attach('messages',row,{from_user:ref('users',row.from_user_id),message_thread:ref('threads',row.message_thread_id)});
 for(const row of rows.threads)attach('threads',row,{participants:list('participants','message_thread_id',row.id),messages:list('messages','message_thread_id',row.id),users:rows.participants.filter(p=>String(p.message_thread_id)===String(row.id)).map(p=>ref('users',p.user_id))});
 for(const row of rows.participants)attach('participants',row,{user:ref('users',row.user_id),message_thread:ref('threads',row.message_thread_id)});
 for(const row of rows.friendships)attach('friendships',row,{sender:ref('users',row.sender_id),receiver:ref('users',row.receiver_id),surrenders:list('surrenders','friendship_id',row.id)});
 for(const row of rows.leashes)attach('leashes',row,{master:ref('users',row.master_id),pet:ref('users',row.pet_id),friendship:ref('friendships',row.friendship_id)});
 for(const row of rows.surrenders)attach('surrenders',row,{user:ref('users',row.user_id),controller_user:ref('users',row.controller_user_id),friendship:ref('friendships',row.friendship_id)},{valid:(graph.surrender_valid || []).map(String).includes(String(row.id))});
 for(const row of rows.kinks)attach('kinks',row,{kink_havers:list('memberships','kink_id',row.id),users:rows.memberships.filter(h=>String(h.kink_id)===String(row.id)).map(h=>ref('users',h.user_id))});
 for(const row of rows.profiles)attach('profiles',row,{user:ref('users',row.user_id),origin:ref('profiles',row.origin_id)},{number_of_users:(graph.profile_usage || []).find(p=>String(p.id)===String(row.id))?.count || 0});
 for(const row of rows.notifications)attach('notifications',row,{user:ref('users',row.user_id)});
 for(const row of rows.scoops)attach('scoops',row,{user:ref('users',row.user_id),link:ref('links',row.link_id)});
 for(const row of rows.pledges)attach('pledges',row,{user:ref('users',row.user_id),past_link:ref('past_links',row.past_link_id)});
 return {...options,records,context:{clients:rows.clients.map(c=>ref('clients',c.id)),decorations:Object.fromEntries((graph.decorations || []).map(row=>[row.link_id,row.emoji])),...options.context}};
}
