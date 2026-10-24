import { createHash } from 'node:crypto';

export class CommandError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const id = (value) => typeof value === 'string' || typeof value === 'number'
  ? /^\d{1,19}$/.test(String(value)) && BigInt(value) > 0n && BigInt(value) <= 9223372036854775807n : false;
const policyFields = ['user_id', 'blacklist', 'theme', 'min_score', 'friends_only', 'never_expires', 'expires'];
const policyValue = (key, value) => key === 'user_id' ? String(value) :
  key === 'expires' && value != null ? new Date(value).toISOString() : value;

function normalize(input) {
  if (!input || !id(input.link_id) || !id(input.post_id) ||
      (input.set_by_id != null && !id(input.set_by_id)) ||
      (input.ahoy_visit_id != null && !id(input.ahoy_visit_id)) ||
      typeof input.request_key !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(input.request_key) ||
      typeof input.post_url !== 'string' || !/^https:\/\/static\d*\.e621\.net\/data\//.test(input.post_url) ||
      input.post_url.length > 4096 ||
      (input.post_thumbnail_url != null && (typeof input.post_thumbnail_url !== 'string' || !input.post_thumbnail_url.startsWith('https://'))) ||
      typeof input.post_description !== 'string' || typeof input.tags !== 'string' ||
      typeof input.count_self !== 'boolean' || !input.expected_policy ||
      policyFields.some((key) => !(key in input.expected_policy))) {
    throw new CommandError(422, 'Invalid wallpaper command.');
  }
  try {
    return {
      request_key: input.request_key, link_id: String(input.link_id), post_id: String(input.post_id),
      set_by_id: input.set_by_id == null ? null : String(input.set_by_id),
      ahoy_visit_id: input.ahoy_visit_id == null ? null : String(input.ahoy_visit_id),
      post_url: input.post_url, post_thumbnail_url: input.post_thumbnail_url ?? null,
      post_description: input.post_description, tags: input.tags, count_self: input.count_self,
      expected_policy: Object.fromEntries(policyFields.map((key) => [key, policyValue(key, input.expected_policy[key])])),
      ...(input.activity!=null ? {activity:input.activity} : {}),
    };
  } catch {
    throw new CommandError(422, 'Invalid wallpaper policy.');
  }
}

export function createWallpaperWriter(pool, { automation = false, verifySelection, enqueueAutomation, activity = false, recordActivity } = {}) {
  return async (input, context = {}) => {
    const command = normalize(input);
    const digest = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [command.request_key]);
      const previous = (await client.query('SELECT id, link_id, past_link_id, payload_digest FROM node_wallpaper_events WHERE request_key = $1', [command.request_key])).rows[0];
      if (previous) {
        if (previous.payload_digest !== digest) throw new CommandError(409, 'Request key already used for a different wallpaper.');
        await client.query('COMMIT');
        return { event_id: previous.id, link_id: previous.link_id, past_link_id: previous.past_link_id, replayed: true };
      }
      const row = (await client.query(`SELECT l.id, l.user_id, l.blacklist, l.theme, l.min_score,
        l.friends_only, l.never_expires, l.expires FROM links l
        JOIN users u ON u.id = l.user_id WHERE l.id = $1 AND u.deleted_at IS NULL FOR UPDATE OF l`, [command.link_id])).rows[0];
      if (!row) throw new CommandError(404, 'This link does not exist.');
      if (policyFields.some((key) => policyValue(key, row[key]) !== command.expected_policy[key])) {
        throw new CommandError(409, 'Link settings changed while selecting this wallpaper. Please retry.');
      }
      if (context.guard) await verifySelection(client, command.link_id, context.guard);
      if (command.activity!=null) {
        if(!activity)throw new CommandError(503,'Activity persistence is not configured.');
        if(!command.activity || typeof command.activity!=='object' || Array.isArray(command.activity) ||
          String(command.activity.actor_id)!==command.set_by_id)throw new CommandError(403,'Activity actor must match the wallpaper setter.');
        await recordActivity(client,command.activity,{kind:'set_wallpaper',linkId:command.link_id});
      }
      if (command.set_by_id != null) {
        const setter = await client.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [command.set_by_id]);
        if (!setter.rowCount) throw new CommandError(422, 'The setter is no longer active.');
      }
      await client.query(`UPDATE links SET e621_post_id = $2, post_url = $3, post_thumbnail_url = $4,
        post_description = $5, set_by_id = $6, response_type = NULL, response_text = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [command.link_id, command.post_id, command.post_url, command.post_thumbnail_url, command.post_description, command.set_by_id]);
      const past = (await client.query(`INSERT INTO past_links
        (link_id, user_id, e621_post_id, post_url, post_thumbnail_url, set_by_id, tags, ahoy_visit_id, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,
      [command.link_id, row.user_id, command.post_id, command.post_url, command.post_thumbnail_url,
        command.set_by_id, command.tags, command.ahoy_visit_id])).rows[0];
      if (command.set_by_id != null && (command.count_self || command.set_by_id !== String(row.user_id))) {
        await client.query('UPDATE users SET set_count = COALESCE(set_count, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [command.set_by_id]);
      }
      const event = (await client.query(`INSERT INTO node_wallpaper_events
        (request_key, payload_digest, link_id, past_link_id, created_at, updated_at)
        VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,
      [command.request_key, digest, command.link_id, past.id])).rows[0];
      if (automation) await enqueueAutomation(client, { command, pastId: past.id, context });
      await client.query('COMMIT');
      return { event_id: event.id, link_id: command.link_id, past_link_id: past.id, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}
