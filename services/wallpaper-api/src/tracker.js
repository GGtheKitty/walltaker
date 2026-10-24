import { createHash } from 'node:crypto';
import { CommandError } from './updates.js';

const USER_COLUMNS = 'id,username,mascot,admin,deleted_at';
const validId = value => (typeof value==='string' || Number.isSafeInteger(value)) && /^\d{1,19}$/.test(String(value)) && BigInt(value)>0n && BigInt(value)<=9223372036854775807n;
const same = (a,b) => String(a)===String(b);
const fail = (status,message) => { throw new CommandError(status,message); };
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
const READS = new Set(['entries','entry','form','statistics','pledges','pledge-status']);
const WRITES = new Set(['entry-create','entry-update','entry-delete','pledge-create','pledge-fail']);
const text = value => typeof value==='string' && value.length<=255 && !value.includes('\0') ? value : fail(422,'Invalid username.');
const pageNumber = value => value==null ? 1 : /^[1-9]\d{0,5}$/.test(String(value)) && Number(value)<=100000 ? Number(value) : fail(422,'Invalid page.');
function attributes(input) {
  if(![1,2,3,4,5,'1','2','3','4','5'].includes(input.rating))fail(422,'Rating must be between 1 and 5.');
  if(![undefined,null,false,true,0,1,'0','1','false','true','off','on'].includes(input.is_ruined))fail(422,'Invalid ruined value.');
  return {rating:Number(input.rating),is_ruined:[true,1,'1','true','on'].includes(input.is_ruined)};
}

