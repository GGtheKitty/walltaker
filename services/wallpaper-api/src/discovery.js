import { CommandError } from './updates.js';

const USER_FIELDS = 'id,username,details,created_at,updated_at,deleted_at,set_count,viewing_link_id,mascot,pervert';
const publicLink = `u.deleted_at IS NULL AND l.friends_only=false AND (l.never_expires=true OR l.expires>$1)`;
const onlineLink = `(l.id=ANY($2::bigint[]) OR l.last_ping>$1-INTERVAL '1 minute'
  OR (l.last_ping_user_agent LIKE '%widgetExtension%' AND l.last_ping>$1-INTERVAL '20 minutes'))`;
const validId = value => /^\d{1,18}$/.test(String(value)) && BigInt(value)>0n;
const reject = (status,message) => { throw new CommandError(status,message); };

export function parseSearch(input={}) {
  const query=input.query??'';
  if(typeof query!=='string' || query.length>256 || /[\u0000-\u001f\u007f]/.test(query)) reject(422,'Search must be at most 256 characters without control characters.');
  const selectors=[...new Set([...query.matchAll(/!([\w()]+)/g)].map(m=>m[1]))];
  const text=query.replace(/![\w()]+/g,'').trim();
  if(text.split(/\s+/).length>32 || selectors.length>16)reject(422,'Please use fewer search terms.');
  const rawPage=input.page??1;
  if(!/^\d{1,6}$/.test(String(rawPage)) || Number(rawPage)<1)reject(422,'Invalid page.');
  return {query,text,selectors,page:Number(rawPage),only_online:input.only_online===true || input.only_online==='1'};
}

