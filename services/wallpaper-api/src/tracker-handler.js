import { createHmac, timingSafeEqual } from 'node:crypto';
import { readApiBody } from './body.js';
import { CommandError } from './updates.js';

export const trackerToken = (secret) => createHmac('sha256', secret).update('walltaker:tracker:commands:v1').digest('hex');
export function createTrackerHandler({ secretKeyBase, manage }) {
  const expected = Buffer.from(`Bearer ${trackerToken(secretKeyBase)}`);
  return async (request, response, url) => {
    const send = (status, data) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-walltaker-backend': 'node-tracker' });
      response.end(JSON.stringify(data));
    };
    const supplied = Buffer.from(request.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, { message: 'Forbidden.' });
    if (request.method !== 'POST') return send(405, { message: 'POST required.' });
    const operation = /^\/_internal\/tracker\/([a-z-]+)$/.exec(url.pathname)?.[1];
    if (!operation) return send(404, { message: 'Not found.' });
    try {
      if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CommandError(415, 'JSON required.');
      if (!manage) throw new CommandError(503, 'Tracker backend is not configured.');
      return send(200, await manage(operation, await readApiBody(request)));
    } catch (error) {
      if (error instanceof CommandError) return send(error.status, { message: error.message, ...(error.errors ? { errors: error.errors } : {}) });
      throw error;
    }
  };
}