// A separate role can manage tracker data, but cannot read account credentials.
export function createTracker(pool) {
  const rows = async (c,sql,args=[]) => (await c.query(sql,args)).rows;
  const one = async (c,sql,args=[]) => (await rows(c,sql,args))[0];
  async function user(c,value,byName=false,lock=false) {
    if(!byName && !validId(value))fail(404,'User not found.');
    const u=await one(c,`SELECT ${USER_COLUMNS} FROM users WHERE ${byName?'username':'id'}=$1 AND deleted_at IS NULL${lock?' FOR NO KEY UPDATE':''}`,[byName?text(value):value]);
    return u || fail(404,'User not found.');
  }
  async function actor(c,input) {
    if(!validId(input.actor_id))fail(403,'Please log in.');
    // Reactions take this same owner lock before checking the cooldown. Do not
    // replace it with an entry-row lock: the first entry has no row to lock.
    // NO KEY UPDATE still serializes logging, while allowing foreign-key key
    // shares when two owners credit each other in concurrent notifications.
    const u=await user(c,input.actor_id,false,true);
    const s=await one(c,`SELECT s.* FROM surrenders s JOIN friendships f ON f.id=s.friendship_id
      JOIN users controller ON controller.id=s.controller_user_id
      WHERE s.user_id=$1 AND s.pending IS NOT TRUE AND s.accepted_consequences=true AND s.expires_at>CURRENT_TIMESTAMP
      AND f.confirmed=true AND controller.deleted_at IS NULL AND $2=false
      AND ((f.sender_id=s.user_id AND f.receiver_id=s.controller_user_id) OR (f.receiver_id=s.user_id AND f.sender_id=s.controller_user_id))
      ORDER BY s.id LIMIT 1`,[u.id,u.admin===true]);
    if(input.surrender_id!=null && (!s || !same(s.id,input.surrender_id) || !s.logged_in))fail(403,'The delegated session is no longer active.');
    if(s && input.surrender_id==null)fail(403,'This account is currently surrendered.');
    return {u,s:input.surrender_id ? s : null};
  }
  async function enabled(c) {
    const setting=(await one(c,"SELECT value FROM site_settings WHERE key='nnn_enabled'"))?.value;
    return setting!=null && setting!=='' && !['0','f','false','off'].includes(setting.toLowerCase());
  }
  async function currentPledge(c,uid) {
    return await one(c,'SELECT * FROM nut_pledges WHERE user_id=$1 AND year=EXTRACT(YEAR FROM CURRENT_TIMESTAMP)',[uid]) || null;
  }
  async function entry(c,value) {
    if(!validId(value))fail(404,'Entry not found.');
    return await one(c,`SELECT o.* FROM nuttracker_orgasms o JOIN users u ON u.id=o.user_id
      WHERE o.id=$1 AND u.deleted_at IS NULL`,[value]) || fail(404,'Entry not found.');
  }
  async function form(c,u) {
    const mascot={ki:'PornLizardKi',warren:'PornLizardWarren',taylor:'PornLizardTaylor'}[u.mascot] || 'PornLizardKi';
    return {
      pornlizard:await one(c,`SELECT ${USER_COLUMNS} FROM users WHERE username=$1 AND deleted_at IS NULL`,[mascot]) || null,
      friends:await rows(c,`SELECT DISTINCT u.id,u.username FROM friendships f JOIN users u
        ON u.id=CASE WHEN f.sender_id=$1 THEN f.receiver_id ELSE f.sender_id END
        WHERE (f.sender_id=$1 OR f.receiver_id=$1) AND f.confirmed=true AND u.deleted_at IS NULL ORDER BY u.username,u.id`,[u.id]),
      recent_setters:await rows(c,`SELECT u.id,u.username FROM past_links p JOIN users u ON u.id=p.set_by_id
        WHERE p.user_id=$1 AND u.deleted_at IS NULL GROUP BY u.id,u.username ORDER BY MAX(p.id) DESC LIMIT 10`,[u.id]),
    };
  }
  async function read(c,op,input) {
    if(op==='entries') {
      const u=input.username==null ? null : await user(c,input.username,true);
      const page=pageNumber(input.page);
      const list=await rows(c,`SELECT o.* FROM nuttracker_orgasms o JOIN users u ON u.id=o.user_id
        WHERE u.deleted_at IS NULL AND ($1::bigint IS NULL OR o.user_id=$1) ORDER BY o.created_at DESC,o.id DESC LIMIT 101 OFFSET $2`,[u?.id??null,(page-1)*100]);
      return {user:u,entries:list.slice(0,100),page,has_more:list.length>100};
    }
    if(op==='entry') {
      const o=await entry(c,input.entry_id);
      if(input.edit) {const {u}=await actor(c,input);if(!same(o.user_id,u.id))fail(403,'Not authorized.');return {entry:o,...await form(c,u)};}
      return {entry:o};
    }
    if(op==='form') {const {u}=await actor(c,input);return form(c,u);}
    const u=await user(c,input.username,true);
    const nnn_enabled=await enabled(c);
    const current=nnn_enabled ? await currentPledge(c,u.id) : null;
    if(op==='pledge-status')return {nnn_enabled,current};
    if(op==='pledges') {
      if(!nnn_enabled)fail(403,'NNN is not currently enabled.');
      const pledges=await rows(c,'SELECT * FROM nut_pledges WHERE user_id=$1 ORDER BY year DESC,created_at DESC,id DESC',[u.id]);
      return {user:u,current,pledges,past_links:await rows(c,'SELECT * FROM past_links WHERE id=ANY($1::bigint[])',[pledges.map(p=>p.past_link_id).filter(Boolean)])};
    }
    if(op==='statistics') {
      // Match the existing profile chart: UTC midnight seven days ago through
      // today, with zero-filled days. Keep reads in one consistent snapshot.
      const days=await rows(c,`SELECT d.day::date::text AS day,count(o.id)::integer AS count
        FROM generate_series(date_trunc('day',CURRENT_TIMESTAMP)-INTERVAL '7 days',date_trunc('day',CURRENT_TIMESTAMP),INTERVAL '1 day') d(day)
        LEFT JOIN nuttracker_orgasms o ON o.user_id=$1 AND o.created_at>=d.day AND o.created_at>date_trunc('day',CURRENT_TIMESTAMP)-INTERVAL '7 days' AND o.created_at<d.day+INTERVAL '1 day'
          AND o.created_at<=CURRENT_TIMESTAMP GROUP BY d.day ORDER BY d.day`,[u.id]);
      const caused=await one(c,`SELECT count(*)::integer AS count FROM nuttracker_orgasms WHERE
        $2='gray' OR (caused_by_user_id=$1 AND caused_by_user_id<>user_id)`,[u.id,u.username]);
      return {nnn_enabled,current,days,total:days.reduce((sum,d)=>sum+d.count,0),caused:caused.count};
    }
    fail(404,'Unknown operation.');
  }
  async function mutate(c,op,input,u,effects) {
    if(op.startsWith('entry-')) {
      if(op==='entry-create') {
        const attrs=attributes(input);
        const caused=input.caused_by==null || input.caused_by==='' ? null : await user(c,input.caused_by,true);
        const recent=await one(c,"SELECT id FROM nuttracker_orgasms WHERE user_id=$1 AND created_at>CURRENT_TIMESTAMP-INTERVAL '5 minutes' LIMIT 1",[u.id]);
        if(recent)fail(422,"You're cumming too fast!");
        const o=await one(c,`INSERT INTO nuttracker_orgasms(user_id,caused_by_user_id,rating,is_ruined,created_at,updated_at)
          VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,[u.id,caused?.id??null,attrs.rating,attrs.is_ruined]);
        if(await enabled(c))await c.query(`UPDATE nut_pledges SET failed_on=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
          WHERE user_id=$1 AND year=EXTRACT(YEAR FROM CURRENT_TIMESTAMP) AND failed_on IS NULL`,[u.id]);
        if(caused) {
          await c.query(`INSERT INTO notifications(user_id,notification_type,text,link,created_at,updated_at)
            VALUES($1,6,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,[caused.id,`${u.username} attributed an orgasm to you!`,`/users/${u.username}`]);
          effects.notifications.push(caused.id);
        }
        return {entry:o};
      }
      const o=await entry(c,input.entry_id);
      if(!same(o.user_id,u.id))fail(403,'Not authorized.');
      if(op==='entry-delete') {await c.query('DELETE FROM nuttracker_orgasms WHERE id=$1',[o.id]);return {entry_id:o.id};}
      const attrs=attributes(input);
      // Editing a rating must not count as creating another entry or rewrite
      // attribution, timestamps, owner, or a permanently failed pledge.
      return {entry:await one(c,'UPDATE nuttracker_orgasms SET rating=$2,is_ruined=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[o.id,attrs.rating,attrs.is_ruined])};
    }
    if(!await enabled(c))fail(403,'NNN is not currently enabled.');
    if(text(input.username)!==u.username)fail(403,'Not authorized.');
    const current=await currentPledge(c,u.id);
    if(op==='pledge-create') {
      if(current)return {pledge:current};
      if(input.signature!==u.username)fail(422,'Username must be signed exactly!');
      return {pledge:await one(c,`INSERT INTO nut_pledges(user_id,year,created_at,updated_at)
        VALUES($1,EXTRACT(YEAR FROM CURRENT_TIMESTAMP),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,[u.id])};
    }
    if(!current)return {pledge:null};
    return {pledge:await one(c,`UPDATE nut_pledges SET failed_on=COALESCE(failed_on,CURRENT_TIMESTAMP),
      updated_at=CASE WHEN failed_on IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE id=$1 RETURNING *`,[current.id])};
  }
  return async (op,input={}) => {
    if(!input || typeof input!=='object' || Array.isArray(input))fail(400,'Invalid request.');
    if(!READS.has(op) && !WRITES.has(op))fail(404,'Unknown operation.');
    const c=await pool.connect();
    try {
      await c.query(READS.has(op) && !['form','entry'].includes(op) ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN');
      await c.query("SET LOCAL lock_timeout='3s'");
      await c.query("SET LOCAL timezone='UTC'");
      if(READS.has(op)) {const result=await read(c,op,input);await c.query('COMMIT');return result;}
      const key=input.request_key;
      if(typeof key!=='string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(key))fail(422,'Request key required.');
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['tracker:'+key]);
      const {u}=await actor(c,input);
      const digest=createHash('sha256').update(JSON.stringify(canonical({...input,operation:op}))).digest('hex');
      const previous=await one(c,'SELECT payload_digest,result FROM node_tracker_events WHERE request_key=$1',[key]);
      if(previous) {if(previous.payload_digest!==digest)fail(409,'Request key reused for different content.');await c.query('COMMIT');return previous.result;}
      const effects={notifications:[]};
      const result=await mutate(c,op,input,u,effects);
      await c.query(`INSERT INTO node_tracker_events(request_key,payload_digest,operation,user_id,result,effects,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,[key,digest,op,u.id,JSON.stringify(result),JSON.stringify(effects)]);
      await c.query('COMMIT');return result;
    } catch(error) {await c.query('ROLLBACK');throw error;} finally {c.release();}
  };
}
