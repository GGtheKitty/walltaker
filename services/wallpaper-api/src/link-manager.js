import { createHash } from 'node:crypto';
import { CommandError } from './updates.js';
import { abilities, LinkValidationError, normalizeSettings, settingFields, validId } from './link-settings.js';
import { applyWizard } from './link-wizard.js';
import { exportLink } from './link-export.js';

const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const linkQuery = `SELECT l.* FROM links l JOIN users u ON u.id=l.user_id
  WHERE l.id=$1 AND u.deleted_at IS NULL`;

async function activeUser(client, actorId, surrenderId, write) {
  if (!validId(actorId)) throw new CommandError(403, 'Not authorized.');
  const user = (await client.query(`SELECT id, set_count, admin FROM users WHERE id=$1 AND deleted_at IS NULL${write ? ' FOR UPDATE' : ''}`, [actorId])).rows[0];
  if (!user) throw new CommandError(403, 'Not authorized.');
  if (write) {
    const surrender = (await client.query(`SELECT s.id FROM surrenders s JOIN friendships f ON f.id=s.friendship_id
      WHERE s.user_id=$1 AND s.pending IS NOT TRUE AND s.expires_at>CURRENT_TIMESTAMP
        AND s.accepted_consequences=true AND f.confirmed=true AND $2=false ORDER BY s.id LIMIT 1`, [actorId, user.admin === true])).rows[0];
    if (surrender && String(surrender.id) !== String(surrenderId)) throw new CommandError(403, 'This account is currently surrendered.');
    if (surrenderId != null && (!surrender || String(surrender.id) !== String(surrenderId))) throw new CommandError(403, 'The delegated session is no longer active.');
  }
  return user;
}

async function uniqueSlug(client, settings, id = null) {
  if (!settings.custom_url) return;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['link-slug:' + settings.custom_url]);
  const duplicate = await client.query(`SELECT l.id FROM links l JOIN users u ON u.id=l.user_id
    WHERE l.custom_url=$1 AND u.deleted_at IS NULL AND ($2::bigint IS NULL OR l.id<>$2) LIMIT 1`, [settings.custom_url, id]);
  if (duplicate.rowCount) throw new LinkValidationError({ custom_url: ['has already been taken'] });
}

