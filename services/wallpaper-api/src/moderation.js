import {createHmac,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {USER_FIELDS,rows,one,fail,validId,same,text,bool,page,user,actor,system} from './moderation-common.js';
import {domainService} from './moderation-domains.js';
import {purgeUser,removeLinks} from './moderation-purge.js';
import {reportTarget,reportSnapshot,reportDocuments,createReport} from './moderation-reports.js';
import {systemMetrics,activityMetrics} from './moderation-metrics.js';
import {botAdministration,changeBot} from './bot-settings.js';

const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const READS=new Set(['admin-session','dashboard','invites','emoji-links','user-icons','clients','domains','system','activity','user','deleted-users','quarantine','events','reports','report','report-target','lizard-browse','lizard-index','bots']);
const WRITES=new Set(['setting-toggle','invite-create','invite-delete','emoji-create','emoji-update','emoji-delete','icon-create','icon-update','icon-delete','client-create','client-update','client-delete','client-move','domain-update','user-update','user-restore','user-purge','user-assume','user-quarantine','user-ipban','event-ipban','password-reset','report-create','report-close','link-delete','bot-update','bot-start','bot-stop']);
const DOMAIN_SERVICE=new Set(['domain-rules','domain-seen','domain-scrub-page','domain-scrub-save']);
const icon=v=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text(v))?v:fail(422,'Icon must be a valid Ionicon name.');
const escapedLike=v=>v.replace(/[\\%_]/g,'\\$&');
const settings=async c=>Object.fromEntries((await rows(c,"SELECT key,value FROM site_settings WHERE key IN ('nnn_enabled','invite_only')")).map(r=>[r.key,r.value!=null&&r.value!==''&&!['0','f','false','off'].includes(r.value.toLowerCase())]));

