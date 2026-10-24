import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { AccountError, invalid, validId, text } from './errors.js';
import { validatePassword } from './passwords.js';

const MARKER = '<!-- walltaker:markdown -->\n';
const PUBLIC_USER = ['id','username','created_at','updated_at','details','admin','set_count','viewing_link_id','mascot','pervert',
  'quarantined','colour_preference','advanced','profile_id','flagged','is_reporter','is_cutie','is_supporter','username_changed_at','deleted_at','system_account'];
const PROFILE_LIST = 'p.id,p.user_id,p.name,p.public,p.origin_id,p.created_at,p.updated_at';
const system = (user) => user.system_account || user.username === 'evil';
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map((key) => [key,canonical(value[key])])) : value;
const safeUser = (user) => Object.fromEntries(PUBLIC_USER.map((key) => [key,user[key]]));
const bool = (value) => ![false,0,'0','false','FALSE','off','OFF','',null,undefined].includes(value);
const name = () => ['Soft','Bright','Gentle','Warm','Velvet'][randomInt(5)]+' '+['Willow','Orchid','Cloud','Moon','Otter'][randomInt(5)];
const shortDate = (value) => {
  const d = new Date(value); const pad = (n) => String(n).padStart(2,'0');
  return `${pad(d.getUTCDate())} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

export function createAccounts({ pool, passwords, secretKeyBase }) {
  const fingerprint = (token) => createHmac('sha256',secretKeyBase).update('reset:'+token).digest('hex');
  const isInviteOnly = async (client) => bool((await client.query("SELECT value FROM site_settings WHERE key='invite_only'")).rows[0]?.value);
  async function actor(client, input, { settings = false, allowSurrendered = false } = {}) {
    if (!validId(input.actor_id)) throw new AccountError(403,'Not authorized.');
    const user = (await client.query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[input.actor_id])).rows[0];
    if (!user) throw new AccountError(403,'Not authorized.');
    const surrender = (await client.query(`SELECT s.*, controller.username AS controller_name FROM surrenders s
      JOIN friendships f ON f.id=s.friendship_id JOIN users controller ON controller.id=s.controller_user_id
      WHERE s.user_id=$1 AND s.pending IS NOT TRUE AND s.expires_at>CURRENT_TIMESTAMP AND s.accepted_consequences=true
        AND f.confirmed=true AND controller.deleted_at IS NULL AND $2=false
        AND ((f.sender_id=s.user_id AND f.receiver_id=s.controller_user_id) OR (f.receiver_id=s.user_id AND f.sender_id=s.controller_user_id))
      ORDER BY s.id LIMIT 1`,[user.id,user.admin === true])).rows[0];
    if (input.surrender_id != null && (!surrender || String(input.surrender_id)!==String(surrender.id) || !surrender.logged_in)) {
      throw new AccountError(403,'The delegated session is no longer active.');
    }
    if (surrender && input.surrender_id == null && !allowSurrendered) throw new AccountError(403,'This account is currently surrendered.');
    if (input.target_id != null && String(input.target_id)!==String(user.id)) {
      if (!settings || !input.surrender_id || String(surrender?.controller_user_id)!==String(input.target_id)) throw new AccountError(403,'Not authorized.');
      return { user:(await client.query('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[input.target_id])).rows[0], surrender:null };
    }
    return { user, surrender:input.surrender_id ? surrender : null };
  }
  async function notification(client, user, surrender, message) {
    if (!surrender) return null;
    return (await client.query(`INSERT INTO notifications(user_id,notification_type,text,link,created_at,updated_at)
      VALUES($1,8,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,
    [user.id,Array.from(`${surrender.controller_name} ${message}`).slice(0,255).join(''),'/users/'+user.username])).rows[0].id;
  }
  async function revokeBrowser(client,userId) {
    if(!(await client.query("SELECT to_regclass('public.node_browser_sessions') AS name")).rows[0].name)return;
    await client.query('UPDATE node_browser_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE (user_id=$1 OR original_actor_id=$1) AND revoked_at IS NULL',[userId]);
    await client.query('UPDATE node_browser_legacy_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
  }
  const ownedProfile = async (client, user, id) => {
    if (!validId(id)) throw new AccountError(404,'Profile not found.');
    const profile = (await client.query('SELECT * FROM profiles WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,user.id])).rows[0];
    if (!profile) throw new AccountError(403,'Not authorized.');
    return profile;
  };
  const createProfile = async (client, user, content = '', title = name(), origin = null) =>
    (await client.query(`INSERT INTO profiles(user_id,name,content,origin_id,created_at,updated_at)
      VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,[user.id,title,content,origin])).rows[0];
  const selectProfile = async (client,user,id) => client.query('UPDATE users SET profile_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,id]);

  async function authenticate(input) {
    const identifier = typeof input.identifier==='string' ? input.identifier.trim().toLowerCase().slice(0,255) : '';
    const user = (await pool.query(`SELECT id,username,password_digest,system_account FROM users
      WHERE deleted_at IS NULL AND (lower(email)=$1 OR lower(username)=$1) ORDER BY id LIMIT 1`,[identifier])).rows[0];
    // Unknown/system accounts still do a bcrypt comparison to keep failures generic.
    const digest = user && !system(user) ? user.password_digest : '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
    const matched = await passwords.verify(input.password,digest);
    return { user_id:matched && user && !system(user) ? user.id : null };
  }
  async function read(operation,input) {
    if(operation==='delivery-user') {
      if(!validId(input.event_id))throw new AccountError(404,'Receipt not found.');
      const event=(await pool.query("SELECT user_id,result FROM node_account_events WHERE id=$1 AND operation='reset-request' AND delivered_at IS NULL",[input.event_id])).rows[0];
      if(!event || event.result.status!=='queued')return {delivery:null};
      const user=(await pool.query("SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL AND password_reset_sent_at>CURRENT_TIMESTAMP-INTERVAL '1 hour'",[event.user_id])).rows[0];
      if(!user?.password_reset_token || fingerprint(user.password_reset_token)!==event.result.token_fingerprint)return {delivery:null};
      return {delivery:{user:{...safeUser(user),email:user.email},token:user.password_reset_token}};
    }
    if(operation==='browser-private-user') {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const {user,surrender}=await actor(client,input,{settings:true,allowSurrendered:true});
        await client.query('COMMIT');
        return {user:{...safeUser(user),email:surrender?null:user.email,api_key:surrender?null:user.api_key}};
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    }
    if (operation==='user') {
      const user = (await pool.query('SELECT * FROM users WHERE username=$1 AND deleted_at IS NULL',[text(input.username,'username')])).rows[0];
      if (!user) throw new AccountError(404,'User not found.');
      const profile = (await pool.query('SELECT p.* FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND u.deleted_at IS NULL',[user.profile_id])).rows[0] || null;
      return { user:safeUser(user),profile };
    }
    if (operation==='profile') {
      const profile = validId(input.profile_id) && (await pool.query(`SELECT p.* FROM profiles p JOIN users u ON u.id=p.user_id
        WHERE p.id=$1 AND p.public=true AND u.deleted_at IS NULL`,[input.profile_id])).rows[0];
      if (!profile) throw new AccountError(404,'Profile not found.');
      return { profile };
    }
    if (operation==='profiles-own') {
      if (!validId(input.actor_id)) throw new AccountError(403,'Not authorized.');
      return { profiles:(await pool.query(`SELECT ${PROFILE_LIST} FROM profiles p JOIN users u ON u.id=p.user_id
        WHERE p.user_id=$1 AND u.deleted_at IS NULL ORDER BY p.id DESC`,[input.actor_id])).rows };
    }
    const page = Number(input.page ?? 1);
    if (!Number.isSafeInteger(page) || page<1 || page>100000) throw new AccountError(400,'Invalid page.');
    if (input.user_id != null && !validId(input.user_id)) throw new AccountError(404,'User not found.');
    const where = 'FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.public=true AND u.deleted_at IS NULL AND ($1::bigint IS NULL OR p.user_id=$1)';
    const count = Number((await pool.query('SELECT count(*) '+where,[input.user_id ?? null])).rows[0].count);
    const profiles = (await pool.query('SELECT '+PROFILE_LIST+' '+where+' ORDER BY p.id LIMIT 5 OFFSET $2',[input.user_id ?? null,(page-1)*5])).rows;
    return { profiles,count,page };
  }
  return async (operation,input) => {
    if (!input || typeof input!=='object' || Array.isArray(input)) throw new AccountError(422,'Invalid account command.');
    if (operation==='authenticate') return authenticate(input);
    if (['user','profile','profiles-own','profiles-public','browser-private-user','delivery-user'].includes(operation)) return read(operation,input);
    if (!['signup','username','password','account-delete','api-key','colour','mascot','pervert','reset-request','reset-complete',
      'profile-create','profile-content','profile-rename','profile-share','profile-copy','profile-select','profile-delete','profile-mode'].includes(operation)) throw new AccountError(404,'Not found.');
    if (typeof input.request_key!=='string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(input.request_key)) throw new AccountError(422,'Invalid request key.');
    const digest = createHmac('sha256',secretKeyBase).update(JSON.stringify(canonical({ ...input,operation }))).digest('hex');
    // Hash outside row locks; the password worker is bounded and separate from HTTP.
    let hashed;
    if (['signup','password','reset-complete'].includes(operation)) {
      if (operation==='reset-complete' && typeof input.password_confirmation!=='string') invalid('password_confirmation',"doesn't match Password.");
      validatePassword(input.password,input.password_confirmation);
      hashed = await passwords.hash(input.password);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account:'+input.request_key]);
      const prior = (await client.query('SELECT payload_digest,result FROM node_account_events WHERE request_key=$1',[input.request_key])).rows[0];
      if (prior) {
        if (prior.payload_digest!==digest) throw new AccountError(409,'Request key already used.');
        await client.query('COMMIT'); return { ...prior.result,replayed:true };
      }
      let user, surrender, previousUsername = null, notificationId = null, result = {};
      if (operation==='signup') {
        const username = text(input.username,'username'), email = text(input.email,'email');
        if (!/^[A-Za-z0-9]+$/.test(username)) invalid('username',"must contain only letters and numbers.");
        if (!/^([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})$/i.test(email)) invalid('email','must be a valid email address.');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account-identities']);
        if ((await client.query('SELECT id FROM users WHERE lower(username)=lower($1)',[username])).rowCount) invalid('username','has already been taken.');
        if ((await client.query('SELECT id FROM users WHERE lower(email)=lower($1)',[email])).rowCount) invalid('email','has already been taken.');
        let invite;
        if (await isInviteOnly(client)) {
          invite = (await client.query('SELECT id FROM invite_codes WHERE code=$1 AND redeemed_at IS NULL FOR UPDATE',[String(input.invite_code || '').trim().toUpperCase()])).rows[0];
          if (!invite) invalid('base','Invite code is invalid or has already been used.');
        }
        const details = input.details == null ? null : text(input.details,'details');
        user = (await client.query(`INSERT INTO users(username,email,password_digest,details,created_at,updated_at)
          VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,[username,email,hashed,details])).rows[0];
        if (invite) await client.query('UPDATE invite_codes SET redeemed_by_id=$2,redeemed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[invite.id,user.id]);
        result = { user_id:user.id };
      } else if (operation==='reset-request') {
        const email = typeof input.email==='string' ? input.email.trim().toLowerCase().slice(0,255) : '';
        user = (await client.query('SELECT * FROM users WHERE lower(email)=$1 AND deleted_at IS NULL ORDER BY id LIMIT 1 FOR UPDATE',[email])).rows[0];
        result = { status:'ignored' };
        if (user && !system(user) && (!user.password_reset_sent_at || new Date(user.password_reset_sent_at).getTime()<=Date.now()-600000)) {
          const token = randomUUID();
          await client.query('UPDATE users SET password_reset_token=$2,password_reset_sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,token]);
          result = { status:'queued',token_fingerprint:fingerprint(token) };
        }
      } else if (operation==='reset-complete') {
        if (typeof input.token!=='string' || !input.token || input.token.length>255) invalid('base','Invalid password reset link.');
        user = (await client.query(`SELECT * FROM users WHERE password_reset_token=$1 AND deleted_at IS NULL
          AND password_reset_sent_at>CURRENT_TIMESTAMP-INTERVAL '1 hour' ORDER BY id LIMIT 1 FOR UPDATE`,[input.token])).rows[0];
        if (!user || system(user)) invalid('base','Invalid or expired password reset link.');
        await client.query('UPDATE users SET password_digest=$2,password_reset_token=NULL,password_reset_sent_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,hashed]);
        await revokeBrowser(client,user.id);
        result = { user_id:user.id };
      } else {
        ({ user,surrender } = await actor(client,input,{ settings:['username','password','colour','account-delete'].includes(operation),allowSurrendered:['mascot','pervert'].includes(operation) }));
        if (!user) throw new AccountError(403,'Not authorized.');
        result = { user_id:user.id };
        if (operation==='username') {
          if (system(user)) invalid('base','System account usernames cannot be changed.');
          if (user.username_changed_at && new Date(user.username_changed_at).getTime()>Date.now()-604800000) invalid('base','Username can only be changed once a week.');
          const username = text(input.username,'username').trim();
          if (!username) invalid('base',"Username can't be blank.");
          if (!/^[A-Za-z0-9]+$/.test(username)) invalid('username','must contain only letters and numbers.');
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account-identities']);
          if ((await client.query('SELECT id FROM users WHERE lower(username)=lower($1) AND id<>$2',[username,user.id])).rowCount) invalid('base',`${username} is not available.`);
          previousUsername = user.username;
          await client.query(`UPDATE users SET username=$2::varchar,username_changed_at=CASE WHEN username<>$2::varchar THEN CURRENT_TIMESTAMP ELSE username_changed_at END,
            updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[user.id,username]);
        } else if (operation==='password' || operation==='account-delete') {
          if (system(user)) invalid('base',operation==='password'?'System account passwords cannot be changed.':'System accounts cannot be deleted.');
          if (!await passwords.verify(input.current_password,user.password_digest)) invalid('base','Current password is incorrect.');
          if (operation==='password') await client.query('UPDATE users SET password_digest=$2,password_reset_token=NULL,password_reset_sent_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,hashed]);
          else {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account-identities']);
            let tombstone;
            do { tombstone = user.username.slice(0,245)+randomBytes(5).toString('hex'); }
            while ((await client.query('SELECT id FROM users WHERE lower(username)=lower($1)',[tombstone])).rowCount);
            await revokeBrowser(client,user.id);
            previousUsername = user.username;
            await client.query('UPDATE users SET username=$2,deleted_username=$3,deleted_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,tombstone,user.username]);
          }
        } else if (operation==='api-key') {
          await client.query('UPDATE users SET api_key=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,randomBytes(6).toString('base64')]);
        } else if (operation==='colour') {
          const colour = ['auto','light','dark'].indexOf(input.colour_preference);
          if (colour<0) invalid('colour_preference','is invalid.');
          await client.query('UPDATE users SET colour_preference=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,colour]);
          notificationId = await notification(client,user,surrender,`set your colour scheme to ${input.colour_preference}`);
        } else if (operation==='mascot') {
          const mascot = ({ warren:'taylor',taylor:'ki',ki:'warren' })[user.mascot || 'ki'] || user.mascot;
          await client.query('UPDATE users SET mascot=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,mascot]);
        } else if (operation==='pervert') {
          await client.query('UPDATE users SET pervert=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,!user.pervert]);
        } else if (operation==='profile-create') {
          const profile = await createProfile(client,user); await selectProfile(client,user,profile.id); result.profile_id=profile.id;
        } else if (operation==='profile-copy') {
          if (!validId(input.profile_id)) throw new AccountError(404,'Profile not found.');
          const profile = (await client.query(`SELECT p.* FROM profiles p JOIN users u ON u.id=p.user_id
            WHERE p.id=$1 AND p.public=true AND u.deleted_at IS NULL FOR SHARE OF p`,[input.profile_id])).rows[0];
          if (!profile) throw new AccountError(403,'This profile is not shared.');
          const copy = await createProfile(client,user,profile.content,Array.from(`${profile.name} ${shortDate(profile.updated_at)}`).slice(0,255).join(''),profile.id);
          await selectProfile(client,user,copy.id); result.profile_id=copy.id;
        } else if (operation==='profile-content') {
          if (input.expected_advanced!==user.advanced) throw new AccountError(409,'Profile mode changed. Please reload.');
          const content = text(input.content,'content',200000);
          if (!user.advanced && (!content.startsWith(MARKER) || Array.from(content.slice(MARKER.length)).length>50000)) invalid('content','must be prepared as Markdown.');
          let profile;
          if (user.profile_id) {
            profile = await ownedProfile(client,user,user.profile_id);
            await client.query('UPDATE profiles SET content=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[profile.id,content]);
          } else { profile = await createProfile(client,user,content); await selectProfile(client,user,profile.id); }
          result.profile_id=profile.id;
          notificationId = await notification(client,user,surrender,'changed a profile setting.');
        } else if (operation==='profile-mode') {
          if (input.expected_advanced!==user.advanced) throw new AccountError(409,'Profile mode changed. Please reload.');
          if (!user.advanced && user.profile_id) {
            const profile = await ownedProfile(client,user,user.profile_id);
            if (String(input.profile_id)!==String(profile.id) || new Date(input.profile_updated_at).getTime()!==new Date(profile.updated_at).getTime()) throw new AccountError(409,'Profile changed. Please reload.');
            if (profile.content.startsWith(MARKER)) await client.query('UPDATE profiles SET content=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[profile.id,text(input.html,'content',200000)]);
          }
          await client.query('UPDATE users SET advanced=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id,!user.advanced]);
        } else {
          const profile = await ownedProfile(client,user,input.profile_id); result.profile_id=profile.id;
          if (operation==='profile-rename') await client.query('UPDATE profiles SET name=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[profile.id,text(input.name,'name')]);
          else if (operation==='profile-share') await client.query('UPDATE profiles SET public=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[profile.id,bool(input.public)]);
          else if (operation==='profile-select') await selectProfile(client,user,profile.id);
          else if (operation==='profile-delete') {
            await client.query('UPDATE profiles SET origin_id=NULL WHERE origin_id=$1',[profile.id]);
            await client.query('UPDATE users SET profile_id=NULL WHERE profile_id=$1',[profile.id]);
            await client.query('DELETE FROM profiles WHERE id=$1',[profile.id]);
            if (String(user.profile_id)===String(profile.id)) {
              const next = (await client.query('SELECT id FROM profiles WHERE user_id=$1 ORDER BY id DESC LIMIT 1',[user.id])).rows[0];
              await selectProfile(client,user,next?.id || null);
            }
          }
        }
      }
      const event = (await client.query(`INSERT INTO node_account_events(request_key,payload_digest,user_id,operation,previous_username,notification_id,result,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,
      [input.request_key,digest,user?.id || null,operation,previousUsername,notificationId,JSON.stringify(result)])).rows[0];
      await client.query('COMMIT'); return { ...result,event_id:event.id,replayed:false };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code==='23505') invalid('base','That username or email is already in use.');
      throw error;
    } finally { client.release(); }
  };
}
