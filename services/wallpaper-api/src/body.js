import { CommandError } from './updates.js';

export async function readApiBody(request) {
  const max = 64 * 1024;
  if (Number(request.headers['content-length']) > max) throw new CommandError(413, 'Request body too large.');
  let size = 0;
  const chunks = [];
  // Keep the request stream intact to send a useful 413 for chunked bodies.
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > max) { request.resume(); throw new CommandError(413, 'Request body too large.'); }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  const type = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (type === 'application/x-www-form-urlencoded') return Object.fromEntries(new URLSearchParams(text));
  if (type !== 'application/json') throw new CommandError(415, 'Use JSON or form-encoded parameters.');
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* Invalid client JSON, not a service failure. */ }
  throw new CommandError(400, 'Invalid JSON object.');
}
