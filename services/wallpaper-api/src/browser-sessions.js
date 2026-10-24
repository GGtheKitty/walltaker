import { randomBytes,createHmac } from 'node:crypto';
import { browserCookies,cookieFingerprint,createLegacyCookies,createBrowserCsrf } from './browser-cookies.js';
import { CommandError } from './updates.js';

export const BROWSER_USER_FIELDS='id,username,details,admin,created_at,updated_at,set_count,viewing_link_id,mascot,pervert,quarantined,colour_preference,advanced,profile_id,flagged,is_reporter,is_cutie,is_supporter,username_changed_at,deleted_at,system_account';
export const browserId=value=>(typeof value==='string'||Number.isSafeInteger(value)) && /^[1-9]\d{0,18}$/.test(String(value)) && BigInt(value)<=9223372036854775807n;
const fail=(status,message)=>{throw new CommandError(status,message);};
const one=async(c,sql,args=[]) => (await c.query(sql,args)).rows[0];
const same=(a,b)=>String(a)===String(b);
const lifespan=14*86400000;
export const SESSION_COOKIE='walltaker_session';
export const CSRF_COOKIE='walltaker_csrf';

export function createBrowserSessions({pool,secretKeyBase,baseUrl,accounts,social,limiter,now=Date.now}) {
 const legacy=createLegacyCookies(secretKeyBase,{now}),csrf=createBrowserCsrf(secretKeyBase,{now});
 const user=id=>browserId(id)?one(pool,`SELECT ${BROWSER_USER_FIELDS} FROM users WHERE id=$1 AND deleted_at IS NULL`,[id]):null;
 const flags=async()=>Object.fromEntries((await pool.query("SELECT key,value FROM site_settings WHERE key IN ('invite_only','nnn_enabled')")).rows.map(row=>[row.key,!['false','0','off',''].includes(row.value)]));
 const expiry=value=>new Date(Math.min(value?new Date(value).getTime():Infinity,now()+lifespan));
 async function consent(subject,surrenderId) {
  if(!surrenderId)return null;
  return one(pool,`SELECT s.*,controller.username AS controller_name FROM surrenders s
   JOIN friendships f ON f.id=s.friendship_id JOIN users controller ON controller.id=s.controller_user_id
   WHERE s.id=$1 AND s.user_id=$2 AND s.pending IS NOT TRUE AND s.accepted_consequences=true
    AND s.expires_at>CURRENT_TIMESTAMP AND s.logged_in=true AND f.confirmed=true AND controller.deleted_at IS NULL AND $3=false
    AND ((f.sender_id=s.user_id AND f.receiver_id=s.controller_user_id) OR(f.receiver_id=s.user_id AND f.sender_id=s.controller_user_id))`,[surrenderId,subject.id,subject.admin===true]);
 }
 async function fingerprintsValid(fingerprints) {
  for(const item of fingerprints) {
   const row=await one(pool,'SELECT revoked_at,expires_at FROM node_browser_legacy_sessions WHERE fingerprint=$1',[item.fingerprint]);
   if(row && (row.revoked_at || new Date(row.expires_at).getTime()<=now()))return false;
  }
  return true;
 }
 async function rememberLegacy(candidate) {
  await pool.query(`INSERT INTO node_browser_legacy_sessions(fingerprint,user_id,expires_at,created_at)
   VALUES($1,$2,$3,CURRENT_TIMESTAMP) ON CONFLICT(fingerprint) DO NOTHING`,[candidate.fingerprint,candidate.userId,expiry(candidate.expiresAt)]);
  return fingerprintsValid([candidate]);
 }
 async function revoke(session,fingerprints=[]) {
  if(session)await pool.query('UPDATE node_browser_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1 AND revoked_at IS NULL',[session.id]);
  for(const item of [...(session?.legacy_fingerprints || []),...fingerprints]) {
   await pool.query(`INSERT INTO node_browser_legacy_sessions(fingerprint,user_id,expires_at,revoked_at,created_at)
    VALUES($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(fingerprint) DO UPDATE SET revoked_at=CURRENT_TIMESTAMP`,[item.fingerprint,item.userId || session?.user_id,expiry(item.expiresAt)]);
  }
 }
 async function issue(subject,{remember=false,surrender=null,originalActor=null,fingerprints=[],expiresAt=null}={}) {
  const token=randomBytes(32).toString('base64url');
  const end=expiry(expiresAt);
  if(surrender && new Date(surrender.expires_at)<end)end.setTime(new Date(surrender.expires_at).getTime());
  const session=await one(pool,`INSERT INTO node_browser_sessions(token_digest,user_id,original_actor_id,surrender_id,legacy_fingerprints,remember,expires_at,created_at,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,[cookieFingerprint(token),subject.id,originalActor,surrender?.id || null,JSON.stringify(fingerprints),remember,end]);
  return {cookie:{name:SESSION_COOKIE,value:token,expires_at:remember?end.toISOString():null},session_id:session.id};
 }
 async function resolve(header,{migrate=false}={}) {
  const cookies=browserCookies(header),old=legacy.read(header),settings=await flags();let session,subject,surrender;
  if(Object.hasOwn(cookies,SESSION_COOKIE)) {
   if(!/^[A-Za-z0-9_-]{43}$/.test(cookies[SESSION_COOKIE]))return {user:null,clear:true,flags:settings,legacy:old};
   session=await one(pool,'SELECT * FROM node_browser_sessions WHERE token_digest=$1',[cookieFingerprint(cookies[SESSION_COOKIE])]);
   if(!session || session.revoked_at || new Date(session.expires_at).getTime()<=now() || !await fingerprintsValid(session.legacy_fingerprints.filter(item=>item.primary!==false))) {
    if(session && !session.revoked_at)await revoke(session);
    return {user:null,clear:true,flags:settings,legacy:old};
   }
   subject=await user(session.user_id);
   if(!subject) {await revoke(session);return {user:null,clear:true,flags:settings,legacy:old};}
   if(session.surrender_id) {
    surrender=await consent(subject,session.surrender_id);
    if(!surrender || !same(surrender.controller_user_id,session.original_actor_id)) {
     await revoke(session);return {user:null,clear:true,expired_delegation:true,flags:settings,legacy:old};
    }
   }
  } else {
   if(old.invalidSurrender)return {user:null,clear:true,expired_delegation:true,flags:settings,legacy:old};
   for(const candidate of old.candidates) {
    const found=await user(candidate.userId);
    if(found && await rememberLegacy(candidate)) {subject=found;session={legacy_fingerprints:old.candidates,remember:candidate.remember};break;}
   }
   if(subject && old.surrenderId) {
    surrender=await consent(subject,old.surrenderId);
    if(!surrender)return {user:null,clear:true,expired_delegation:true,flags:settings,legacy:old};
   }
  }
  if(subject?.username==='evil' && settings.invite_only) {
   await revoke(session?.id?session:null,old.candidates);
   return {user:null,clear:true,evil_blocked:true,flags:settings,legacy:old};
  }
  const result={user:subject || null,surrender:surrender || null,session,flags:settings,legacy:old};
  if(subject && migrate && !session?.id) {
   const candidate=old.candidates.find(item=>same(item.userId,subject.id));
   result.issued=await issue(subject,{remember:candidate.remember,surrender,originalActor:surrender?.controller_user_id,
    fingerprints:old.candidates.map(item=>({...item,primary:item.fingerprint===candidate.fingerprint})),expiresAt:candidate.expiresAt});
   result.migrated=true;
  }
  return result;
 }
 const csrfCookie=header=>browserCookies(header)[CSRF_COOKIE];
 async function banned(header,ip) {
  const cookies=browserCookies(header);
  return !!await one(pool,`SELECT id FROM banned_ips WHERE ip_address=$1 OR ip_address=(
   SELECT ip FROM ahoy_visits WHERE visit_token=$2 AND visitor_token=$3 LIMIT 1) LIMIT 1`,[ip || null,cookies.ahoy_visit || null,cookies.ahoy_visitor || null]);
 }
 const csrfDocument=(header,rotate=false)=>{
  let cookie=csrfCookie(header),issued;
  if(rotate || !csrf.valid(cookie)){cookie=csrf.issue();issued={name:CSRF_COOKIE,value:cookie,expires_at:new Date(now()+lifespan).toISOString()};}
  return {csrf_token:csrf.token(cookie),csrf_cookie:issued};
 };
 async function transition(header,subject,options={}) {
  const prior=await resolve(header);await revoke(prior.session?.id?prior.session:null,prior.legacy.candidates);
  // A newly authenticated session must not inherit a revoked legacy source.
  const issued=await issue(subject,options);
  const challenge=csrfDocument(header,true);
  return {user:subject,csrf_token:challenge.csrf_token,cookies:[issued.cookie,challenge.csrf_cookie],clear_legacy:true};
 }
 return {
  resolve,user,flags,consent,csrfDocument,
  csrf:({cookie,headers={},...input})=>({verified:csrf.verify({cookie:csrfCookie(cookie),legacyToken:legacy.read(cookie).csrf,
   tokens:input.tokens,method:input.method,path:input.path,origin:input.origin,baseUrl})}),
  async request(operation,input={},header='') {
   if(operation==='csrf')return {verified:csrf.verify({cookie:csrfCookie(header),legacyToken:legacy.read(header).csrf,tokens:input.tokens,method:input.method,path:input.path,origin:input.origin,baseUrl})};
   if(operation==='context') {
    if(!input.path?.startsWith('/_internal/'))await limiter?.('request',input.ip);
    const result=await resolve(header,{migrate:true}),challenge=csrfDocument(header);
    return {...result,session:undefined,legacy:undefined,issued:undefined,
     cookies:[result.issued?.cookie,challenge.csrf_cookie].filter(Boolean),csrf_token:challenge.csrf_token,
     clear_legacy:result.migrated || result.clear,clear_session:result.clear};
   }
   if(operation==='login') {
    await limiter?.('login',input.ip);
    if(await banned(header,input.ip))fail(403,'Not authorized.');
    const response=await accounts('authenticate',{identifier:input.identifier,password:input.password});
    const subject=await user(response.user_id);
    if(!subject || subject.system_account || subject.username==='evil')return {user:null};
    return transition(header,subject,{remember:input.remember===true});
   }
   if(operation==='logout') {
    const prior=await resolve(header);await revoke(prior.session?.id?prior.session:null,prior.legacy.candidates);
    if(prior.surrender && social)await social('surrender-return',{actor_id:prior.user.id,surrender_id:prior.surrender.id,id:prior.surrender.id,request_key:'logout:'+cookieFingerprint(header)});
    return {user:null,clear_session:true,clear_legacy:true,cookies:[csrfDocument(header,true).csrf_cookie]};
   }
   if(operation==='signup') {
    if(await banned(header,input.ip))fail(403,'Not authorized.');
    const result=await accounts('signup',input);
    const subject=await user(result.user_id);if(!subject)fail(403,'Account is no longer active.');
    return {...await transition(header,subject),account:result};
   }
   if(operation==='reset-request') {
    await limiter?.('reset-ip',input.ip);await limiter?.('reset-email',String(input.email || '').trim().toLowerCase());
    return accounts('reset-request',input);
   }
   const current=await resolve(header);
   if(operation==='evil') {
    if(current.flags.invite_only)fail(403,'The evil account is unavailable while invite-only mode is enabled.');
    const subject=await one(pool,`SELECT ${BROWSER_USER_FIELDS} FROM users WHERE username='evil' AND deleted_at IS NULL`);
    if(!subject)fail(404,'Evil user is missing.');return transition(header,subject);
   }
   if(!current.user)fail(403,'Please log in.');
   if(operation==='authorize') {
    if(await banned(header,input.ip))fail(403,'Not authorized.');
    if(current.surrender && ['admin','lizard'].includes(input.mode))fail(403,'Delegated sessions cannot use administration tools.');
    if(input.mode==='admin' && !current.user.admin)fail(403,'Not authorized.');
    if(input.mode==='lizard' && !current.user.admin && !['PornLizardKi','PornLizardTaylor','PornLizardWarren'].includes(current.user.username))fail(403,'Not authorized.');
    if(['admin','lizard'].includes(input.mode) && await one(pool,`SELECT id FROM surrenders WHERE user_id=$1 AND pending IS NOT TRUE AND accepted_consequences=true AND expires_at>CURRENT_TIMESTAMP LIMIT 1`,[current.user.id]))fail(403,'Surrendered accounts cannot use administration tools.');
    const owned=await one(pool,`SELECT s.id FROM surrenders s JOIN friendships f ON f.id=s.friendship_id JOIN users controller ON controller.id=s.controller_user_id
     WHERE s.user_id=$1 AND s.pending IS NOT TRUE AND s.accepted_consequences=true AND s.expires_at>CURRENT_TIMESTAMP
     AND f.confirmed=true AND controller.deleted_at IS NULL AND $2=false
     AND ((f.sender_id=s.user_id AND f.receiver_id=s.controller_user_id) OR(f.receiver_id=s.user_id AND f.sender_id=s.controller_user_id)) ORDER BY s.id LIMIT 1`,[current.user.id,current.user.admin===true]);
    if(owned && !current.surrender && input.mode!=='surrendered')return {allowed:false,redirect:'/surrenders/'+owned.id};
    if(current.surrender && input.method==='GET' && social && current.surrender.current_page!==input.path) {
     await social('surrender-page',{actor_id:current.user.id,surrender_id:current.surrender.id,id:current.surrender.id,page:input.path,request_key:input.request_key});
    }
    return {allowed:true};
   }
   if(operation==='assume') {
    if(!current.user.admin || current.surrender)fail(403,'Administrator access required.');
    const target=await user(input.user_id);if(!target)fail(404,'User not found.');
    return transition(header,target,{originalActor:current.user.id});
   }
   if(operation==='surrender-assume') {
    const result=await social(operation,{...input,actor_id:current.user.id,surrender_id:current.surrender?.id || null});
    const target=await user(result.user_id),surrender=target && await consent(target,result.surrender_id);
    if(!target || !surrender || !same(surrender.controller_user_id,current.user.id))fail(403,'Delegation is no longer active.');
    return transition(header,target,{surrender,originalActor:current.user.id});
   }
   if(operation==='surrender-return') {
    if(!current.surrender)fail(403,'This is not a delegated session.');
    const result=await social(operation,{...input,actor_id:current.user.id,surrender_id:current.surrender.id,id:current.surrender.id});
    const target=await user(result.controller_id);if(!target || !same(target.id,current.surrender.controller_user_id))fail(403,'Controller is no longer active.');
    return transition(header,target);
   }
   fail(404,'Unknown browser operation.');
  },
 };
}

export function createBrowserLimiter(redis,secret) {
 const limits={request:[250,60],login:[5,20],'reset-ip':[5,900],'reset-email':[5,3600]};
 const script="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
 return async(kind,value)=>{
  if(!value)return;
  const [limit,seconds]=limits[kind],hash=createHmac('sha256',secret).update(kind+':'+value).digest('hex');
  const count=await redis.eval(script,{keys:['node:browser:limit:'+hash],arguments:[String(seconds)]});
  if(count>limit)fail(429,'Too many requests. Please try again shortly.');
 };
}
