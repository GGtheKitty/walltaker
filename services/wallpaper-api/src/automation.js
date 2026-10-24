import { automationKey, automationTransaction, createAutomationQueue, enqueueAutomation } from './automation-queue.js';
import { automationLink, e621Policy, isAutomationOnline, selectionFingerprint, wallpaperPolicy, enqueueWallpaperAutomation } from './automation-wallpaper.js';
import { createNewsroom } from './newsroom.js';
import { CommandError } from './updates.js';
import { validPostId } from './e621-policy.js';

export const BOTS = {
  taylor: { username: 'PornLizardTaylor', ability: 'can_be_set_by_lizard', mascot: 'taylor', limit: 4, cooldown: 600,
    tags: ['public ~public_sex ~penis_milking ~public_masturbation ~free_use ~leaking_cum ~cum_on_face ~cum_on_butt ~cum_on_clothing score:>100 -swf', '~impregnation ~impregnation_request excessive_cum ~presenting_hindquarters ~cum_in_pussy ~cum_in_ass ~cum_pool score:>80 -swf'] },
  warren: { username: 'PornLizardWarren', ability: 'can_be_set_by_lizard', mascot: 'warren', limit: 4, cooldown: 600,
    tags: ['~big_penis ~big_balls close_up ~big_breasts ~plump_labia ~crotch_shot -obese -hyper ~huge_balls score:>50 -swf', 'hyper ~huge_breasts ~huge_penis ~himbo ~bimbofication ~horsecock ~hyper_breasts ~udders -obese score:>70 -swf'] },
  ki: { username: 'PornLizardKi', ability: 'can_be_set_by_lizard', mascot: 'ki', limit: 4, cooldown: 600,
    tags: ['~massage romantic ~embrace ~cuddle ~hug ~hand_holding score:>90 -swf', '~latex ~rubber glistening_body ~bdsm ~goo_creature ~slime score:>50 -swf'] },
  pornbot: { username: 'PornBot', ability: 'can_be_set_by_porn_bot', mascot: null, limit: 60, cooldown: 1500,
    tags: ['score:>100 -nightmare_fuel -nazi -swf rating:e', 'score:>100 -nightmare_fuel -nazi -swf rating:e'] },
};
const positiveId = value => validPostId(value);
const requestKey = input => {
  if (typeof input.request_key !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(input.request_key)) throw new CommandError(422, 'Request key required.');
  return input.request_key;
};
const normalizedEntry = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.message !== 'string' || value.message.length > 50000 ||
    (value.image_url != null && (typeof value.image_url !== 'string' || !/^https:\/\//.test(value.image_url) || value.image_url.length>4096)) ||
    (value.lizard_image_url != null && !/^mascot\/news\/[A-Za-z]+\.png$/.test(value.lizard_image_url)) ||
    (value.transition_message != null && (typeof value.transition_message !== 'string' || value.transition_message.length>10000))) throw new CommandError(422, 'Invalid news entry.');
  return { image_url: value.image_url || null, message: value.message,
    lizard_image_url: value.lizard_image_url || 'mascot/news/TaylorDeskOpen.png',
    type: value.type === 'scoop' ? 'scoop' : 'post', transition_message: value.transition_message || null };
};

