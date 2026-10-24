import { createHash, createHmac, pbkdf2Sync, randomUUID, timingSafeEqual } from 'node:crypto';
import { clientIdentity, headerIdentity } from './realtime-presence.js';

export const rpcToken = (secret) => createHmac('sha256', secret).update('rpc-cable').digest('hex');
export function createStreamVerifier(secret) {
  const key = pbkdf2Sync(secret, 'turbo/signed_stream_verifier_key', 1000, 64, 'sha256');
  return (token) => {
    if (typeof token !== 'string' || token.length > 8192) return null;
    const match = /^([A-Za-z0-9+/=]+)--([0-9a-f]{64})$/.exec(token);
    if (!match || !timingSafeEqual(createHmac('sha256', key).update(match[1]).digest(), Buffer.from(match[2], 'hex'))) return null;
    try {
      const stream = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
      return typeof stream === 'string' && stream.length > 0 ? stream : null;
    } catch { return null; }
  };
}
const parse = (text, fallback = {}) => { try { return JSON.parse(text) ?? fallback; } catch { return fallback; } };
const headersFor = (env) => Object.fromEntries(Object.entries(env?.headers || {}).map(([name, value]) => [name.toLowerCase(), value]));

export function createRealtimeRpc({ repository, presence, publisher, readUser, sessionViewer, authenticateKey, authorizeStream, secretKeyBase, baseUrl }) {
  const verifyStream = createStreamVerifier(secretKeyBase);
  return async (method, payload) => {
    const env = payload.env || {};
    const headers = headersFor(env);
    if (method === 'connect') {
      // Public native/extension clients can supply their own origin. Browser
      // cookies are accepted only from this site's origin (or native clients).
      if (headers.cookie && headers.origin && headers.origin !== 'null' && headers.origin !== new URL(baseUrl).origin) {
        return { status: 2, transmissions: [JSON.stringify({ type: 'disconnect', reason: 'invalid_request', reconnect: false })] };
      }
      const userId = await sessionViewer(headers);
      return { status: 1, identifiers: '{}', transmissions: [JSON.stringify({ type: 'welcome' })],
        env: { cstate: { node_connection: randomUUID(), node_user: JSON.stringify(userId), node_links: '{}' } } };
    }
    const cstate = { ...env.cstate };
    const connectionId = cstate.node_connection;
    if (!connectionId) return { status: 2, disconnect: true };
    const viewerId = parse(cstate.node_user, null);
    const links = parse(cstate.node_links);
    if (method === 'disconnect') {
      for (const { id, token } of Object.values(links)) await presence.leave(id, token);
      await presence.view(viewerId, connectionId, null);
      return { status: 1 };
    }
    const identifier = payload.identifier;
    if (typeof identifier !== 'string' || identifier.length > 8192) return { status: 2 };
    const params = parse(identifier);
    const istate = { ...env.istate };
    const result = { status: 1, streams: [], stopped_streams: [], transmissions: [], env: { cstate, istate } };
    const transmit = (message) => result.transmissions.push(JSON.stringify({ identifier, message }));
    const reject = () => { result.status = 2; result.transmissions.push(JSON.stringify({ identifier, type: 'reject_subscription' })); return result; };
    const linkIdentifier = [params.id, params.link_id].find((id) => ['string', 'number'].includes(typeof id) && String(id).trim());
    const findLink = () => repository.findIdentifier(String(linkIdentifier ?? ''));
    const watchLink = async (row) => {
      // A gateway retry after a lost RPC response must reuse the same member.
      const token = links[identifier]?.token || `${connectionId}:${createHash('sha256').update(identifier).digest('hex')}`;
      if (await presence.join(row.id, token, clientIdentity(params) || headerIdentity(headers))) {
        links[identifier] = { id: String(row.id), token }; cstate.node_links = JSON.stringify(links);
      }
    };
    const stopUser = () => { if (istate.node_user_stream) result.stopped_streams.push(istate.node_user_stream); istate.node_user_stream = ''; };
    if (payload.command === 'subscribe') {
      if (params.channel === 'Turbo::StreamsChannel') {
        const stream = verifyStream(params.signed_stream_name);
        if (!stream || authorizeStream && !await authorizeStream(stream,viewerId)) return reject();
        result.streams.push(stream);
      } else if (params.channel === 'LinkChannel') {
        if (linkIdentifier == null) return reject();
        const row = await findLink();
        if (row) {
          await watchLink(row); result.streams.push(`Link::${row.id}`);
          transmit(await publisher.linkPayload(await repository.find(String(row.id))));
        } else transmit({ success: false, why: `Link ${linkIdentifier} does not exist.` });
      } else if (params.channel !== 'WebPresenceChannel') return reject();
      result.transmissions.unshift(JSON.stringify({ identifier, type: 'confirm_subscription' }));
    } else if (payload.command === 'unsubscribe') {
      result.stop_streams = true;
      if (links[identifier]) {
        await presence.leave(links[identifier].id, links[identifier].token);
        delete links[identifier]; cstate.node_links = JSON.stringify(links);
      }
      if (params.channel === 'WebPresenceChannel') await presence.view(viewerId, connectionId, null);
    } else if (payload.command === 'message') {
      const data = parse(payload.data);
      if (data.action === 'heartbeat' && ['LinkChannel','WebPresenceChannel'].includes(params.channel)) {
        await presence.heartbeat(Object.values(links), viewerId, connectionId);
      } else if (params.channel === 'LinkChannel') {
        if (data.action === 'check') { const row = await findLink(); if (row) await watchLink(row); }
        else if (data.action === 'announce_client') { const row = await findLink(); if (row) await presence.announce(row.id, clientIdentity(data)); }
        else if (data.action === 'unwatch_user') { stopUser(); transmit({ type: 'user', success: true, watching: false }); }
        else if (data.action === 'watch_user') {
          const username = typeof data.username === 'string' ? data.username : '';
          if (!username.trim()) transmit({ type: 'user', success: false, why: 'Missing username.' });
          else {
            // Preserve the LinkChannel contract: invalid API keys fall back to
            // the authenticated connection, unlike the REST user-status route.
            const user = await readUser({ username, viewerId: await authenticateKey(data.api_key) || viewerId });
            if (!user) transmit({ type: 'user', success: false, why: `User ${username} does not exist.` });
            else {
              stopUser();
              const audience = user.self ? 'self' : user.friend ? 'friend' : user.authenticated ? 'authenticated' : 'anonymous';
              istate.node_user_stream = `User::${username}::${audience}`;
              result.streams.push(istate.node_user_stream);
              transmit({ type: 'user', success: true, watching: true, user });
            }
          }
        }
      } else if (params.channel === 'WebPresenceChannel') {
        if (data.action === 'leave_link') await presence.view(viewerId, connectionId, null);
        else if (data.action === 'view_link' && /^\d{1,18}$/.test(String(data.link_id))) await presence.view(viewerId, connectionId, String(data.link_id));
      }
    } else return { status: 2 };
    return result;
  };
}

export function createRealtimeHandler({ rpc, poll, secretKeyBase }) {
  const expected = Buffer.from(`Bearer ${rpcToken(secretKeyBase)}`);
  return async (request, response, url) => {
    const send = (status, data) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-walltaker-backend': 'node-realtime' });
      response.end(JSON.stringify(data));
    };
    const supplied = Buffer.from(request.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, { message: 'Forbidden.' });
    if (request.method !== 'POST') return send(405, { message: 'POST required.' });
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1024 * 1024) return send(413, { message: 'Request too large.' });
      chunks.push(chunk);
    }
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { message: 'Invalid JSON.' }); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return send(400, { message: 'Invalid JSON.' });
    const method = url.pathname.split('/').at(-1);
    if (method === 'poll' && /^\d{1,18}$/.test(String(payload.id))) {
      await poll(String(payload.id), payload.headers || {}); return send(204);
    }
    if (!['connect', 'command', 'disconnect'].includes(method)) return send(404, { message: 'Not found.' });
    return send(200, await rpc(method, payload));
  };
}
