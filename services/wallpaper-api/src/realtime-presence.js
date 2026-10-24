const TTL = 7 * 24 * 60 * 60;
const JOIN = `local was_empty = redis.call('SCARD', KEYS[1]) == 0
  redis.call('SADD', KEYS[1], ARGV[1]); redis.call('EXPIRE', KEYS[1], ARGV[2])
  if was_empty then return 1 else return 0 end`;
const LEAVE = `local removed = redis.call('SREM', KEYS[1], ARGV[1])
  if removed > 0 and redis.call('SCARD', KEYS[1]) == 0 then return 1 else return 0 end`;
const VIEW = `if ARGV[2] == '' then
    redis.call('ZREM', KEYS[1], ARGV[1]); redis.call('HDEL', KEYS[2], ARGV[1])
  else
    redis.call('ZADD', KEYS[1], ARGV[3], ARGV[1]); redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
  end
  redis.call('EXPIRE', KEYS[1], ARGV[4]); redis.call('EXPIRE', KEYS[2], ARGV[4])
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

export function createRealtimePresence({ pool, redis, queue }) {
  const key = (id) => `link:${id}:ws_clients`;
  const notify = async (row) => {
    if (!row) return;
    await queue.enqueue(`presence-link:${row.id}`);
    await queue.enqueue(`user:${row.username}`);
  };
  const linkOwner = async (id) => (await pool.query(`SELECT l.id, u.username FROM links l
    JOIN users u ON u.id=l.user_id WHERE l.id=$1 AND u.deleted_at IS NULL`, [id])).rows[0];
  return {
    async join(id, token, identity) {
      const wasOffline = await redis.eval(JOIN, { keys: [key(id)], arguments: [token, String(TTL)] });
      try {
        const row = (await pool.query(`UPDATE links l SET
          live_client_started_at=CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE live_client_started_at END,
          last_ping_user_agent=$3, updated_at=CURRENT_TIMESTAMP
          FROM users u WHERE l.id=$1 AND u.id=l.user_id AND u.deleted_at IS NULL RETURNING l.id,u.username`,
        [id, wasOffline === 1, identity])).rows[0];
        if (!row) { await redis.sRem(key(id), token); return false; }
        await notify(row);
        return true;
      } catch (error) { await redis.sRem(key(id), token); throw error; }
    },
    async leave(id, token) {
      const offline = await redis.eval(LEAVE, { keys: [key(id)], arguments: [token] });
      if (offline) await notify(await linkOwner(id));
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
        if (!user) { await client.query('ROLLBACK'); return; }
        if (linkId && !(await client.query(`SELECT l.id FROM links l JOIN users u ON u.id=l.user_id
          WHERE l.id=$1 AND u.deleted_at IS NULL`, [linkId])).rowCount) { await client.query('ROLLBACK'); return; }
        before = user.viewing_link_id; username = user.username;
        after = await redis.eval(VIEW, { keys: [`node:viewer:${userId}:order`, `node:viewer:${userId}:links`],
          arguments: [connectionId, linkId ? String(linkId) : '', String(Date.now()), String(TTL)] });
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
}
