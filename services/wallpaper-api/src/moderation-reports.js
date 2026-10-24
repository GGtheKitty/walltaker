import {rows,one,user,validId,same,fail,text,USER_FIELDS} from './moderation-common.js';
export async function reportTarget(c,input,viewer) {
 if(!['User','Link'].includes(input.reportable_type) || !validId(input.reportable_id))fail(404,'Report target not found.');
 if(input.reportable_type==='User') {
  const u=await user(c,input.reportable_id);if(u.deleted_at)fail(404,'Report target not found.');
  return {id:u.id,username:u.username};
 }
 const l=await one(c,`SELECT l.* FROM links l JOIN users u ON u.id=l.user_id WHERE l.id=$1 AND u.deleted_at IS NULL`,[input.reportable_id]);
 if(!l)fail(404,'Report target not found.');
 if(!viewer.admin && !same(l.user_id,viewer.id)) {
  if(!l.never_expires && (!l.expires || new Date(l.expires)<=new Date()))fail(403,'This link has expired.');
  if(l.friends_only && !await one(c,`SELECT id FROM friendships WHERE confirmed=true AND
   ((sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)) LIMIT 1`,[viewer.id,l.user_id]))fail(403,'This link is for friends only.');
 }
 return l;
}
async function linkSnapshot(c,l) {
 const u=await one(c,'SELECT username FROM users WHERE id=$1',[l.user_id]);const setter=l.set_by_id ? await one(c,'SELECT username FROM users WHERE id=$1',[l.set_by_id]) : null;
 return `#${l.id}\nCreator: ${u?.username||'Deleted user'}\n${l.terms||''}\n\nTheme: ${l.theme||''}\nBlacklist: ${l.blacklist||''}\nPost URL: ${l.post_url||''}\nSet By: ${setter?.username||'anon or no one'}\nResponse Text: ${l.response_text||''}`;
}
export async function reportSnapshot(c,type,target) {
 if(type==='Link')return (await linkSnapshot(c,target)).slice(0,100000);
 const u=await user(c,target.id);const p=await one(c,`SELECT content FROM profiles WHERE user_id=$1 ORDER BY (id=$2) DESC,id LIMIT 1`,[u.id,u.profile_id]);
 const messages=await rows(c,`SELECT m.content FROM messages m WHERE EXISTS(SELECT 1 FROM message_thread_participants p WHERE p.user_id=$1 AND p.message_thread_id=m.message_thread_id) ORDER BY m.id DESC LIMIT 6`,[u.id]);
 const posts=await rows(c,'SELECT link_id,post_url FROM past_links WHERE set_by_id=$1 ORDER BY id DESC LIMIT 6',[u.id]);
 const links=await rows(c,'SELECT * FROM links WHERE user_id=$1 ORDER BY id LIMIT 50',[u.id]);
 const snapshots=[];for(const l of links)snapshots.push(await linkSnapshot(c,l));
 return `${u.username}\n${(p?.content||u.details||'').slice(0,50000)}\n\nRecent messages:\n${messages.map(m=>'=> '+m.content).join('\n')}\n\nRecent wallpapers set for others:\n${posts.map(p=>`=> (on #${p.link_id||'deleted'}) ${p.post_url||''}`).join('\n')}\n\nAll links:\n\n======= LINK ========\n${snapshots.join('\n\n======= LINK ========\n')}`.slice(0,100000);
}
export async function reportDocuments(c,reports) {
 const ids=new Set(reports.map(r=>r.reporter_id));
 const targetLinks=await rows(c,"SELECT * FROM links WHERE id=ANY($1::bigint[])",[reports.filter(r=>r.reportable_type==='Link').map(r=>r.reportable_id)]);
 for(const l of targetLinks)ids.add(l.user_id);
 for(const r of reports)if(r.reportable_type==='User')ids.add(r.reportable_id);
 return {reports,links:targetLinks,users:await rows(c,`SELECT ${USER_FIELDS} FROM users WHERE id=ANY($1::bigint[])`,[[...ids]])};
}
export async function createReport(c,input,viewer) {
 const target=await reportTarget(c,input,viewer);
 const reason=text(input.reason??'',10000);
 const snapshot=await reportSnapshot(c,input.reportable_type,target);
 const report=await one(c,`INSERT INTO reports(reporter_id,reportable_type,reportable_id,reason,snapshot,is_closed,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,[viewer.id,input.reportable_type,target.id,reason,snapshot]);
 return {report_id:report.id};
}
