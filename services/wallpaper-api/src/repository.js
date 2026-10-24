const SELECT = `SELECT l.id, l.expires, l.terms, l.blacklist, l.post_url, l.post_thumbnail_url,
  l.created_at, l.updated_at, l.response_type, l.response_text, l.post_description,
  l.last_ping, l.last_ping_user_agent, l.friends_only, l.user_id, owner.username, setter.username AS set_by_username
  FROM links l JOIN users owner ON owner.id = l.user_id
  LEFT JOIN users setter ON setter.id = l.set_by_id
  WHERE owner.deleted_at IS NULL`;

export function createRepository(pool) {
  return {
    async findIdentifier(identifier) {
      if (!identifier || identifier.length > 255) return null;
      if (/^\d{1,19}$/.test(identifier) && BigInt(identifier) <= 9223372036854775807n) {
        const row = (await pool.query(`${SELECT} AND l.id = $1`, [identifier])).rows[0];
        if (row) return row;
      }
      return (await pool.query(`${SELECT} AND l.custom_url = $1`, [identifier])).rows[0] || null;
    },
    async find(id) {
      if (!/^\d{1,19}$/.test(id) || BigInt(id) > 9223372036854775807n) return null;
      return (await pool.query(`${SELECT} AND l.id = $1`, [id])).rows[0] || null;
    },
    async list({ onlyOnline, onlineIds, now }) {
      const params = [new Date(now)];
      let sql = `${SELECT} AND l.friends_only = false AND (l.expires > $1 OR l.never_expires = true)`;
      if (onlyOnline) {
        params.push(new Date(now - 60000), new Date(now - 1200000), onlineIds);
        sql += ` AND (l.last_ping > $2 OR
          (l.last_ping_user_agent LIKE '%widgetExtension%' AND l.last_ping > $3) OR l.id = ANY($4::bigint[]))`;
      }
      return (await pool.query(`${sql} LIMIT 100`, params)).rows;
    },
    async forUser(userId, now) {
      return (await pool.query(`${SELECT} AND l.user_id = $1
        AND (l.expires > $2 OR l.never_expires = true) ORDER BY l.id`, [userId, new Date(now)])).rows;
    },
    async health() { await pool.query('SELECT 1'); },
  };
}