async function updateSettings(client, link, settings, wizardPage) {
  const columns = [...settingFields];
  const values = columns.map((column) => settings[column]);
  if (wizardPage !== undefined) { columns.push('wizard_page'); values.push(wizardPage); }
  return (await client.query(`UPDATE links SET ${columns.map((column, index) => `${column}=$${index + 2}`).join(',')},
    updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [link.id, ...values])).rows[0];
}

async function enableAbility(client, id, ability) {
  if (!(await client.query('SELECT id FROM link_abilities WHERE link_id=$1 AND ability=$2', [id, ability])).rowCount) {
    await client.query(`INSERT INTO link_abilities (link_id,ability,created_at,updated_at)
      VALUES ($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [id, ability]);
  }
}

export function createLinkManager(pool, { baseUrl }) {
  return async (operation, input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CommandError(422, 'Invalid link command.');
    if (operation === 'export') {
      if (!validId(input.link_id)) throw new CommandError(404, 'This link does not exist.');
      const link = (await pool.query(linkQuery, [input.link_id])).rows[0];
      if (!link) throw new CommandError(404, 'This link does not exist.');
      return { text: exportLink(link.id, baseUrl) };
    }
    if (operation === 'list') {
      await activeUser(pool, input.actor_id, null, false);
      return { links: (await pool.query('SELECT * FROM links WHERE user_id=$1 ORDER BY id', [input.actor_id])).rows };
    }
    if (!['create', 'update', 'destroy', 'toggle-ability', 'wizard-start', 'wizard-apply'].includes(operation)) throw new CommandError(404, 'Not found.');
    if (typeof input.request_key !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(input.request_key) ||
        !validId(input.actor_id) || (input.surrender_id != null && !validId(input.surrender_id))) throw new CommandError(422, 'Invalid link command.');
    const creating = ['create', 'wizard-start'].includes(operation);
    if (creating && input.ahoy_visit_id != null && !validId(input.ahoy_visit_id)) throw new CommandError(422, 'Invalid visit.');
    if (!creating && !validId(input.link_id)) throw new CommandError(404, 'This link does not exist.');
    const digest = createHash('sha256').update(JSON.stringify(canonical({ ...input, operation }))).digest('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['link-command:' + input.request_key]);
      const prior = (await client.query('SELECT id,payload_digest,result FROM node_link_events WHERE request_key=$1', [input.request_key])).rows[0];
      if (prior) {
        if (prior.payload_digest !== digest) throw new CommandError(409, 'Request key already used for a different link command.');
        // Recheck the caller even on a retry; deletion replay needs no link row.
        await activeUser(client, input.actor_id, input.surrender_id, true);
        await client.query('COMMIT');
        return { ...prior.result, event_id: prior.id, replayed: true };
      }
      let link = creating ? null : (await client.query(linkQuery + ' FOR UPDATE OF l', [input.link_id])).rows[0];
      if (!creating && !link) throw new CommandError(404, 'This link does not exist.');
      const actor = await activeUser(client, input.actor_id, input.surrender_id, true);
      if (link && operation !== 'toggle-ability' && String(link.user_id) !== String(actor.id)) throw new CommandError(403, 'Not authorized.');
      let result;
      if (creating) {
        const settings = normalizeSettings(operation === 'wizard-start' ? { never_expires: true, min_score: 0 } : input.attributes, {}, actor.set_count);
        await uniqueSlug(client, settings);
        link = (await client.query(`INSERT INTO links (user_id,${settingFields.join(',')},wizard_page,ahoy_visit_id,created_at,updated_at)
          VALUES ($1,${settingFields.map((_, index) => '$' + (index + 2)).join(',')},$10,$11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING *`,
        [actor.id, ...settingFields.map((field) => settings[field]), operation === 'wizard-start' ? 'intro' : null, input.ahoy_visit_id ?? null])).rows[0];
        result = { link };
      } else if (operation === 'update') {
        const settings = normalizeSettings(input.attributes, link, actor.set_count);
        await uniqueSlug(client, settings, link.id);
        result = { link: await updateSettings(client, link, settings) };
      } else if (operation === 'toggle-ability') {
        if (!abilities.includes(input.ability)) throw new LinkValidationError({ base: ['Unknown link ability.'] });
        if (input.ability === 'is_master_only') {
          const master = (await client.query(`SELECT l.master_id FROM leashes l JOIN friendships f ON f.id=l.friendship_id
            JOIN users u ON u.id=l.master_id WHERE l.pet_id=$1 AND (f.sender_id=$1 OR f.receiver_id=$1)
            ORDER BY u.id LIMIT 1`, [link.user_id])).rows[0];
          if (!master || String(master.master_id) !== String(actor.id)) throw new CommandError(403, 'Only the current leash owner can change this ability.');
        } else if (String(link.user_id) !== String(actor.id)) throw new CommandError(403, 'Not authorized.');
        const existing = await client.query('SELECT id FROM link_abilities WHERE link_id=$1 AND ability=$2', [link.id, input.ability]);
        if (existing.rowCount) await client.query('DELETE FROM link_abilities WHERE link_id=$1 AND ability=$2', [link.id, input.ability]);
        else await enableAbility(client, link.id, input.ability);
        result = { link, ability: input.ability, enabled: !existing.rowCount };
      } else if (operation === 'wizard-apply') {
        if (link.wizard_page !== input.step) throw new CommandError(409, 'This wizard step has changed. Please reload the current step.');
        const wizard = applyWizard(input.step, input.choices, link);
        const settings = normalizeSettings(wizard.changes, link, actor.set_count);
        await uniqueSlug(client, settings, link.id);
        const saved = await updateSettings(client, link, settings, wizard.wizardPage);
        for (const ability of wizard.enable) await enableAbility(client, link.id, ability);
        if (wizard.user.mascot) await client.query('UPDATE users SET mascot=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [actor.id, wizard.user.mascot]);
        if (wizard.user.pervert != null) await client.query('UPDATE users SET pervert=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [actor.id, wizard.user.pervert]);
        result = { link: saved, next_step: wizard.nextStep };
      } else if (operation === 'destroy') {
        // Preserve sent/received history and newsroom entries while detaching
        // relationships that would otherwise prevent the link from being removed.
        await client.query('UPDATE users SET viewing_link_id=NULL WHERE viewing_link_id=$1', [link.id]);
        await client.query('UPDATE links SET forked_from_id=NULL WHERE forked_from_id=$1', [link.id]);
        await client.query('UPDATE scoops SET link_id=NULL WHERE link_id=$1', [link.id]);
        await client.query('UPDATE past_links SET link_id=NULL WHERE link_id=$1', [link.id]);
        await client.query('DELETE FROM history_events WHERE link_id=$1', [link.id]);
        await client.query('DELETE FROM comments WHERE link_id=$1', [link.id]);
        await client.query('DELETE FROM link_abilities WHERE link_id=$1', [link.id]);
        await client.query('DELETE FROM emoji_link_decorations WHERE link_id=$1', [link.id]);
        await client.query('DELETE FROM links WHERE id=$1', [link.id]);
        result = { link: null, link_id: link.id, deleted: true };
      }
      const ownerId = link.user_id;
      const event = (await client.query(`INSERT INTO node_link_events
        (request_key,payload_digest,link_id,user_id,operation,result,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,
      [input.request_key, digest, link.id, ownerId, operation, JSON.stringify(result)])).rows[0];
      await client.query('COMMIT');
      return { ...result, event_id: event.id, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  };
}