// Every result set is selected again in PostgreSQL. Only aggregate counts are
// cached: no cached IDs or documents can outlive visibility/presence changes.
export function createDiscovery({pool,store,cache,now=Date.now}) {
  const rows=async(c,sql,args=[]) => (await c.query(sql,args)).rows;
  const one=async(c,sql,args=[]) => (await rows(c,sql,args))[0];
  async function viewer(c,id) {
    if(!validId(id))reject(403,'Please log in.');
    const user=await one(c,'SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL',[id]);
    return user || reject(403,'Please log in.');
  }
  async function recent(c,time) {
    return rows(c,`SELECT p.* FROM past_links p JOIN links l ON l.id=p.link_id JOIN users u ON u.id=l.user_id
      WHERE ${publicLink} AND p.user_id=l.user_id ORDER BY p.id DESC LIMIT 6`,[time]);
  }
  async function viewers(c,time) {
    return rows(c,`SELECT v.id,v.username,v.deleted_at,v.viewing_link_id FROM users v JOIN links l ON l.id=v.viewing_link_id
      JOIN users u ON u.id=l.user_id WHERE v.deleted_at IS NULL AND ${publicLink} ORDER BY v.id LIMIT 200`,[time]);
  }
  async function statistics(c,time) {
    const day=time.toISOString().slice(0,10);
    const key='node:discovery:statistics:v1:'+day;
    const cached=await cache?.get(key);
    if(cached && Number.isSafeInteger(cached.total) && cached.total>=0 && Array.isArray(cached.days) && cached.days.length===8 &&
      cached.days.every(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.day) && Number.isSafeInteger(row.count) && row.count>=0))return cached;
    const total=Number((await one(c,'SELECT count(*) FROM past_links')).count);
    const days=await rows(c,`SELECT to_char(d.day,'YYYY-MM-DD') AS day,count(p.id)::integer AS count
      FROM generate_series($1::date-7,$1::date,INTERVAL '1 day') d(day) LEFT JOIN past_links p
      ON p.created_at>=d.day AND p.created_at<d.day+INTERVAL '1 day' AND p.created_at<=$2
      GROUP BY d.day ORDER BY d.day`,[day,time]);
    const result={total,days};await cache?.set(key,result,30);return result;
  }
  async function dashboard(c,input,time,online) {
    const clients=await rows(c,"SELECT * FROM wallpaper_clients WHERE section IN ('clients','companion_apps') ORDER BY position,id");
    if(input.viewer_id==null)return {clients};
    const user=await viewer(c,input.viewer_id);
    const stats=await statistics(c,time);
    const day=time.toISOString().slice(0,10);
    return {clients,recent_posts:await recent(c,time),viewers:await viewers(c,time),
      recent_scoop:await one(c,`SELECT s.* FROM scoops s JOIN users u ON u.id=s.user_id WHERE u.deleted_at IS NULL ORDER BY s.updated_at DESC,s.id DESC LIMIT 1`) || null,
      newest_user:await one(c,'SELECT id,username FROM users WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1') || null,
      today:await rows(c,`SELECT u.username,count(*)::integer AS total FROM past_links p JOIN users u ON u.id=p.user_id
        WHERE p.created_at>=$1::date AND p.created_at<$1::date+INTERVAL '1 day' AND u.deleted_at IS NULL
        GROUP BY u.id,u.username ORDER BY total DESC,u.id LIMIT 20`,[day]),
      total:stats.total,days:stats.days,
      your_total:Number((await one(c,'SELECT count(*) FROM past_links WHERE user_id=$1',[user.id])).count),
      online:Number((await one(c,`SELECT count(*) FROM links l JOIN users u ON u.id=l.user_id WHERE ${publicLink} AND ${onlineLink}`,[time,online])).count)};
  }
  async function browse(c,time,online) {
    const links=await rows(c,`SELECT l.* FROM links l JOIN users u ON u.id=l.user_id JOIN LATERAL
      (SELECT p.created_at FROM past_links p WHERE p.link_id=l.id ORDER BY p.created_at DESC,p.id DESC LIMIT 1) latest ON true
      WHERE ${publicLink} AND ${onlineLink}
      ORDER BY latest.created_at-COALESCE(u.set_count,0)*INTERVAL '6 seconds',l.id LIMIT 18`,[time,online]);
    const new_user_links=await rows(c,`SELECT l.* FROM links l JOIN users u ON u.id=l.user_id WHERE ${publicLink} AND ${onlineLink}
      AND u.created_at>=$1-INTERVAL '12 hours' AND u.created_at<=$1 ORDER BY RANDOM() LIMIT 3`,[time,online]);
    return {links,new_user_links};
  }
  async function search(c,input,time,online) {
    const parsed=parseSearch(input);
    // Build tsquery syntax from PostgreSQL-produced lexemes, never client text.
    // English stemming + OR + prefix matching preserves the site's PgSearch
    // contract; blacklist matches remain whole lexemes, without a prefix.
    const sql=`WITH q AS (
      SELECT COALESCE(string_agg(plainto_tsquery('simple',word)::text||':*',' | '),'')::tsquery AS positive,
        COALESCE(string_agg(plainto_tsquery('simple',word)::text,' | '),'')::tsquery AS negative
      FROM unnest(tsvector_to_array(to_tsvector('english',$3))) words(word)
    ), candidates AS (
      SELECT l.*,to_tsvector('english',concat_ws(' ',l.terms,l.theme,l.custom_url,l.response_text,l.post_description,u.username,
        regexp_replace(COALESCE(bio.content,u.details,''),'<[^>]*>',' ','g'))) AS document,
        (l.theme=ANY($4::text[]) OR EXISTS(SELECT 1 FROM kink_havers h JOIN kinks k ON k.id=h.kink_id
          WHERE h.user_id=l.user_id AND k.name=ANY($4::text[]))) AS interest_match
      FROM links l JOIN users u ON u.id=l.user_id LEFT JOIN LATERAL (
        SELECT p.content FROM profiles p JOIN users owner ON owner.id=p.user_id AND owner.deleted_at IS NULL
        WHERE p.id=u.profile_id OR p.user_id=u.id ORDER BY CASE WHEN p.id=u.profile_id THEN 0 ELSE 1 END,p.id LIMIT 1
      ) bio ON true WHERE ${publicLink} ${parsed.only_online?'AND '+onlineLink:'AND $2::bigint[] IS NOT NULL'}
    ), matches AS (
      SELECT c.*,ts_rank(c.document,q.positive) AS rank FROM candidates c CROSS JOIN q
      WHERE (c.interest_match OR c.document@@q.positive) AND NOT(to_tsvector('english',COALESCE(c.blacklist,''))@@q.negative)
    )`;
    const args=[time,online,parsed.text,parsed.selectors];
    const total=Number((await one(c,sql+' SELECT count(*) FROM matches',args)).count);
    const found=(parsed.page-1)*5>=total?[]:await rows(c,sql+' SELECT * FROM matches ORDER BY interest_match DESC,rank DESC,id LIMIT 5 OFFSET $5',[...args,(parsed.page-1)*5]);
    const links=found.map(({document,interest_match,rank,...link})=>link);
    return {query:parsed.query,page:parsed.page,only_online:parsed.only_online,total,has_next:parsed.page*5<total,links};
  }
  async function similar(c,input,time,online) {
    if(!validId(input.link_id))reject(404,'Link not found.');
    const source=await one(c,`SELECT l.id,l.user_id,l.theme,l.friends_only,l.never_expires,l.expires FROM links l JOIN users u ON u.id=l.user_id WHERE l.id=$1 AND u.deleted_at IS NULL`,[input.link_id]);
    if(!source)reject(404,'Link not found.');
    if(input.viewer_id!=null)await viewer(c,input.viewer_id);
    if(String(source.user_id)!==String(input.viewer_id)) {
      const master=input.viewer_id!=null && await one(c,'SELECT id FROM leashes WHERE pet_id=$1 AND master_id=$2',[source.user_id,input.viewer_id]);
      if(!master) {
        if(!source.never_expires && (!source.expires || new Date(source.expires)<=time))reject(403,'This link has expired.');
        if(source.friends_only && (input.viewer_id==null || !await one(c,`SELECT id FROM friendships WHERE confirmed=true AND
          ((sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)) LIMIT 1`,[source.user_id,input.viewer_id])))reject(403,'This link is for friends only.');
      }
    }
    const link=await one(c,`SELECT l.id FROM links l JOIN users u ON u.id=l.user_id WHERE ${publicLink} AND l.id<>$3
      ORDER BY CASE
        WHEN ${onlineLink} AND $4::text IS NOT NULL AND l.theme=$4 THEN 0
        WHEN ${onlineLink} AND EXISTS(SELECT 1 FROM kink_havers other JOIN kink_havers own ON own.kink_id=other.kink_id
          WHERE other.user_id=l.user_id AND own.user_id=$5) THEN 1
        WHEN ${onlineLink} THEN 2 ELSE 3 END,RANDOM() LIMIT 1`,[time,online,source.id,source.theme,source.user_id]);
    return {link_id:link?.id??null};
  }
  return async(operation,input={}) => {
    if(!input || typeof input!=='object' || Array.isArray(input))reject(400,'Invalid request.');
    if(operation==='search')parseSearch(input);
    const time=new Date(now());
    const online=operation==='dashboard' && input.viewer_id==null || ['recent','viewers'].includes(operation)?[]:await store.onlineIds();
    const c=await pool.connect();
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      let result;
      switch(operation) {
        case 'dashboard':result=await dashboard(c,input,time,online);break;
        case 'browse':result=await browse(c,time,online);break;
        case 'search':result=await search(c,input,time,online);break;
        case 'similar':result=await similar(c,input,time,online);break;
        case 'recent':result={recent_posts:await recent(c,time)};break;
        case 'viewers':result={viewers:await viewers(c,time)};break;
        default:reject(404,'Unknown discovery operation.');
      }
      result=await discoveryGraph(c,result);await c.query('COMMIT');return result;
    } catch(error) {await c.query('ROLLBACK');throw error;} finally {c.release();}
  };
}

