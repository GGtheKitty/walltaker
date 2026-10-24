import { createHmac, timingSafeEqual } from 'node:crypto';
async function readApiBody(request) {
  const max=4*1024*1024;
  if(Number(request.headers['content-length'])>max)throw new CommandError(413,'Request too large.');
  let size=0;const chunks=[];
  for await (const chunk of request.iterator({destroyOnReturn:false})) {
    size+=chunk.length;if(size>max){request.resume();throw new CommandError(413,'Request too large.');}chunks.push(chunk);
  }
  try {const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(input&&typeof input==='object'&&!Array.isArray(input))return input;}catch{}
  throw new CommandError(400,'Invalid JSON object.');
}
import { CommandError } from './updates.js';

export const moderationToken = (secret) => createHmac('sha256', secret).update('walltaker:moderation:commands:v1').digest('hex');
export function createModerationHandler({ secretKeyBase, manage }) {
  const expected = Buffer.from(`Bearer ${moderationToken(secretKeyBase)}`);
  return async (request, response, url) => {
    const send = (status, data) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-walltaker-backend': 'node-moderation' });
      response.end(JSON.stringify(data));
    };
    const supplied = Buffer.from(request.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, { message: 'Forbidden.' });
    if (request.method !== 'POST') return send(405, { message: 'POST required.' });
    const operation = /^\/_internal\/moderation\/([a-z-]+)$/.exec(url.pathname)?.[1];
    if (!operation) return send(404, { message: 'Not found.' });
    try {
      if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CommandError(415, 'JSON required.');
      if (!manage) throw new CommandError(503, 'Moderation backend is not configured.');
      return send(200, await manage(operation, await readApiBody(request)));
    } catch (error) {
      if (error instanceof CommandError) return send(error.status, { message: error.message, ...(error.errors ? { errors: error.errors } : {}) });
      throw error;
    }
  };
}
