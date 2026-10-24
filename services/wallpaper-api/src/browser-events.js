import {CommandError} from './updates.js';
const eventTables={wallpaper:'node_wallpaper_events',reaction:'node_reaction_events',link:'node_link_events',account:'node_account_events',social:'node_social_events',tracker:'node_tracker_events',moderation:'node_moderation_events'};
const rows=async(c,sql,args=[]) => (await c.query(sql,args)).rows;
export async function browserEventSeeds(c,input) {
 const table=eventTables[input.kind];
 if(!table || !/^[1-9]\d{0,18}$/.test(String(input.event_id)))throw new CommandError(422,'Invalid render receipt.');
 const event=(await rows(c,`SELECT * FROM ${table} WHERE id=$1`,[input.event_id]))[0];
 if(!event)throw new CommandError(404,'Receipt not found.');
 const effects=event.effects || {},seeds={};
 const fetch=async(key,table,ids)=>{const list=[...new Set(ids.filter(v=>v!=null))];seeds[key]=list.length?await rows(c,`SELECT * FROM ${table} WHERE id=ANY($1::bigint[])`,[list]):[];};
 const userIds=[event.user_id,...(effects.users || []),...(effects.notifications || [])];
 if(['account','moderation'].includes(input.kind))seeds.links=userIds.length?await rows(c,'SELECT * FROM links WHERE user_id=ANY($1::bigint[]) ORDER BY id',[userIds]):[];
 else await fetch('links','links',[event.link_id]);
 await fetch('past_links','past_links',[event.past_link_id]);
 await fetch('comments','comments',[...(event.comment_ids || []),effects.comment_id]);
 await fetch('messages','messages',[effects.message_id]);
 await fetch('scoops','scoops',[effects.scoop_id]);
 await fetch('surrenders','surrenders',(effects.surrenders || []).map(s=>s.id));
 // Snapshot rows are needed for the final revocation broadcast after deletion.
 const revokedSurrenders=[];
 for(const snapshot of effects.surrenders || [])if(!seeds.surrenders.some(row=>String(row.id)===String(snapshot.id))) {
  revokedSurrenders.push(String(snapshot.id));
  seeds.surrenders.push({friendship_id:null,expires_at:null,pending:false,accepted_consequences:false,logged_in:false,current_page:null,duration_hours:null,token:null,created_at:null,updated_at:null,...snapshot});
 }
 const notificationUsers=[...new Set(effects.notifications || [])];
 await fetch('notifications','notifications',[event.notification_id]);
 if(notificationUsers.length)seeds.notifications.push(...await rows(c,`SELECT n.* FROM users u JOIN LATERAL(
  SELECT * FROM notifications WHERE user_id=u.id ORDER BY id DESC LIMIT 5) n ON true
  WHERE u.id=ANY($1::bigint[]) AND u.deleted_at IS NULL`,[notificationUsers]));
 // Browser role deliberately cannot SELECT email, API keys or password columns.
 seeds.users=userIds.length?await rows(c,`SELECT id FROM users WHERE id=ANY($1::bigint[])`,[userIds]):[];
 return {seeds,event,revokedSurrenders};
}
