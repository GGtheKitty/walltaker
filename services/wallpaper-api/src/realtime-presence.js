import {PRESENCE_TTL as TTL, presenceKey} from './presence-leases.js';
const JOIN = `redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3]/1000-ARGV[2])
 local was_empty = redis.call('ZCARD', KEYS[1]) == 0
 redis.call('ZADD', KEYS[1], ARGV[3]/1000, ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[2])
 if was_empty then return 1 else return 0 end`;
const LEAVE = `local pruned = redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3]/1000-ARGV[2])
 local removed = redis.call('ZREM', KEYS[1], ARGV[1])
 if removed+pruned > 0 and redis.call('ZCARD', KEYS[1]) == 0 then return 1 else return 0 end`;
export const VIEWER_EXPIRATIONS = 'node:viewer:v2:expirations';
const VIEW = `local stale = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', ARGV[3]-ARGV[4]*1000)
 for _, token in ipairs(stale) do
  redis.call('ZREM', KEYS[1], token); redis.call('HDEL', KEYS[2], token); redis.call('ZREM', KEYS[3], token)
 end
 if ARGV[2] == '' then
  redis.call('ZREM', KEYS[1], ARGV[1]); redis.call('HDEL', KEYS[2], ARGV[1]); redis.call('ZREM', KEYS[3], ARGV[1])
 elseif ARGV[2] == 'heartbeat' then
  if redis.call('HEXISTS', KEYS[2], ARGV[1]) == 1 then redis.call('ZADD', KEYS[3], ARGV[3], ARGV[1]) end
 else
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[1]); redis.call('HSET', KEYS[2], ARGV[1], ARGV[2]); redis.call('ZADD', KEYS[3], ARGV[3], ARGV[1])
 end
 for i=1,3 do redis.call('EXPIRE', KEYS[i], ARGV[4]) end
 local earliest = redis.call('ZRANGE', KEYS[3], 0, 0, 'WITHSCORES')
 if #earliest > 0 then redis.call('ZADD', KEYS[4], earliest[2]+ARGV[4]*1000, ARGV[5])
 else redis.call('ZREM', KEYS[4], ARGV[5]) end
 local latest = redis.call('ZREVRANGE', KEYS[1], 0, 0)
 if #latest == 0 then return '' end
 return redis.call('HGET', KEYS[2], latest[1]) or ''`;

export function clientIdentity(data = {}) {
  return [data.client, data.user_agent, data.userAgent, data.walltaker_client, data.walltakerClient]
    .find((value) => typeof value === 'string' && value.trim())?.slice(0, 255);
}
export function headerIdentity(headers = {}) {
  return [headers['user-agent'], headers.joihow, headers.user_agent,
    headers['wallpaper-engine-client'] && `Wallpaper-Engine-Client/${headers['wallpaper-engine-client']}`]
    .filter((value) => typeof value === 'string' && value.trim()).join(' ').slice(0, 255) || null;
}

