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
