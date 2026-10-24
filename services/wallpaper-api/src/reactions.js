import { createHash, randomUUID } from 'node:crypto';
import { CommandError } from './updates.js';

const types = ['horny', 'came', 'disgust', 'ok'];
const phrases = ['loved your post!', 'came to your post!', 'did not like your post.', 'says thanks'];
const comments = ['loved it!', 'came to it!', 'hated it.', 'liked it'];
const validId = (value) => /^\d{1,19}$/.test(String(value)) && BigInt(value) > 0n && BigInt(value) <= 9223372036854775807n;

export function createReactionWriter(pool) {
  return async (input) => {
    if (!input || typeof input !== 'object') throw new CommandError(400, 'Invalid reaction command.');
    const type = input.type === '' ? null : input.type;
    const index = type == null ? null : (Number.isInteger(type) && type >= 0 && type < 4 ? type : types.indexOf(type));
    if (index === -1 || (type != null && index == null)) throw new CommandError(400, 'type must be "horny", "disgust", "came", or "ok"');
    const text = input.text ?? '';
    if (typeof text !== 'string' || Array.from(text).length > 255) {
      throw new CommandError(400, 'Bad request body, something with the response you sent looks malicious.');
    }
    const key = input.request_key ?? randomUUID();
    if (!validId(input.link_id) || typeof key !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(key) ||
        (input.owner_id != null && !validId(input.owner_id))) throw new CommandError(400, 'Invalid reaction command.');
    const command = { link_id: String(input.link_id), type: index, text,
      owner_id: input.owner_id == null ? null : String(input.owner_id) };
    const digest = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`reaction:${key}`]);
      const previous = (await client.query('SELECT id, link_id, payload_digest FROM node_reaction_events WHERE request_key = $1', [key])).rows[0];
      if (previous) {
        if (previous.payload_digest !== digest) throw new CommandError(409, 'Request key already used for a different reaction.');
        await client.query('COMMIT');
        return { event_id: previous.id, link_id: previous.link_id, replayed: true };
      }
      const link = (await client.query(`SELECT l.id, l.user_id, l.set_by_id, l.post_url FROM links l
        JOIN users u ON u.id = l.user_id WHERE l.id = $1 AND u.deleted_at IS NULL FOR UPDATE OF l`, [command.link_id])).rows[0];
      if (!link) throw new CommandError(404, 'This link does not exist.');
      if (command.owner_id != null && command.owner_id !== String(link.user_id)) throw new CommandError(403, 'Bad API key.');
      if (input.expected_post_url !== undefined && link.post_url !== input.expected_post_url) {
        throw new CommandError(409, 'The wallpaper changed before this reaction. Please reload and try again.');
      }
      // Serialize tracker changes across all of this owner's wallpaper links.
      // Keep FK key shares compatible when two owners notify each other.
      const owner = (await client.query('SELECT id, username FROM users WHERE id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE', [link.user_id])).rows[0];
      if (!owner) throw new CommandError(404, 'This link does not exist.');
      const commentIds = [];
      let notificationId = null;
      if (index != null) {
        if (link.set_by_id != null) {
          const notification = await client.query(`INSERT INTO notifications
            (user_id, notification_type, text, link, created_at, updated_at)
            VALUES ($1, 3, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
          [link.set_by_id, Array.from(`${owner.username} ${phrases[index]} "${text}"`).slice(0, 255).join(''), `/links/${link.id}`]);
          notificationId = notification.rows[0].id;
        }
        for (const content of [`> ${comments[index]} ${link.post_url || ''}`, text]) {
          if (!content.trim()) continue;
          const result = await client.query(`INSERT INTO comments (user_id, link_id, content, created_at, updated_at)
            VALUES ($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`, [link.user_id, link.id, content]);
          commentIds.push(result.rows[0].id);
        }
      }
      if (index === 1) {
        const recent = (await client.query('SELECT MAX(created_at) AS latest FROM nuttracker_orgasms WHERE user_id = $1', [link.user_id])).rows[0].latest;
        const time = (await client.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now;
        const recorded = !recent || new Date(recent).getTime() <= new Date(time).getTime() - 300000;
        if (recorded) await client.query(`INSERT INTO nuttracker_orgasms
          (user_id, caused_by_user_id, rating, is_ruined, created_at, updated_at)
          VALUES ($1,$2,3,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [link.user_id, link.set_by_id]);
        const setting = (await client.query("SELECT value FROM site_settings WHERE key = 'nnn_enabled'")).rows[0]?.value;
        const enabled = setting != null && setting !== '' && !['0', 'f', 'false', 'off'].includes(setting.toLowerCase());
        if (enabled) await client.query(`UPDATE nut_pledges SET
          failed_on = CASE WHEN $2 THEN COALESCE(failed_on, CURRENT_TIMESTAMP) ELSE failed_on END,
          past_link_id = (SELECT id FROM past_links WHERE link_id = $1 ORDER BY id DESC LIMIT 1),
          updated_at = CURRENT_TIMESTAMP WHERE user_id = $3 AND year = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)`,
        [link.id, recorded, link.user_id]);
      }
      if (index === 2) {
        // PastLink's Rails dependent:nullify callback must accompany deletion.
        await client.query(`UPDATE nut_pledges SET past_link_id = NULL WHERE past_link_id IN
          (SELECT id FROM past_links WHERE link_id = $1 AND post_url IS NOT DISTINCT FROM $2)`, [link.id, link.post_url]);
        await client.query('DELETE FROM past_links WHERE link_id = $1 AND post_url IS NOT DISTINCT FROM $2', [link.id, link.post_url]);
        const prior = (await client.query(`SELECT e621_post_id, post_url, post_thumbnail_url FROM past_links
          WHERE link_id = $1 AND post_url IS NOT NULL AND post_url IS DISTINCT FROM $2
          ORDER BY created_at DESC, id DESC LIMIT 1`, [link.id, link.post_url])).rows[0];
        await client.query(`UPDATE links SET e621_post_id = $2, post_url = $3, post_thumbnail_url = $4 WHERE id = $1`,
          [link.id, prior?.e621_post_id ?? null, prior?.post_url ?? null, prior?.post_thumbnail_url ?? null]);
      }
      await client.query(`UPDATE links SET response_type = $2, response_text = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [link.id, index, text]);
      const event = (await client.query(`INSERT INTO node_reaction_events
        (request_key, payload_digest, link_id, comment_ids, notification_id, history_changed, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,
      [key, digest, link.id, commentIds, notificationId, index === 2])).rows[0];
      await client.query('COMMIT');
      return { event_id: event.id, link_id: link.id, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  };
}
