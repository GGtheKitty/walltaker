import { createHash } from 'node:crypto';
import { automationKey, enqueueAutomation } from './automation-queue.js';
import { CommandError } from './updates.js';

export async function automationLink(c, id) {
  return (await c.query(`SELECT l.*,u.username AS owner_username,u.mascot,u.pervert,
    COALESCE((SELECT jsonb_agg(ability ORDER BY ability) FROM link_abilities WHERE link_id=l.id),'[]') AS abilities,
    COALESCE((SELECT jsonb_agg(k.name ORDER BY k.name) FROM kink_havers kh JOIN kinks k ON k.id=kh.kink_id WHERE kh.user_id=u.id),'[]') AS kinks,
    (SELECT id FROM past_links WHERE link_id=l.id ORDER BY id DESC LIMIT 1) AS latest_past_id,
    (SELECT created_at FROM past_links WHERE link_id=l.id ORDER BY id DESC LIMIT 1) AS latest_past_at
    FROM links l JOIN users u ON u.id=l.user_id WHERE l.id=$1 AND u.deleted_at IS NULL`, [id])).rows[0];
}
export const e621Policy = row => ({ blacklist: row.blacklist, theme: row.theme, min_score: row.min_score,
  can_show_videos: row.abilities.includes('can_show_videos'), is_kink_aligned: row.abilities.includes('is_kink_aligned'),
  kinks: row.abilities.includes('is_kink_aligned') ? row.kinks : [] });
export const wallpaperPolicy = row => Object.fromEntries(['user_id','blacklist','theme','min_score','friends_only','never_expires','expires'].map(key => [key,row[key]]));
export const selectionFingerprint = row => createHash('sha256').update(JSON.stringify({
  policy: wallpaperPolicy(row), abilities: row.abilities, kinks: row.kinks,
  mascot: row.mascot, pervert: row.pervert, latest_past_id: row.latest_past_id,
  forked_from_id: row.forked_from_id,
})).digest('hex');
export const isAutomationOnline = (row, ids, now = Date.now()) => ids.includes(String(row.id)) ||
  (row.last_ping && new Date(row.last_ping).getTime() > now - (row.last_ping_user_agent?.includes('widgetExtension') ? 1200000 : 60000));

export async function verifyAutomationSelection(c, linkId, guard) {
  // Account policy changes must wait until this short wallpaper transaction
  // finishes. The link row itself is already locked by the writer.
  await c.query('SELECT u.id FROM users u JOIN links l ON l.user_id=u.id WHERE l.id=$1 FOR SHARE OF u', [linkId]);
  if (guard.kind==='fork') await c.query('SELECT id FROM links WHERE id=$1 FOR SHARE', [guard.parentId]);
  const row = await automationLink(c, linkId);
  if (!row || selectionFingerprint(row) !== guard.fingerprint) throw new CommandError(409, 'Automation selection became stale.');
  if (guard.kind === 'bot') {
    if (!row.abilities.includes(guard.ability) || (guard.mascot && row.mascot !== guard.mascot) ||
      !isAutomationOnline(row, guard.onlineIds) || (row.latest_past_at && new Date(row.latest_past_at).getTime() > Date.now()-guard.cooldown*1000)) {
      throw new CommandError(409, 'Automation consent or activity changed.');
    }
  } else if (guard.kind === 'fork') {
    if (String(row.forked_from_id) !== guard.parentId) throw new CommandError(409, 'Fork relationship changed.');
    const parent = (await c.query(`SELECT p.id FROM past_links p JOIN links l ON l.id=p.link_id
      JOIN users u ON u.id=l.user_id WHERE p.id=$1 AND l.id=$2 AND u.deleted_at IS NULL
      AND p.id=(SELECT id FROM past_links WHERE link_id=l.id ORDER BY id DESC LIMIT 1)`, [guard.parentPastId, guard.parentId])).rows[0];
    if (!parent) throw new CommandError(409, 'Parent wallpaper changed.');
  }
}

export async function enqueueWallpaperAutomation(c, { command, pastId, context = {} }) {
  const rootKey = context.rootKey || command.request_key;
  const ancestors = [...(context.ancestors || []), command.link_id];
  if (ancestors.length < 64) await enqueueAutomation(c, {
    key: automationKey('fork-fanout', `${rootKey}:${command.link_id}:0`), kind: 'fork-fanout',
    payload: { rootKey, ancestors, parent_id: command.link_id, parent_past_id: String(pastId),
      post_id: command.post_id, set_by_id: command.set_by_id, cursor: '0' },
  });
  await enqueueAutomation(c, { key: `news-wallpaper:${pastId}`, kind: 'news-wallpaper', payload: { past_link_id: String(pastId) } });
}
