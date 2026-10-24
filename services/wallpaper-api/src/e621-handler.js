import { createHmac, timingSafeEqual } from 'node:crypto';
import { readApiBody } from './body.js';
import { CommandError } from './updates.js';

export const e621Token = (secret) => createHmac('sha256', secret).update('walltaker:e621:commands:v1').digest('hex');

export function createE621Handler({ secretKeyBase, service }) {
  const expected = Buffer.from(`Bearer ${e621Token(secretKeyBase)}`);
  return async (request, response, url) => {
    const send = (status, data) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-walltaker-backend': 'node-e621' });
      response.end(JSON.stringify(data));
    };
    const supplied = Buffer.from(request.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, { message: 'Forbidden.' });
    const operation = /^\/_internal\/e621\/(query|search|select|post)$/.exec(url.pathname)?.[1];
    if (!operation) return send(404, { message: 'Not found.' });
    if (request.method !== 'POST') return send(405, { message: 'POST required.' });
    try {
      if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CommandError(415, 'JSON required.');
      const input = await readApiBody(request);
      const result = await service[operation](input);
      return send(200, result);
    } catch (error) {
      if (error instanceof CommandError) return send(error.status, { message: error.message });
      throw error;
    }
  };
}