export function createDiscoveryCache(redis) {
  return {
    async get(key) {const value=await redis.get(key);try {return value && value.length<65536?JSON.parse(value):null;}catch{return null;}},
    set:(key,value,seconds)=>redis.set(key,JSON.stringify(value),{EX:seconds}),
  };
}

// Associated records for existing card templates, shared with activity history.
export async function discoveryGraph(c,result) {
  const rows=async(c,sql,args=[]) => (await c.query(sql,args)).rows;
  const links=[...(result.links||[]),...(result.new_user_links||[])];
  const linkIds=[...new Set([...links.map(l=>l.id),...(result.viewers||[]).map(v=>v.viewing_link_id)])];
  const parentIds=[...new Set(links.map(l=>l.forked_from_id).filter(Boolean))];
  const parents=parentIds.length?await rows(c,'SELECT l.* FROM links l JOIN users u ON u.id=l.user_id WHERE l.id=ANY($1::bigint[]) AND u.deleted_at IS NULL',[parentIds]):[];
  const viewedIds=(result.viewers||[]).map(v=>v.viewing_link_id);
  const viewed=viewedIds.length?await rows(c,'SELECT * FROM links WHERE id=ANY($1::bigint[])',[viewedIds]):[];
  const userIds=[...new Set([...links,...parents,...viewed].map(l=>l.user_id).concat((result.recent_posts||[]).map(p=>p.user_id),result.recent_scoop?[result.recent_scoop.user_id]:[]))];
  const leashes=userIds.length?await rows(c,'SELECT id,pet_id,master_id,flair FROM leashes WHERE pet_id=ANY($1::bigint[])',[userIds]):[];
  const allUsers=[...new Set([...userIds,...leashes.map(l=>l.master_id)])];
  const users=allUsers.length?await rows(c,`SELECT ${USER_FIELDS} FROM users WHERE id=ANY($1::bigint[]) AND deleted_at IS NULL`,[allUsers]):[];
  const memberships=userIds.length?await rows(c,'SELECT * FROM kink_havers WHERE user_id=ANY($1::bigint[]) ORDER BY created_at,id',[userIds]):[];
  const kinkIds=[...new Set(memberships.map(h=>h.kink_id))];
  const kinks=kinkIds.length?await rows(c,'SELECT * FROM kinks WHERE id=ANY($1::bigint[])',[kinkIds]):[];
  const abilities=linkIds.length?await rows(c,'SELECT * FROM link_abilities WHERE link_id=ANY($1::bigint[]) ORDER BY id',[linkIds]):[];
  const latest=linkIds.length?await rows(c,'SELECT DISTINCT ON(link_id) * FROM past_links WHERE link_id=ANY($1::bigint[]) ORDER BY link_id,id DESC',[linkIds]):[];
  const clients=links.length?await rows(c,"SELECT * FROM wallpaper_clients WHERE match_text IS NOT NULL AND match_text<>'' ORDER BY position,id"):[];
  const decorations=linkIds.length?await rows(c,'SELECT link_id,emoji FROM emoji_link_decorations WHERE link_id=ANY($1::bigint[])',[linkIds]):[];
  return {...result,graph:{parents,viewed,users,leashes,memberships,kinks,abilities,latest,clients,decorations}};
}
