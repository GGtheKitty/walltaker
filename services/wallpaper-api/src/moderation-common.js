import {CommandError} from './updates.js';
export const USER_FIELDS='id,username,email,details,created_at,updated_at,admin,set_count,viewing_link_id,mascot,pervert,quarantined,colour_preference,advanced,profile_id,flagged,is_reporter,is_cutie,is_supporter,username_changed_at,deleted_at,deleted_username,system_account';
export const fail=(status,message)=>{throw new CommandError(status,message);};
export const validId=v=>(typeof v==='string'||Number.isSafeInteger(v)) && /^\d{1,19}$/.test(String(v)) && BigInt(v)>0n && BigInt(v)<=9223372036854775807n;
export const same=(a,b)=>String(a)===String(b);
export const text=(v,max=255)=>typeof v==='string' && Array.from(v).length<=max && !v.includes('\0') ? v : fail(422,'Invalid or oversized text.');
export const bool=v=>[true,1,'1','true','on'].includes(v) ? true : [false,0,'0','false','off','',null,undefined].includes(v) ? false : fail(422,'Invalid boolean.');
export const page=v=>v==null ? 1 : /^[1-9]\d{0,5}$/.test(String(v)) && Number(v)<=100000 ? Number(v) : fail(422,'Invalid page.');
export const rows=async(c,sql,args=[]) => (await c.query(sql,args)).rows;
export const one=async(c,sql,args=[]) => (await rows(c,sql,args))[0];
export const system=u=>u.system_account || u.username==='evil' || u.deleted_username==='evil';
export async function user(c,id,lock=false) {
 if(!validId(id))fail(404,'User not found.');
 return await one(c,`SELECT ${USER_FIELDS} FROM users WHERE id=$1${lock?' FOR NO KEY UPDATE':''}`,[id]) || fail(404,'User not found.');
}
export async function actor(c,input,{admin=true,lizard=false,write=false}={}) {
 if(!validId(input.actor_id))fail(403,'Not authorized.');
 const u=await user(c,input.actor_id,write);if(u.deleted_at)fail(403,'Not authorized.');
 if(admin || lizard) {
  if(input.surrender_id!=null)fail(403,'Delegated sessions cannot use administration tools.');
  if(!u.admin && !(lizard && ['PornLizardKi','PornLizardWarren','PornLizardTaylor'].includes(u.username)))fail(403,'Administrator access required.');
  if(await one(c,`SELECT id FROM surrenders WHERE user_id=$1 AND pending IS NOT TRUE AND accepted_consequences=true AND expires_at>CURRENT_TIMESTAMP LIMIT 1`,[u.id]))fail(403,'This account is currently surrendered.');
 } else {
  const s=await one(c,`SELECT s.* FROM surrenders s JOIN friendships f ON f.id=s.friendship_id JOIN users controller ON controller.id=s.controller_user_id
   WHERE s.user_id=$1 AND s.pending IS NOT TRUE AND s.accepted_consequences=true AND s.expires_at>CURRENT_TIMESTAMP AND f.confirmed=true
   AND controller.deleted_at IS NULL AND $2=false AND ((f.sender_id=s.user_id AND f.receiver_id=s.controller_user_id) OR (f.receiver_id=s.user_id AND f.sender_id=s.controller_user_id)) ORDER BY s.id LIMIT 1`,[u.id,u.admin===true]);
  if(input.surrender_id!=null && (!s || !same(s.id,input.surrender_id) || !s.logged_in))fail(403,'The delegated session is no longer active.');
  if(s && input.surrender_id==null)fail(403,'This account is currently surrendered.');
 }
 return u;
}
