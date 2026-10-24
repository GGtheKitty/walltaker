import { createHmac, timingSafeEqual } from 'node:crypto';
import { CommandError } from './updates.js';

export const commandToken = (secret) => createHmac('sha256', secret).update('walltaker:wallpaper-api:commands:v1').digest('hex');
export const eventToken = (secret) => createHmac('sha256', secret).update('walltaker:wallpaper-api:events:v1').digest('hex');

async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new CommandError(415, 'JSON required.');
  if (Number(request.headers['content-length']) > 2 * 1024 * 1024) throw new CommandError(413, 'Request body too large.');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new CommandError(413, 'Request body too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new CommandError(400, 'Invalid JSON.'); }
}

export function createInternalHandler({ secretKeyBase, writeWallpaper, readHistory, writeReaction }) {
  const expected = Buffer.from(`Bearer ${commandToken(secretKeyBase)}`);
  return async (request, response, url) => {
    const send = (status, data) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(data));
    };
    const supplied = Buffer.from(request.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, { message: 'Forbidden.' });
    try {
      if (url.pathname === '/_internal/wallpaper-updates' && request.method === 'POST') {
        if (!writeWallpaper) throw new CommandError(503, 'Wallpaper writes are not configured.');
        return send(200, await writeWallpaper(await readBody(request)));
      }
      if (url.pathname === '/_internal/wallpaper-reactions' && request.method === 'POST') {
        if (!writeReaction) throw new CommandError(503, 'Reaction writes are not configured.');
        return send(200, await writeReaction(await readBody(request)));
      }
      if (url.pathname === '/_internal/wallpaper-history' && request.method === 'GET') {
        return send(200, await readHistory({ userId: url.searchParams.get('user_id'), kind: url.searchParams.get('kind') || 'received', limit: url.searchParams.get('limit') || '50' }));
      }
      return send(404, { message: 'Not found.' });
    } catch (error) {
      if (error instanceof CommandError) return send(error.status, { message: error.message });
      throw error;
    }
  };
}

export function startEventDelivery({ pool, secretKeyBase, railsUrl, logger = console, fetchImpl = fetch, interval = 1000, kind = 'wallpaper' }) {
  if (!['wallpaper', 'reaction', 'link', 'social', 'tracker', 'moderation', 'automation'].includes(kind)) throw new Error('Invalid event kind');
  const table = `node_${kind}_events`;
  let stopped = false;
  let running;
  const drain = async () => {
    const rows = (await pool.query(`SELECT id FROM ${table}
      WHERE delivered_at IS NULL AND available_at <= CURRENT_TIMESTAMP ORDER BY id LIMIT 10`)).rows;
    for (const { id } of rows) {
      if (stopped) break;
      try {
        const response = await fetchImpl(`${railsUrl}/_internal/${kind}-events/${id}.json`, {
          method: 'POST', headers: { authorization: `Bearer ${eventToken(secretKeyBase)}` },
          signal: AbortSignal.timeout(15000), redirect: 'error',
        });
        await response.arrayBuffer();
        if (!response.ok) throw new Error(`Wallpaper event adapter returned ${response.status}`);
      } catch (error) {
        logger.warn(`Node ${kind} event ${id} delivery failed: ${error.code || error.name}`);
        await pool.query(`UPDATE ${table} SET delivery_attempts = delivery_attempts + 1,
          available_at = CURRENT_TIMESTAMP + LEAST(300, POWER(2, LEAST(delivery_attempts, 8))) * INTERVAL '1 second',
          updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND delivered_at IS NULL`, [id]);
      }
    }
  };
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = drain().catch((error) => logger.warn(`Node ${kind} event delivery failed: ${error.code || error.name}`))
      .finally(() => { running = undefined; });
  }, interval);
  timer.unref();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