export function createModeration({pool,store,redis,secretKeyBase,baseUrl,pornbotInterval=600}) {
 async function paginated(c,from,args=[],order='id',rawPage,per=100,select='*') {
  const count=Number((await one(c,'SELECT count(*) '+from,args)).count),requested=page(rawPage);
  const p=Math.min(requested,Math.max(1,Math.ceil(count/per)));
  const data=await rows(c,`SELECT ${select} ${from} ORDER BY ${order} LIMIT ${per} OFFSET $${args.length+1}`,[...args,(p-1)*per]);
  return {records:data,count,page:p,per};
 }
 async function userDocument(c,u) {
  const profile=await one(c,`SELECT * FROM profiles WHERE user_id=$1 ORDER BY (id=$2) DESC NULLS LAST,id LIMIT 1`,[u.id,u.profile_id]);
  return {user:u,profile:profile||null};
 }
 async function graph(c,visits) {
  const bans=await rows(c,'SELECT * FROM banned_ips WHERE ip_address=ANY($1::text[]) ORDER BY id',[visits.map(v=>v.ip).filter(Boolean)]);
  return {visits,bans,moderators:await rows(c,`SELECT id,username FROM users WHERE id=ANY($1::bigint[])`,[[...new Set(bans.map(b=>b.banned_by_id).filter(Boolean))]])};
 }
 async function read(c,op,input,u) {
  if(op==='admin-session')return {};
  if(op==='bots')return botAdministration(c,pornbotInterval);
  if(op==='dashboard')return {open_reports:Number((await one(c,'SELECT count(*) FROM reports WHERE is_closed=false')).count),pending_domains:Number((await one(c,'SELECT count(*) FROM profile_domains WHERE status=0')).count),settings:await settings(c)};
  if(op==='invites') {
   const list=await paginated(c,'FROM invite_codes',[],'redeemed_at IS NOT NULL,created_at DESC,id DESC',input.page);
   const ids=list.records.flatMap(r=>[r.generated_by_id,r.redeemed_by_id]).filter(Boolean);
   return {invites:list,users:await rows(c,'SELECT id,username FROM users WHERE id=ANY($1::bigint[])',[ids]),settings:await settings(c)};
  }
  if(op==='emoji-links')return {decorations:await paginated(c,'FROM emoji_link_decorations',[],'link_id,id',input.page)};
  if(op==='user-icons') {
   const list=await paginated(c,'FROM user_icons WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NULL)',[],'(SELECT username FROM users WHERE id=user_icons.user_id),id',input.page);
   return {icons:list,users:await rows(c,'SELECT id,username FROM users WHERE id=ANY($1::bigint[])',[list.records.map(r=>r.user_id)])};
  }
  if(op==='clients')return {clients:await paginated(c,'FROM wallpaper_clients',[],'position,id',input.page)};
  if(op==='domains') {
   const result={};for(const [name,status] of [['pending',0],['approved',1],['blocked',2]])result[name]=await paginated(c,'FROM profile_domains WHERE status=$1',[status],status===0?'last_seen_at DESC,id DESC':'domain,id',input[name+'_page'],25);
   result.users=await rows(c,'SELECT id,username FROM users WHERE id=ANY($1::bigint[])',[Object.values(result).flatMap(p=>p.records.map(r=>r.reviewed_by_id)).filter(Boolean)]);return result;
  }
  if(op==='user') {
   let record;
   if(input.user_id!=null)record=await user(c,input.user_id);
   else {
    const q=text(input.query??'').trim().toLowerCase();if(!q)return {user:null,profile:null};
    record=await one(c,`SELECT ${USER_FIELDS} FROM users WHERE lower(email)=$1 OR lower(username)=$1 OR lower(deleted_username)=$1
     ORDER BY id LIMIT 1`,[q]);
    if(!record)record=await one(c,`SELECT ${USER_FIELDS} FROM users WHERE lower(email) LIKE $1 OR lower(username) LIKE $1 OR lower(deleted_username) LIKE $1 ORDER BY username,id LIMIT 1`,['%'+escapedLike(q)+'%']);
   }
   return record?userDocument(c,record):{user:null,profile:null};
  }
  if(op==='deleted-users') {
   const list=await paginated(c,'FROM users WHERE deleted_at IS NOT NULL',[],'deleted_at DESC,id DESC',input.page,100,USER_FIELDS);
   list.records=list.records.map(record=>Object.fromEntries(USER_FIELDS.split(',').map(k=>[k,record[k]])));
   return {users:list};
  }
  if(op==='quarantine') {
   const users=await rows(c,`SELECT ${USER_FIELDS} FROM users WHERE admin IS NOT TRUE ORDER BY id DESC LIMIT 100`);
   const ids=users.map(u=>u.id);
   const sets=await rows(c,`SELECT set_by_id AS user_id,count(*)::integer AS sets,min(created_at) AS first,max(created_at) AS last FROM past_links WHERE set_by_id=ANY($1::bigint[]) AND created_at>CURRENT_TIMESTAMP-INTERVAL '3 days' GROUP BY set_by_id`,[ids]);
   const totals=await rows(c,`SELECT user_id,count(*)::integer AS visits FROM ahoy_visits WHERE user_id=ANY($1::bigint[]) AND started_at>CURRENT_TIMESTAMP-INTERVAL '3 days' GROUP BY user_id`,[ids]);
   const visits=await rows(c,`SELECT v.* FROM unnest($1::bigint[]) selected(user_id) JOIN LATERAL
    (SELECT id,user_id,ip,user_agent,started_at FROM ahoy_visits WHERE user_id=selected.user_id AND started_at>CURRENT_TIMESTAMP-INTERVAL '3 days' ORDER BY started_at DESC,id DESC LIMIT 25) v ON true`,[ids]);
   const stats=Object.fromEntries(users.map(u=>[u.id,{sets:0,first:null,last:null,...sets.find(s=>same(s.user_id,u.id)),visits:totals.find(v=>same(v.user_id,u.id))?.visits??0}]));
   return {users,stats,...await graph(c,visits)};
  }
  if(op==='events') {
   const events=await rows(c,"SELECT * FROM ahoy_events WHERE name='regular:update_link_post' OR name LIKE 'nefarious:%' ORDER BY id DESC LIMIT 100");
   for(const event of events) {
    try {const data=JSON.parse(event.properties||'{}');event.properties=JSON.stringify(data && typeof data==='object' && !Array.isArray(data)?data:{});}catch {event.properties='{}';}
   }
   const visits=await rows(c,'SELECT id,user_id,ip,user_agent,started_at FROM ahoy_visits WHERE id=ANY($1::bigint[])',[events.map(e=>e.visit_id).filter(Boolean)]);
   const previewIds=events.flatMap(e=>{try{const id=JSON.parse(e.properties||'{}').past_link_id;return validId(id)?[id]:[];}catch{return [];}});
   return {events,users:await rows(c,`SELECT ${USER_FIELDS} FROM users WHERE id=ANY($1::bigint[])`,[events.map(e=>e.user_id).filter(Boolean)]),previews:await rows(c,'SELECT id,post_thumbnail_url FROM past_links WHERE id=ANY($1::bigint[])',[previewIds]),...await graph(c,visits)};
  }
  if(op==='reports')return reportDocuments(c,await rows(c,'SELECT * FROM reports WHERE is_closed=$1 ORDER BY id DESC LIMIT 100',[bool(input.closed)]));
  if(op==='report') {
   if(!validId(input.report_id))fail(404,'Report not found.');
   const r=await one(c,'SELECT * FROM reports WHERE id=$1',[input.report_id]);if(!r)fail(404,'Report not found.');return reportDocuments(c,[r]);
  }
  if(op==='report-target') {
   const target=await reportTarget(c,input,u);
   return {target:input.reportable_type==='User'?{id:target.id,username:target.username}:{id:target.id,user_id:target.user_id}};
  }
  if(op==='activity')return activityMetrics(c,await store.onlineIds());
  if(op==='system')return systemMetrics(c,pool,redis);
  if(op==='lizard-index')return {};
  if(op==='lizard-browse') {
   if(!['ki','warren','taylor'].includes(input.mascot))fail(422,'Invalid mascot.');
   const online=await store.onlineIds();
   const links=await rows(c,`SELECT l.* FROM links l JOIN users u ON u.id=l.user_id WHERE u.deleted_at IS NULL AND u.mascot=$1 AND
    (l.id=ANY($2::bigint[]) OR l.last_ping>CURRENT_TIMESTAMP-INTERVAL '1 minute' OR (l.last_ping_user_agent LIKE '%widgetExtension%' AND l.last_ping>CURRENT_TIMESTAMP-INTERVAL '20 minutes')) ORDER BY l.id LIMIT 201 OFFSET $3`,[input.mascot,online,(page(input.page)-1)*200]);
   const users=await rows(c,`SELECT ${USER_FIELDS.split(',').filter(k=>k!=='email').join(',')} FROM users WHERE id=ANY($1::bigint[])`,[links.map(l=>l.user_id)]);
   return {links:links.slice(0,200),users,page:page(input.page),has_more:links.length>200};
  }
  fail(404,'Unknown moderation operation.');
 }
 async function tableRecord(c,table,id) {
  if(!validId(id))fail(404,'Record not found.');
  return await one(c,`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id]) || fail(404,'Record not found.');
 }
 async function mutate(c,op,input,admin,effects) {
  if(['bot-update','bot-start','bot-stop'].includes(op))return changeBot(c,op,input,pornbotInterval);
  if(op==='report-create')return createReport(c,input,admin);
  if(op==='setting-toggle') {
   if(!['nnn_enabled','invite_only'].includes(input.key))fail(422,'Invalid site setting.');
   const enabled=!(await settings(c))[input.key];
   await c.query(`INSERT INTO site_settings(key,value,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=CURRENT_TIMESTAMP`,[input.key,String(enabled)]);
   effects.settings.push(input.key);return {key:input.key,enabled};
  }
  if(op==='invite-create') {
   for(let i=0;i<5;i++) {
    const invite=await one(c,`INSERT INTO invite_codes(code,generated_by_id,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING RETURNING id`,[randomBytes(8).toString('hex').toUpperCase(),admin.id]);
    if(invite)return {invite_id:invite.id};
   }
   fail(503,'Could not generate a unique invite. Please retry.');
  }
  if(op==='invite-delete') {const i=await tableRecord(c,'invite_codes',input.id);await c.query('DELETE FROM invite_codes WHERE id=$1',[i.id]);return {invite_id:i.id};}
  if(op.startsWith('emoji-')) {
   const old=op==='emoji-create'?null:await tableRecord(c,'emoji_link_decorations',input.id);
   if(op==='emoji-delete') {await c.query('DELETE FROM emoji_link_decorations WHERE id=$1',[old.id]);effects.emoji=true;return {id:old.id};}
   if(!validId(input.link_id))fail(422,'Link ID must be a positive integer.');
   const emoji=text(input.emoji,100);
   if([...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(emoji)].length!==1 || !/\p{Emoji}/u.test(emoji))fail(422,'Must be a single emoji.');
   if(await one(c,'SELECT id FROM emoji_link_decorations WHERE link_id=$1 AND ($2::bigint IS NULL OR id<>$2)',[input.link_id,old?.id??null]))fail(422,'Link already has an emoji.');
   const result=old?await one(c,'UPDATE emoji_link_decorations SET link_id=$2,emoji=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id',[old.id,input.link_id,emoji]):await one(c,'INSERT INTO emoji_link_decorations(link_id,emoji,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id',[input.link_id,emoji]);
   effects.emoji=true;return result;
  }
  if(op.startsWith('icon-')) {
   const old=op==='icon-create'?null:await tableRecord(c,'user_icons',input.id);
   if(op==='icon-delete') {await c.query('DELETE FROM user_icons WHERE id=$1',[old.id]);return {id:old.id};}
   const iconName=icon(input.icon_name);
   if(old) {await c.query('UPDATE user_icons SET icon_name=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[old.id,iconName]);return {id:old.id};}
   const u=await one(c,'SELECT id FROM users WHERE lower(username)=$1 AND deleted_at IS NULL',[text(input.username).trim().toLowerCase()]);if(!u)fail(422,'User not found.');
   if(await one(c,'SELECT id FROM user_icons WHERE user_id=$1',[u.id]))fail(422,'User already has an icon.');
   return one(c,'INSERT INTO user_icons(user_id,icon_name,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id',[u.id,iconName]);
  }
  if(op.startsWith('client-')) {
   const old=op==='client-create'?null:await tableRecord(c,'wallpaper_clients',input.id);
   if(op==='client-delete') {await c.query('DELETE FROM wallpaper_clients WHERE id=$1',[old.id]);return {id:old.id};}
   if(op==='client-move') {
    if(!['up','down'].includes(input.direction))fail(422,'Invalid movement.');
    const list=await rows(c,'SELECT id,position FROM wallpaper_clients ORDER BY position,id FOR UPDATE');const index=list.findIndex(r=>same(r.id,old.id));
    const other=list[index+(input.direction==='up'?-1:1)];
    if(other) {await c.query('UPDATE wallpaper_clients SET position=$2,match_position=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[old.id,other.position]);await c.query('UPDATE wallpaper_clients SET position=$2,match_position=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[other.id,old.position]);}
    return {id:old.id};
   }
   const attrs=input.attributes;if(!attrs || typeof attrs!=='object'||Array.isArray(attrs))fail(422,'Invalid client.');
   const columns=['name','section','url','platform','match_text','link_name','icon_name','device_type','deprecated'];
   const data={...old,...Object.fromEntries(columns.filter(k=>Object.hasOwn(attrs,k)).map(k=>[k,attrs[k]]))};
   data.name=text(data.name).trim();if(!data.name)fail(422,'Name cannot be blank.');
   if(!['clients','companion_apps','hidden'].includes(data.section))fail(422,'Invalid client section.');
   for(const k of columns.filter(k=>!['name','section','deprecated'].includes(k)))data[k]=data[k]==null?'':text(data[k]);
   if(data.device_type && !['desktop','mobile'].includes(data.device_type))fail(422,'Invalid device type.');
   if(data.icon_name)icon(data.icon_name);
   if(data.url) {try {if(!/^https?:\/\//.test(data.url)||!['http:','https:'].includes(new URL(data.url).protocol))throw new Error();}catch {fail(422,'Client URL must use HTTP or HTTPS.');}}
   if(data.section!=='hidden' && !data.url)fail(422,'A homepage entry needs a URL.');
   data.deprecated=bool(data.deprecated);const values=columns.map(k=>data[k]);
   if(old)return one(c,`UPDATE wallpaper_clients SET ${columns.map((k,i)=>`${k}=$${i+2}`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id`,[old.id,...values]);
   const position=Number((await one(c,'SELECT COALESCE(MAX(position),0)+10 AS next FROM wallpaper_clients')).next);
   return one(c,`INSERT INTO wallpaper_clients(${columns.join(',')},position,match_position,created_at,updated_at) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')},$10,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,[...values,position]);
  }
  if(op==='domain-update') {
   if(!['approved','blocked'].includes(input.status))fail(422,'Invalid domain status.');
   const domain=await tableRecord(c,'profile_domains',input.id);const status=input.status==='approved'?1:2;
   await c.query('UPDATE profile_domains SET status=$2,reviewed_by_id=$3,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[domain.id,status,admin.id]);
   effects.scrub=status===2;return {id:domain.id,domain:domain.domain,status:input.status};
  }
  if(op==='user-update') {
   const u=await user(c,input.user_id,true);const attrs=input.attributes;
   if(!attrs||typeof attrs!=='object'||Array.isArray(attrs))fail(422,'Invalid account.');
   const updates={};
   if(Object.hasOwn(attrs,'username')) {
    const username=text(attrs.username).trim();if(!/^[a-zA-Z0-9]+$/.test(username))fail(422,'Username must contain only letters and numbers.');
    if(system(u) && username!==u.username)fail(422,'System account usernames cannot be changed.');
    if(username!==u.username) {updates.username=username;updates.username_changed_at=new Date();effects.usernames.push(u.username,username);}
   }
   if(Object.hasOwn(attrs,'email')) {const email=text(attrs.email).trim();if(!/^[^@\s]+@(?:[-a-z0-9]+\.)+[a-z]{2,}$/i.test(email))fail(422,'Invalid email address.');updates.email=email;}
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended('account-identities',0))");
   for(const field of ['username','email'])if(updates[field] && await one(c,`SELECT id FROM users WHERE lower(${field})=lower($1) AND id<>$2 LIMIT 1`,[updates[field],u.id]))fail(422,`${field==='email'?'Email':'Username'} has already been taken.`);
   for(const k of ['quarantined','flagged','is_reporter','is_cutie','is_supporter'])if(Object.hasOwn(attrs,k))updates[k]=bool(attrs[k]);
   if(Object.hasOwn(attrs,'set_count')) {if(!/^\d{1,10}$/.test(String(attrs.set_count)) || Number(attrs.set_count)>2147483647)fail(422,'Set count must be a nonnegative integer.');updates.set_count=Number(attrs.set_count);}
   if(Object.hasOwn(attrs,'details')) {
    const content=text(attrs.details,200000);if(input.expected_advanced!==Boolean(u.advanced))fail(409,'Profile mode changed. Please reload.');
    if(!u.advanced && (!content.startsWith('<!-- walltaker:markdown -->\n') || Array.from(content.slice('<!-- walltaker:markdown -->\n'.length)).length>50000))fail(422,'Profile must be prepared as Markdown.');
    const p=await one(c,'SELECT id FROM profiles WHERE user_id=$1 ORDER BY (id=$2) DESC NULLS LAST,id LIMIT 1 FOR UPDATE',[u.id,u.profile_id]);
    if(p) {await c.query('UPDATE profiles SET content=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[p.id,content]);if(!same(u.profile_id,p.id))updates.profile_id=p.id;}
    else {const created=await one(c,"INSERT INTO profiles(user_id,name,content,created_at,updated_at) VALUES($1,'Moderator edited profile',$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id",[u.id,content]);updates.profile_id=created.id;}
    updates.details=content;
   }
   const columns=Object.keys(updates);if(columns.length)await c.query(`UPDATE users SET ${columns.map((k,i)=>`${k}=$${i+2}`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[u.id,...Object.values(updates)]);
   effects.usernames.push(updates.username??u.username);return {user_id:u.id};
  }
  if(op==='user-restore') {
   const u=await user(c,input.user_id,true);if(!u.deleted_at)fail(422,'Only deleted accounts can be restored.');
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended('account-identities',0))");
   const original=u.deleted_username;let username=u.username;
   if(original && !await one(c,'SELECT id FROM users WHERE lower(username)=lower($1) AND id<>$2 LIMIT 1',[original,u.id]))username=original;
   await c.query('UPDATE users SET deleted_at=NULL,username=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[u.id,username]);
   effects.usernames.push(u.username,username);effects.users.push(u.id);return {user_id:u.id,restored_original:username.toLowerCase()===(original??'').toLowerCase()};
  }
  if(op==='user-purge')return purgeUser(c,input.user_id,effects);
  if(op==='user-assume') {const u=await user(c,input.user_id);if(u.deleted_at)fail(422,'Cannot assume a deleted account.');return {user_id:u.id};}
  if(op==='user-quarantine') {
   const u=await user(c,input.user_id,true);await c.query('UPDATE users SET quarantined=NOT COALESCE(quarantined,false),updated_at=CURRENT_TIMESTAMP WHERE id=$1',[u.id]);effects.usernames.push(u.username);return {user_id:u.id};
  }
  if(op==='user-ipban' || op==='event-ipban') {
   let ips;
   if(op==='user-ipban') {const u=await user(c,input.user_id);ips=(await rows(c,'SELECT DISTINCT ip FROM ahoy_visits WHERE user_id=$1',[u.id])).map(v=>v.ip);}
   else {if(!validId(input.event_id))fail(404,'Event not found.');const event=await one(c,'SELECT v.ip FROM ahoy_events e JOIN ahoy_visits v ON v.id=e.visit_id WHERE e.id=$1',[input.event_id]);if(!event)fail(404,'Visit not found.');ips=[event.ip];}
   let added=0;for(const ip of ips.filter(v=>typeof v==='string'&&isIP(v)))if(!await one(c,'SELECT id FROM banned_ips WHERE ip_address=$1',[ip])) {await c.query('INSERT INTO banned_ips(ip_address,banned_by_id,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[ip,admin.id]);added++;}
   return {banned:added};
  }
  if(op==='password-reset') {
   const segment=text(input.email).trim();if(segment.length<2)fail(422,'Email segment too short.');
   const sensitive=bool(input.case_sensitive);const matches=await rows(c,`SELECT ${USER_FIELDS} FROM users WHERE deleted_at IS NULL AND ${sensitive?'email LIKE $1':'lower(email) LIKE lower($1)'} ORDER BY id LIMIT 3`,['%'+escapedLike(segment)+'%']);
   if(matches.length!==1)fail(422,matches.length?'Matches more than one account. Please be more specific.':'Email does not exist in database.');
   const u=await user(c,matches[0].id,true);if(system(u))fail(422,'System account passwords cannot be reset.');
   const token=createHmac('sha256',secretKeyBase).update(`moderation-reset:${input.request_key}:${u.id}`).digest('hex');
   await c.query('UPDATE users SET password_reset_token=$2,password_reset_sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[u.id,token]);
   return {user_id:u.id,warning:segment.length<6?'The email segment was short. Verify the account carefully.':null};
  }
  if(op==='report-close') {
   const r=await tableRecord(c,'reports',input.report_id);
   if(!r.is_closed)await c.query('UPDATE reports SET is_closed=true,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[r.id]);return {report_id:r.id};
  }
  if(op==='link-delete') {
   const l=await tableRecord(c,'links',input.link_id);await removeLinks(c,[l.id]);effects.deleted_links.push(l.id);
   const owner=await user(c,l.user_id);effects.usernames.push(owner.username);effects.emoji=true;return {link_id:l.id};
  }
  fail(404,'Unknown moderation operation.');
 }
 async function response(c,op,input,result) {
  if(op!=='password-reset')return result;
  const token=createHmac('sha256',secretKeyBase).update(`moderation-reset:${input.request_key}:${result.user_id}`).digest('hex');
  const u=await one(c,`SELECT username FROM users WHERE id=$1 AND deleted_at IS NULL AND password_reset_token=$2
   AND password_reset_sent_at>CURRENT_TIMESTAMP-INTERVAL '1 hour'`,[result.user_id,token]);
  if(!u)fail(409,'This reset link has expired or was replaced. Generate a new link.');
  return {...result,username:u.username,token};
 }
 return async (op,input={})=>{
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Invalid moderation request.');
  if(!READS.has(op)&&!WRITES.has(op)&&!DOMAIN_SERVICE.has(op))fail(404,'Unknown moderation operation.');
  const c=await pool.connect();
  try {
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL timezone='UTC'");
   if(DOMAIN_SERVICE.has(op)) {
    // Authenticated service operations expose only domain rules and prepared
    // profile persistence; they cannot perform administrator actions.
    if(op!=='domain-rules')await c.query("SELECT pg_advisory_xact_lock(hashtextextended('walltaker:moderation:v1',0))");
    const r=await domainService(c,op,input,{baseUrl});await c.query('COMMIT');return r;
   }
   if(READS.has(op)) {const u=await actor(c,input,{admin:op!=='report-target'&&!op.startsWith('lizard-'),lizard:op.startsWith('lizard-')});const r=await read(c,op,input,u);await c.query('COMMIT');return r;}
   if(typeof input.request_key!=='string'||!/^[A-Za-z0-9:_-]{1,160}$/.test(input.request_key))fail(422,'Request key required.');
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended('walltaker:moderation:v1',0))");
   const admin=await actor(c,input,{admin:op!=='report-create',write:true});
   const digest=createHmac('sha256',secretKeyBase).update(JSON.stringify(canonical({...input,operation:op}))).digest('hex');
   const prior=await one(c,'SELECT result,payload_digest FROM node_moderation_events WHERE request_key=$1',[input.request_key]);
   if(prior) {if(prior.payload_digest!==digest)fail(409,'Request key reused for different content.');const r=await response(c,op,input,prior.result);await c.query('COMMIT');return r;}
   const effects={settings:[],usernames:[],users:[],deleted_links:[],surrenders:[]};const result=await mutate(c,op,input,admin,effects);
   effects.usernames=[...new Set(effects.usernames)];
   await c.query(`INSERT INTO node_moderation_events(request_key,payload_digest,operation,user_id,result,effects,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,[input.request_key,digest,op,admin.id,JSON.stringify(result),JSON.stringify(effects)]);
   const r=await response(c,op,input,result);await c.query('COMMIT');return r;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 };
}