export function createRealtimePresence({ pool, redis, queue, now=Date.now }) {
  const key = presenceKey;
  const notify = async (row) => {
    if (!row) return;
    await queue.enqueue(`presence-link:${row.id}`);
    await queue.enqueue(`user:${row.username}`);
  };
  const linkOwner = async (id) => (await pool.query(`SELECT l.id, u.username FROM links l
    JOIN users u ON u.id=l.user_id WHERE l.id=$1 AND u.deleted_at IS NULL`, [id])).rows[0];
  let legacyCursor=0, legacyComplete=false;
  const service = {
    async join(id, token, identity) {
      const wasOffline = await redis.eval(JOIN, { keys: [key(id)], arguments: [token, String(TTL), String(now())] });
      try {
        const row = (await pool.query(`UPDATE links l SET
          live_client_started_at=CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE live_client_started_at END,
          last_ping_user_agent=$3, updated_at=CURRENT_TIMESTAMP
          FROM users u WHERE l.id=$1 AND u.id=l.user_id AND u.deleted_at IS NULL RETURNING l.id,u.username`,
        [id, wasOffline === 1, identity])).rows[0];
        if (!row) { await redis.zRem(key(id), token); return false; }
        await notify(row);
        return true;
      } catch (error) { await redis.zRem(key(id), token); throw error; }
    },
    async leave(id, token) {
      const offline = await redis.eval(LEAVE, { keys: [key(id)], arguments: [token, String(TTL), String(now())] });
      if (offline) await notify(await linkOwner(id));
    },
    async heartbeat(links, userId, connectionId) {
      for (const {id, token} of links) {
        const online = await redis.eval(JOIN, {keys:[key(id)],arguments:[token,String(TTL),String(now())]});
        if (online === 1) { const row=await linkOwner(id); if(row) await notify(row); else await redis.zRem(key(id),token); }
      }
      if (userId) await service.view(userId, connectionId, 'heartbeat');
    },
    async sweep() {
      const users = await redis.zRangeByScore(VIEWER_EXPIRATIONS, 0, now(), {LIMIT:{offset:0,count:100}});
      // A bounded first pass also clears viewing IDs left by older deployments
      // which did not register expiring viewer leases.
      if(!legacyComplete) {
        const rows=(await pool.query('SELECT id FROM users WHERE id>$1 AND viewing_link_id IS NOT NULL ORDER BY id LIMIT 100',[legacyCursor])).rows;
        if(rows.length) legacyCursor=rows.at(-1).id;
        legacyComplete=rows.length<100;
        users.push(...rows.map(row=>String(row.id)));
      }
      for (const userId of new Set(users)) await service.view(userId, '', null);
    },
    async announce(id, identity) {
      if (!identity) return;
      const row = (await pool.query(`UPDATE links l SET last_ping_user_agent=$2,updated_at=CURRENT_TIMESTAMP
        FROM users u WHERE l.id=$1 AND u.id=l.user_id AND u.deleted_at IS NULL RETURNING l.id,u.username`, [id, identity])).rows[0];
      await notify(row);
    },
    async poll(id, headers) {
      const identity = headerIdentity(headers);
      const row = (await pool.query(`UPDATE links l SET last_ping=CURRENT_TIMESTAMP,
        last_ping_user_agent=COALESCE($2,l.last_ping_user_agent),updated_at=CURRENT_TIMESTAMP
        FROM users u WHERE l.id=$1 AND u.id=l.user_id AND u.deleted_at IS NULL RETURNING l.id,u.username`, [id, identity])).rows[0];
      await notify(row);
    },
    async view(userId, connectionId, linkId) {
      if (!userId) return;
      const client = await pool.connect();
      let before, after, username;
      try {
        await client.query('BEGIN');
        const user = (await client.query('SELECT id,username,viewing_link_id FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [userId])).rows[0];
        if (!user) { await client.query('ROLLBACK'); await redis.zRem(VIEWER_EXPIRATIONS, String(userId)); return; }
        if (linkId && linkId !== 'heartbeat' && !(await client.query(`SELECT l.id FROM links l JOIN users u ON u.id=l.user_id
          WHERE l.id=$1 AND u.deleted_at IS NULL`, [linkId])).rowCount) { await client.query('ROLLBACK'); return; }
        before = user.viewing_link_id; username = user.username;
        after = await redis.eval(VIEW, { keys: [`node:viewer:v2:${userId}:order`, `node:viewer:v2:${userId}:links`, `node:viewer:v2:${userId}:leases`, VIEWER_EXPIRATIONS],
          arguments: [connectionId, linkId ? String(linkId) : '', String(now()), String(TTL), String(userId)] });
        // Deleted links must not be resurrected by another tab's stale entry.
        if (after && !(await client.query('SELECT id FROM links WHERE id=$1', [after])).rowCount) after = '';
        await client.query('UPDATE users SET viewing_link_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [userId, after || null]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      if (String(before ?? '') === String(after ?? '')) return;
      for (const id of new Set([before, after].filter(Boolean))) await queue.enqueue(`viewers:${id}`);
      await queue.enqueue('dashboard-viewers:all');
      await queue.enqueue(`user:${username}`);
    },
  };
  return service;
}

export function startPresenceCleanup(presence, {interval=30000,logger=console}={}) {
 let running,stopped=false;
 const timer=setInterval(()=>{if(stopped||running)return;running=presence.sweep().catch(error=>logger.warn('Presence cleanup failed: '+(error.code || error.name))).finally(()=>{running=null;});},interval);
 timer.unref();
 return async()=>{stopped=true;clearInterval(timer);await running;};
}