export function createAutomation({ pool, store, e621, writeWallpaper, pornbotInterval = 600, newsroom = createNewsroom(pool) }) {
  const queue = createAutomationQueue(pool);
  const intervals = { taylor: 60, warren: 60, ki: 60, pornbot: Math.max(60,Math.min(86400,Number(pornbotInterval)||600)), scoops: 120 };
  const online = async () => (await store.onlineIds()).map(String);
  const schedule = async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (const [name, seconds] of Object.entries(intervals)) {
        await c.query(`INSERT INTO node_automation_schedules(name,next_run_at,created_at,updated_at)
          VALUES($1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(name) DO NOTHING`, [name]);
        const row = (await c.query('SELECT * FROM node_automation_schedules WHERE name=$1 FOR UPDATE', [name])).rows[0];
        const now = (await c.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now;
        if (row.next_run_at > now) continue;
        // One current round after downtime; never replay a backlog of bot rounds.
        const key = automationKey('schedule', `${name}:${row.next_run_at.toISOString()}`);
        await enqueueAutomation(c, { key, kind: name==='scoops' ? 'scoop-round' : 'bot-round', payload: name==='scoops' ? {} : { bot: name } });
        await c.query(`UPDATE node_automation_schedules SET next_run_at=CURRENT_TIMESTAMP+$2::integer*INTERVAL '1 second',updated_at=CURRENT_TIMESTAMP WHERE name=$1`, [name,seconds]);
      }
      await c.query('COMMIT');
    } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  };
  const round = async job => {
    const definition = BOTS[job.payload.bot];
    if (!definition) throw new Error('UnknownBot');
    const ids = await online();
    return automationTransaction(pool, job, async c => {
      const actor = (await c.query('SELECT id FROM users WHERE username=$1 AND deleted_at IS NULL AND system_account=true', [definition.username])).rows[0];
      if (!actor) return;
      const candidates = (await c.query(`SELECT l.id,
        (SELECT id FROM past_links WHERE link_id=l.id ORDER BY id DESC LIMIT 1) AS latest_past_id
        FROM links l JOIN users u ON u.id=l.user_id WHERE u.deleted_at IS NULL
        AND EXISTS(SELECT 1 FROM link_abilities a WHERE a.link_id=l.id AND a.ability=$1)
        AND ($2::text IS NULL OR u.mascot=$2)
        AND (l.id=ANY($3::bigint[]) OR l.last_ping>CURRENT_TIMESTAMP-INTERVAL '1 minute'
          OR (l.last_ping_user_agent LIKE '%widgetExtension%' AND l.last_ping>CURRENT_TIMESTAMP-INTERVAL '20 minutes'))
        AND NOT EXISTS(SELECT 1 FROM past_links p WHERE p.link_id=l.id AND p.created_at>CURRENT_TIMESTAMP-$4::integer*INTERVAL '1 second')
        ORDER BY RANDOM() LIMIT $5`, [definition.ability,definition.mascot,ids,definition.cooldown,definition.limit])).rows;
      for (let i=0;i<candidates.length;i++) {
        const row = candidates[i];
        await enqueueAutomation(c, { key: automationKey('bot-link', `${job.job_key}:${row.id}`), kind: 'bot-link',
          payload: { bot: job.payload.bot, link_id: row.id, set_by_id: actor.id, expected_past_id: row.latest_past_id },
          runAt: new Date(Date.now()+i*1000) });
      }
    });
  };
  const fanout = job => automationTransaction(pool, job, async c => {
    const p = job.payload;
    const parent = (await c.query(`SELECT l.id FROM links l JOIN users u ON u.id=l.user_id WHERE l.id=$1 AND u.deleted_at IS NULL
      AND $2::bigint=(SELECT id FROM past_links WHERE link_id=l.id ORDER BY id DESC LIMIT 1)`, [p.parent_id,p.parent_past_id])).rows[0];
    if (!parent) return;
    const children = (await c.query(`SELECT l.id FROM links l JOIN users u ON u.id=l.user_id
      WHERE l.forked_from_id=$1 AND l.id>$2 AND NOT(l.id=ANY($3::bigint[])) AND u.deleted_at IS NULL ORDER BY l.id LIMIT 100`, [p.parent_id,p.cursor,p.ancestors])).rows;
    for (const child of children) await enqueueAutomation(c, {
      key: automationKey('fork', `${p.rootKey}:${child.id}`), kind: 'fork-link',
      payload: { rootKey: p.rootKey, ancestors: p.ancestors, parent_id: p.parent_id, parent_past_id: p.parent_past_id,
        post_id: p.post_id, set_by_id: p.set_by_id, link_id: child.id }, runAt: new Date(Date.now()+1000),
    });
    if (children.length===100) {
      const cursor = children.at(-1).id;
      await enqueueAutomation(c, { key: automationKey('fork-fanout', `${p.rootKey}:${p.parent_id}:${cursor}`), kind: 'fork-fanout', payload: { ...p, cursor } });
    }
  });
  const setWallpaper = async job => {
    const p = job.payload;
    const writeKey = p.write_key || job.job_key;
    // The wallpaper transaction may have committed just before a worker crash.
    const prior = (await pool.query(`SELECT p.id,p.link_id,p.e621_post_id,p.set_by_id FROM node_wallpaper_events e
      JOIN past_links p ON p.id=e.past_link_id WHERE e.request_key=$1`, [writeKey])).rows[0];
    if (prior) return automationTransaction(pool,job,c=>enqueueWallpaperAutomation(c,{
      command:{request_key:writeKey,link_id:String(prior.link_id),post_id:String(prior.e621_post_id || p.post_id),set_by_id:prior.set_by_id==null ? null : String(prior.set_by_id)},
      pastId:prior.id,context:{rootKey:p.rootKey || writeKey,ancestors:p.ancestors || []},
    }));
    const row = await automationLink(pool,p.link_id);
    if (!row) return;
    let guard, post;
    if (job.kind==='bot-link') {
      const definition = BOTS[p.bot];
      if (!definition) throw new Error('UnknownBot');
      const actor = (await pool.query('SELECT id FROM users WHERE id=$1 AND username=$2 AND system_account=true AND deleted_at IS NULL', [p.set_by_id,definition.username])).rows[0];
      const ids = await online();
      if (!actor || String(row.latest_past_id)!==String(p.expected_past_id) || !row.abilities.includes(definition.ability) ||
        (definition.mascot && row.mascot!==definition.mascot) || !isAutomationOnline(row,ids) ||
        (row.latest_past_at && row.latest_past_at.getTime()>Date.now()-definition.cooldown*1000)) return;
      guard = { kind: 'bot', ability: definition.ability, mascot: definition.mascot, cooldown: definition.cooldown, onlineIds: ids, fingerprint: selectionFingerprint(row) };
      post = (await e621.search({ tags: `order:random ${definition.tags[row.pervert ? 1 : 0]} -nightmare_fuel`, limit: 1, policy: e621Policy(row) }))[0];
    } else {
      if (job.kind==='fork-link') {
        if (String(row.forked_from_id)!==p.parent_id) return;
        const parent = (await pool.query('SELECT id FROM past_links WHERE link_id=$1 ORDER BY id DESC LIMIT 1', [p.parent_id])).rows[0];
        if (String(parent?.id)!==p.parent_past_id) return;
        guard = { kind: 'fork', parentId: p.parent_id, parentPastId: p.parent_past_id, fingerprint: selectionFingerprint(row) };
      } else guard = { kind: 'selection', fingerprint: selectionFingerprint(row) };
      post = await e621.select({ post_id: p.post_id, policy: e621Policy(row) });
    }
    if (!post?.file?.url) return;
    const tags = ['general','character','species','lore','copyright','meta'].flatMap(kind=>post.tags?.[kind] || []).join(' ')+` rating:${post.rating}`;
    try {
      await writeWallpaper({ request_key: writeKey, link_id: row.id, post_id: post.id, set_by_id: p.set_by_id || null,
        post_url: post.file.url, post_thumbnail_url: post.sample?.url || post.preview?.url || null,
        post_description: post.description || '', tags, count_self: job.kind==='bot-link', expected_policy: wallpaperPolicy(row) },
      { guard, rootKey: p.rootKey || writeKey, ancestors: p.ancestors || [] });
    } catch (error) {
      // Consent, ownership, policy and parent-history changes cancel stale work.
      if (error instanceof CommandError && [404,409,422].includes(error.status)) return;
      throw error;
    }
  };
  return {
    queue, schedule,
    async run(job) {
      if (job.kind==='bot-round') return round(job);
      if (job.kind==='fork-fanout') return fanout(job);
      if (['bot-link','fork-link','set-link'].includes(job.kind)) return setWallpaper(job);
      if (['scoop-round','news-wallpaper','news-scoop','news-step','news-entry'].includes(job.kind)) return newsroom.run(job);
      throw new Error('UnknownAutomationJob');
    },
    async request(operation, input={}) {
      if (operation==='newsroom') return newsroom.read();
      if (operation==='status') return { backend: 'node-automation',
        jobs: (await pool.query('SELECT status,count(*)::integer AS count FROM node_automation_jobs GROUP BY status')).rows,
        schedules: (await pool.query('SELECT name,next_run_at FROM node_automation_schedules ORDER BY name')).rows };
      const key = requestKey(input);
      if (operation==='round') {
        if (!Object.hasOwn(BOTS,input.bot)) throw new CommandError(422,'Unknown bot.');
        return queue.enqueue({ key,kind:'bot-round',payload:{bot:input.bot} });
      }
      if (operation==='scoop-round') return queue.enqueue({key,kind:'scoop-round'});
      if (operation==='wallpaper-news' || operation==='scoop-news') {
        const field = operation==='wallpaper-news' ? 'past_link_id' : 'scoop_id';
        if (!positiveId(input[field])) throw new CommandError(422,'Invalid record ID.');
        return queue.enqueue({key,kind:operation==='wallpaper-news' ? 'news-wallpaper' : 'news-scoop',payload:{[field]:String(input[field])}});
      }
      if (operation==='set-wallpaper') {
        if (!positiveId(input.link_id) || !positiveId(input.post_id) || (input.set_by_id!=null && !positiveId(input.set_by_id))) throw new CommandError(422,'Invalid wallpaper job.');
        return queue.enqueue({key,kind:'set-link',payload:{link_id:String(input.link_id),post_id:String(input.post_id),set_by_id:input.set_by_id==null ? null : String(input.set_by_id)}});
      }
      if (operation==='news-entry') return queue.enqueue({key,kind:'news-entry',payload:{entry:normalizedEntry(input.entry),phase:['away','to_desk'].includes(input.phase) ? input.phase : null,done:input.done===true}});
      throw new CommandError(404,'Unknown automation operation.');
    },
  };
}
