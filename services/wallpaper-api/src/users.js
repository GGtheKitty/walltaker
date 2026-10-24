import { createSerializer } from './payload.js';

export function createUserReader({ pool, repository, store, secretKeyBase, baseUrl }) {
  const serialize = createSerializer({ secretKeyBase, baseUrl });
  return async ({ username, viewerId, audience, now = Date.now() }) => {
    const user = (await pool.query(`SELECT id, username, set_count, is_reporter, is_cutie, is_supporter
      FROM users WHERE username = $1 AND deleted_at IS NULL`, [username])).rows[0];
    if (!user) return null;
    const viewer = viewerId == null ? null : (await pool.query(
      'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [viewerId])).rows[0];
    const self = audience ? audience === 'self' : !!viewer && String(viewer.id) === String(user.id);
    const friend = audience ? audience === 'friend' : !!viewer && !self && (await pool.query(`SELECT 1 FROM friendships
      WHERE confirmed = true AND ((sender_id = $1 AND receiver_id = $2) OR
      (sender_id = $2 AND receiver_id = $1)) LIMIT 1`, [user.id, viewer.id])).rowCount > 0;
    const rows = await repository.forUser(user.id, now);
    const connected = await store.connected(rows.map((row) => String(row.id)));
    const visible = rows.filter((row) => row.friends_only === false);
    const leash = (await pool.query(`SELECT l.flair, master.username FROM leashes l
      JOIN friendships f ON f.id = l.friendship_id JOIN users master ON master.id = l.master_id
      WHERE l.pet_id = $1 AND (f.sender_id = $1 OR f.receiver_id = $1)
      ORDER BY l.id LIMIT 1`, [user.id])).rows[0];
    const pets = (await pool.query(`SELECT pet.username FROM leashes l
      JOIN friendships f ON f.id = l.friendship_id JOIN users pet ON pet.id = l.pet_id
      WHERE l.master_id = $1 AND (f.sender_id = $1 OR f.receiver_id = $1) ORDER BY l.id`, [user.id])).rows;
    const payload = {
      username: user.username, id: Number(user.id), set_count: user.set_count,
      is_reporter: user.is_reporter, is_cutie: user.is_cutie, is_supporter: user.is_supporter,
      // User#api_payload uses the is_online scope, which counts a recent ping
      // even when the client omitted its user agent. Individual link payloads
      // retain the separate is_online? behavior in the shared serializer.
      online: rows.some((row) => (friend || row.friends_only === false) &&
        (connected.has(String(row.id)) || (row.last_ping != null && new Date(row.last_ping).getTime() >
          now - (row.last_ping_user_agent?.includes('widgetExtension') ? 1200000 : 60000)))),
      authenticated: audience ? audience !== 'anonymous' : !!viewer,
      links: visible.map((row) => serialize(row, { connected: connected.has(String(row.id)), now })),
      flair: leash?.flair || '', master: leash?.username || false, pets: pets.map((pet) => pet.username),
    };
    if (payload.authenticated) Object.assign(payload, { friend, self });
    return payload;
  };
}
