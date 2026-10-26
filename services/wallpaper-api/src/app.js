import http from 'node:http';
import { createSerializer, widget } from './payload.js';
import { CommandError } from './updates.js';
import { readApiBody } from './body.js';

export function createApiServer({ repository, store, reportPresence, internalHandler, e621Handler, linkHandler, realtimeHandler, socialHandler, discoveryHandler, trackerHandler, moderationHandler, automationHandler, activityHandler, browserHandler, blazerHandler, readUser, authenticateKey, sessionViewer,
  writeReaction, secretKeyBase, baseUrl, logger = console, now = Date.now }) {
  const serialize = createSerializer({ secretKeyBase, baseUrl });
  return http.createServer(async (request, response) => {
    const send = (status, data) => {
      response.statusCode = status;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader('x-walltaker-backend', 'node-wallpaper-api');
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(data));
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      if(url.pathname.startsWith('/_internal/blazer/')&&blazerHandler)return await blazerHandler(request,response,url);
      if (url.pathname.startsWith('/_internal/browser/') && browserHandler) return await browserHandler(request, response, url);
      if (url.pathname.startsWith('/_internal/activity/') && activityHandler) return await activityHandler(request, response, url);
      if (url.pathname.startsWith('/_internal/automation/') && automationHandler) return await automationHandler(request, response, url);
      if (url.pathname.startsWith('/_internal/moderation/') && moderationHandler) return await moderationHandler(request, response, url);
      if (url.pathname.startsWith('/_internal/tracker/') && trackerHandler) return await trackerHandler(request, response, url);
      if (url.pathname.startsWith('/_internal/discovery/') && discoveryHandler) return await discoveryHandler(request, response, url);
      if (url.pathname.startsWith('/_internal/realtime-rpc/') && realtimeHandler) return await realtimeHandler(request, response, url);
      if (url.pathname.startsWith('/_internal/e621/') && e621Handler) return await e621Handler(request, response, url);
      if (url.pathname.startsWith('/_internal/social/') && socialHandler) return await socialHandler(request, response, url);
      if (url.pathname.startsWith('/_internal/links/') && linkHandler) return await linkHandler(request, response, url);
      if (url.pathname.startsWith('/_internal/')) {
        return internalHandler ? await internalHandler(request, response, url) : send(404, { message: 'Not found.' });
      }
      const match = /^\/api\/links\/(\d+)(\.json|\/widget\.json)$/.exec(url.pathname);
      const reaction = /^\/api\/links\/(\d+)\/response\.json$/.exec(url.pathname);
      const userStatus = /^\/api\/users\/([^/]+)\.json$/.exec(url.pathname);
      const listing = url.pathname === '/api/links.json';
      if (url.pathname === '/up' && ['GET', 'HEAD'].includes(request.method)) {
        await Promise.all([repository.health(), store.health()]);
        return send(200, { status: 'ok' });
      }
      if (!listing && !match && !reaction && !userStatus) return send(404, { message: 'Not found.' });
      const methods = reaction ? 'POST, OPTIONS' : 'GET, HEAD, OPTIONS';
      if (request.method === 'OPTIONS') {
        response.setHeader('access-control-allow-methods', methods);
        response.setHeader('access-control-allow-headers', 'Content-Type, Joihow, User_Agent, Wallpaper-Engine-Client, Idempotency-Key');
        return send(204);
      }
      if (!(reaction ? request.method === 'POST' : ['GET', 'HEAD'].includes(request.method))) {
        response.setHeader('allow', methods);
        return send(405, { message: 'Method not allowed.' });
      }
      const time = now();
      const ip = request.headers['x-forwarded-for']?.split(',')[0].trim() || request.socket.remoteAddress;
      const retry = await store.limit(ip, url.pathname, time);
      if (retry) {
        response.setHeader('retry-after', retry);
        return send(429, { message: 'Rate limit exceeded.' });
      }
      if (userStatus) {
        response.setHeader('vary', 'Cookie');
        let username;
        try { username = decodeURIComponent(userStatus[1]); } catch { /* Missing users return the legacy 404. */ }
        if (!username || !/^[a-zA-Z0-9]+$/.test(username)) return send(404, { message: 'This user does not exist.' });
        const key = url.searchParams.get('api_key');
        // An explicitly supplied invalid key must not fall back to a cookie.
        const viewerId = key?.trim() ? await authenticateKey(key) : await sessionViewer(request.headers);
        const payload = await readUser({ username, viewerId, now: time });
        return payload ? send(200, payload) : send(404, { message: 'This user does not exist.' });
      }
      if (reaction) {
        const params = { ...Object.fromEntries(url.searchParams), ...await readApiBody(request) };
        const row = await repository.find(reaction[1]);
        if (!row) return send(404, { message: 'This link does not exist.' });
        const ownerId = await authenticateKey(params.api_key);
        if (!ownerId || String(ownerId) !== String(row.user_id)) {
          return send(403, { message: `Bad API key. Get an API key from your profile page on ${new URL(baseUrl).hostname}` });
        }
        if (!writeReaction) throw new CommandError(503, 'Reaction writes are not configured.');
        await writeReaction({ link_id: reaction[1], owner_id: ownerId, type: params.type ?? 'horny', text: params.text ?? '',
          expected_post_url: row.post_url, request_key: request.headers['idempotency-key'] });
        const saved = await repository.find(reaction[1]);
        if (!saved) return send(404, { message: 'This link does not exist.' });
        const connected = await store.connected([String(saved.id)]);
        const payload = serialize(saved, { detail: true, connected: connected.has(String(saved.id)), now: time });
        delete payload.url; // Reaction responses use api/_link, not api/show_link.
        return send(200, payload);
      }
      if (listing) {
        const onlyOnline = url.searchParams.has('online') || url.searchParams.has('online[]');
        const onlineIds = onlyOnline ? await store.onlineIds() : [];
        const rows = await repository.list({ onlyOnline, onlineIds, now: time });
        const connected = await store.connected(rows.map((row) => String(row.id)));
        return send(200, rows.map((row) => serialize(row, { connected: connected.has(String(row.id)), now: time })));
      }
      const row = await repository.find(match[1]);
      if (!row) return send(404, { message: 'This link does not exist.' });
      const isWidget = match[2] === '/widget.json';
      let payload;
      if (isWidget) payload = widget(row, baseUrl);
      else {
        const connected = await store.connected([String(row.id)]);
        payload = serialize(row, { detail: true, connected: connected.has(String(row.id)), now: time });
      }
      // Node records the heartbeat and queues replacement broadcasts. A
      // transient presence failure must not prevent fetching the wallpaper.
      try { await reportPresence(row.id, request.headers); }
      catch (error) { logger.warn(`Wallpaper presence failed: ${error.name}`); }
      return send(200, payload);
    } catch (error) {
      if (error instanceof CommandError) return send(error.status, { message: error.message });
      logger.error(`Wallpaper API failed: ${error.code || error.name}`);
      return send(503, { message: 'Wallpaper API temporarily unavailable.' });
    }
  });
}
