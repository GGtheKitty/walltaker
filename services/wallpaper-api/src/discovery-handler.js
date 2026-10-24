import { createHmac, timingSafeEqual } from 'node:crypto';
import { readApiBody } from './body.js';
import { CommandError } from './updates.js';

export const discoveryToken = (secret) => createHmac('sha256', secret).update('walltaker:discovery:commands:v1').digest('hex');
export function createDiscoveryHandler({ secretKeyBase, read }) {
  const expected = Buffer.from(`Bearer ${discoveryToken(secretKeyBase)}`);
  return async (request, response, url) => {
    const send = (status, data) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-walltaker-backend': 'node-discovery' });
      response.end(JSON.stringify(data));
    };
    const supplied = Buffer.from(request.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, { message: 'Forbidden.' });
    if (request.method !== 'POST') return send(405, { message: 'POST required.' });
    const operation = /^\/_internal\/discovery\/([a-z-]+)$/.exec(url.pathname)?.[1];
    if (!operation) return send(404, { message: 'Not found.' });
    try {
      if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CommandError(415, 'JSON required.');
      if (!read) throw new CommandError(503, 'Discovery backend is not configured.');
      return send(200, await read(operation, await readApiBody(request)));
    } catch (error) {
      if (error instanceof CommandError) return send(error.status, { message: error.message, ...(error.errors ? { errors: error.errors } : {}) });
      throw error;
    }
  };
}
