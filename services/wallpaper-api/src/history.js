import { CommandError } from './updates.js';

export function createHistoryReader(pool) {
  return async ({ userId, kind = 'received', limit = '50' }) => {
    if (!/^\d{1,19}$/.test(String(userId)) || BigInt(userId) > 9223372036854775807n ||
        !['received', 'sent'].includes(kind) || !/^\d+$/.test(String(limit)) || Number(limit) < 1 || Number(limit) > 50) {
      throw new CommandError(422, 'Invalid history query.');
    }
    const user = await pool.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
    if (!user.rowCount) throw new CommandError(404, 'This user does not exist.');
    const column = kind === 'sent' ? 'set_by_id' : 'user_id';
    return (await pool.query(`SELECT p.id, p.link_id, p.user_id, p.set_by_id, p.e621_post_id,
      p.post_url, p.post_thumbnail_url, p.tags, p.created_at, p.updated_at,
      setter.username AS set_by_username FROM past_links p LEFT JOIN users setter ON setter.id = p.set_by_id
      WHERE p.${column} = $1 ORDER BY p.id DESC LIMIT $2`, [userId, Number(limit)])).rows;
  };
}
