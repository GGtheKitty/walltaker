import { CommandError } from './updates.js';
export const rows=async(c,sql,args=[]) => (await c.query(sql,args)).rows;
export const one=async(c,sql,args=[]) => (await rows(c,sql,args))[0];
export const fail=(status,message)=>{throw new CommandError(status,message);};
export const validId=value=>(typeof value==='string'||Number.isSafeInteger(value)) && /^[1-9]\d{0,18}$/.test(String(value)) && BigInt(value)<=9223372036854775807n;
export const token=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,255}$/.test(value) ? value : fail(422,'Invalid analytics token.');
export const same=(a,b)=>String(a)===String(b);

export async function activityActor(c,input,{admin=false,lock=false}={}) {
 if(!validId(input.actor_id))fail(403,'Please log in.');
 const user=await one(c,`SELECT id,username,admin,deleted_at FROM users WHERE id=$1 AND deleted_at IS NULL${lock?' FOR SHARE':''}`,[input.actor_id]);
 if(!user)fail(403,'Please log in.');
 const active=await one(c,`SELECT s.id,s.controller_user_id,s.logged_in FROM surrenders s JOIN friendships f ON f.id=s.friendship_id
  JOIN users controller ON controller.id=s.controller_user_id WHERE s.user_id=$1 AND s.pending IS NOT TRUE
  AND s.accepted_consequences=true AND s.expires_at>CURRENT_TIMESTAMP AND f.confirmed=true AND controller.deleted_at IS NULL AND $2=false
  AND ((f.sender_id=s.user_id AND f.receiver_id=s.controller_user_id) OR (f.receiver_id=s.user_id AND f.sender_id=s.controller_user_id)) ORDER BY s.id LIMIT 1`,[user.id,user.admin===true]);
 if(admin) {
  if(!user.admin || input.surrender_id!=null || await one(c,`SELECT id FROM surrenders WHERE user_id=$1 AND pending IS NOT TRUE AND accepted_consequences=true AND expires_at>CURRENT_TIMESTAMP LIMIT 1`,[user.id]))fail(403,'Administrator access required.');
 } else {
  if(input.surrender_id!=null && (!active || !same(active.id,input.surrender_id) || !active.logged_in))fail(403,'The delegated session is no longer active.');
  if(active && input.surrender_id==null)fail(403,'This account is currently surrendered.');
 }
 return {user,controllerId:input.surrender_id!=null ? active.controller_user_id : null};
}

export const visibleHistoryLink = (link,actorId) => `(${link}.user_id=${actorId} OR EXISTS(
 SELECT 1 FROM leashes leash WHERE leash.master_id=${actorId} AND leash.pet_id=${link}.user_id) OR
 ((${link}.never_expires=true OR ${link}.expires>CURRENT_TIMESTAMP) AND (${link}.friends_only=false OR EXISTS(
  SELECT 1 FROM friendships f WHERE f.confirmed=true AND ((f.sender_id=${actorId} AND f.receiver_id=${link}.user_id)
   OR (f.receiver_id=${actorId} AND f.sender_id=${link}.user_id))))))`;

export async function verifiedVisit(c,proof) {
 if(proof==null)return null;
 if(!validId(proof.id))fail(422,'Invalid visit.');
 const visit=await one(c,'SELECT id FROM ahoy_visits WHERE id=$1 AND visit_token=$2 AND visitor_token=$3',[proof.id,token(proof.visit_token),token(proof.visitor_token)]);
 if(!visit)fail(403,'Visit proof does not match.');
 return visit.id;
}

export async function writeActivityRecord(c,input,{kind,linkId,actor:providedActor}={}) {
 const {user,controllerId}=providedActor || await activityActor(c,input,{lock:true});
 const kinds={looked_at:0,set_wallpaper:1,commented_on:2};
 if(!Object.hasOwn(kinds,kind) || !validId(linkId))fail(422,'Invalid activity record.');
 const link=await one(c,`SELECT l.id FROM links l JOIN users owner ON owner.id=l.user_id WHERE l.id=$1 AND owner.deleted_at IS NULL
  AND ${visibleHistoryLink('l','$2')}`,[linkId,user.id]);
 if(!link)fail(404,'This wallpaper is no longer available.');
 const visitId=await verifiedVisit(c,input.visit);
 return one(c,`INSERT INTO history_events(user_id,link_id,did_what,surrender_controller_id,ahoy_visit_id,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,[user.id,link.id,kinds[kind],controllerId,visitId]);
}
