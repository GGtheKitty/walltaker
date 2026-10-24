import {rows,one,fail,system,user} from './moderation-common.js';

export async function removeLinks(c,ids) {
 if(!ids.length)return;
 await c.query('UPDATE users SET viewing_link_id=NULL WHERE viewing_link_id=ANY($1::bigint[])',[ids]);
 await c.query('UPDATE links SET forked_from_id=NULL WHERE forked_from_id=ANY($1::bigint[])',[ids]);
 await c.query('UPDATE scoops SET link_id=NULL WHERE link_id=ANY($1::bigint[])',[ids]);
 // Wallpaper history survives deleting a link. The FK also performs this nullification.
 await c.query('UPDATE past_links SET link_id=NULL WHERE link_id=ANY($1::bigint[])',[ids]);
 for(const table of ['history_events','comments','link_abilities','emoji_link_decorations'])await c.query(`DELETE FROM ${table} WHERE link_id=ANY($1::bigint[])`,[ids]);
 await c.query('DELETE FROM links WHERE id=ANY($1::bigint[])',[ids]);
}

export async function purgeUser(c,id,effects) {
 const u=await user(c,id,true);
 if(!u.deleted_at)fail(422,'Only deleted accounts can be purged.');
 if(system(u))fail(422,'System accounts cannot be purged.');
 const links=await rows(c,'SELECT id FROM links WHERE user_id=$1 ORDER BY id FOR UPDATE',[id]);const linkIds=links.map(l=>l.id);
 const profiles=(await rows(c,'SELECT id FROM profiles WHERE user_id=$1',[id])).map(p=>p.id);
 const pastLinks=(await rows(c,'SELECT id FROM past_links WHERE user_id=$1',[id])).map(p=>p.id);
 const friendships=(await rows(c,'SELECT id FROM friendships WHERE sender_id=$1 OR receiver_id=$1',[id])).map(f=>f.id);
 effects.usernames.push(u.username);effects.deleted_links.push(...linkIds);
 const neighbours=await rows(c,'SELECT id,username FROM users WHERE id IN (SELECT sender_id FROM friendships WHERE id=ANY($1::bigint[]) UNION SELECT receiver_id FROM friendships WHERE id=ANY($1::bigint[])) AND deleted_at IS NULL',[friendships]);
 effects.usernames.push(...neighbours.map(n=>n.username));
 await c.query('UPDATE banned_ips SET banned_by_id=NULL WHERE banned_by_id=$1',[id]);
 await c.query('UPDATE history_events SET surrender_controller_id=NULL WHERE surrender_controller_id=$1',[id]);
 await c.query('UPDATE links SET set_by_id=NULL WHERE set_by_id=$1',[id]);
 await c.query('UPDATE nuttracker_orgasms SET caused_by_user_id=NULL WHERE caused_by_user_id=$1',[id]);
 await c.query('UPDATE past_links SET set_by_id=NULL WHERE set_by_id=$1',[id]);
 await c.query('UPDATE users SET profile_id=NULL WHERE profile_id=ANY($1::bigint[])',[profiles]);
 await c.query('UPDATE profiles SET origin_id=NULL WHERE origin_id=ANY($1::bigint[])',[profiles]);
 await c.query('UPDATE nut_pledges SET past_link_id=NULL WHERE past_link_id=ANY($1::bigint[])',[pastLinks]);
 const revoked=await rows(c,'DELETE FROM surrenders WHERE user_id=$1 OR controller_user_id=$1 OR friendship_id=ANY($2::bigint[]) RETURNING id,user_id,controller_user_id',[id,friendships]);effects.surrenders.push(...revoked);
 await c.query('DELETE FROM leashes WHERE pet_id=$1 OR master_id=$1 OR friendship_id=ANY($2::bigint[])',[id,friendships]);
 await c.query('DELETE FROM friendships WHERE id=ANY($1::bigint[])',[friendships]);
 await c.query('DELETE FROM messages WHERE from_user_id=$1',[id]);
 await c.query('DELETE FROM message_thread_participants WHERE user_id=$1',[id]);
 await c.query('DELETE FROM comments WHERE user_id=$1',[id]);
 await c.query("DELETE FROM reports WHERE reporter_id=$1 OR (reportable_type='User' AND reportable_id=$1) OR (reportable_type='Link' AND reportable_id=ANY($2::bigint[]))",[id,linkIds]);
 for(const table of ['notifications','kink_havers','nut_pledges','nuttracker_orgasms','scoops','user_icons'])await c.query(`DELETE FROM ${table} WHERE user_id=$1`,[id]);
 // Surveys add FK dependencies absent from the old purge implementation.
 await c.query(`DELETE FROM survey_response_answers WHERE survey_response_id IN
  (SELECT id FROM survey_responses WHERE user_id=$1 OR survey_id IN (SELECT id FROM surveys WHERE user_id=$1))
  OR form_element_id IN (SELECT id FROM form_elements WHERE survey_id IN (SELECT id FROM surveys WHERE user_id=$1))`,[id]);
 await c.query('DELETE FROM survey_responses WHERE user_id=$1 OR survey_id IN (SELECT id FROM surveys WHERE user_id=$1)',[id]);
 await c.query('DELETE FROM form_elements WHERE survey_id IN (SELECT id FROM surveys WHERE user_id=$1)',[id]);
 await c.query('DELETE FROM surveys WHERE user_id=$1',[id]);
 for(const table of ['ahoy_events','ahoy_visits'])await c.query(`UPDATE ${table} SET user_id=NULL WHERE user_id=$1`,[id]);
 await removeLinks(c,linkIds);
 await c.query('DELETE FROM past_links WHERE user_id=$1',[id]);
 await c.query('DELETE FROM profiles WHERE user_id=$1',[id]);
 await c.query('DELETE FROM history_events WHERE user_id=$1',[id]);
 // Remove stored presentation snapshots belonging to the purged account.
 await c.query('DELETE FROM node_account_events WHERE user_id=$1',[id]);
 if((await one(c,"SELECT to_regclass('public.node_activity_receipts') AS name")).name)await c.query('DELETE FROM node_activity_receipts WHERE user_id=$1',[id]);
 await c.query('DELETE FROM node_tracker_events WHERE user_id=$1',[id]);
 await c.query('DELETE FROM node_social_events WHERE user_id=$1',[id]);
 await c.query('DELETE FROM node_link_events WHERE user_id=$1',[id]);
 await c.query('DELETE FROM node_wallpaper_events WHERE link_id=ANY($1::bigint[])',[linkIds]);
 await c.query('DELETE FROM node_reaction_events WHERE link_id=ANY($1::bigint[])',[linkIds]);
 if((await one(c,"SELECT to_regclass('public.node_browser_sessions') AS name")).name) {
  await c.query('UPDATE node_browser_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 OR original_actor_id=$1',[id]);
  await c.query('UPDATE node_browser_legacy_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1',[id]);
 }
 await c.query('DELETE FROM users WHERE id=$1',[id]);
 return {user_id:u.id,purged:true};
}
