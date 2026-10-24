import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { createTokenResolver } from './token.js';

const RESPONSE_HEADERS = [
  'accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified',
];

function reply(response, status, body = '') {
  response.writeHead(status, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
  response.end(body);
}

export function createMediaServer({
  secretKeyBase,
  userAgent,
  upstreamRequest = https.request,
  openTimeout = 5000,
  readTimeout = 30000,
  logger = console,
}) {
  const resolveToken = createTokenResolver(secretKeyBase);
  if (!userAgent || /[\r\n]/.test(userAgent)) throw new Error('E621_USER_AGENT is required and must be a valid header');

  return http.createServer((request, response) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      return reply(response, 400);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('allow', 'GET, HEAD');
      return reply(response, 405);
    }
    if (url.pathname === '/up') return reply(response, 200, 'OK');
    if (url.pathname !== '/e621-media') return reply(response, 404);
    if (url.searchParams.getAll('token').length !== 1) return reply(response, 404);
    const source = resolveToken(url.searchParams.get('token'));
    if (!source) return reply(response, 404);

    const headers = { 'user-agent': userAgent, referer: 'https://e621.net/' };
    for (const name of ['range', 'if-range']) {
      if (request.headers[name]) headers[name] = request.headers[name];
    }

    let upstream;
    let body;
    let connectTimer;
    const fail = (error) => {
      clearTimeout(connectTimer);
      if (!response.destroyed && !response.writableEnded) {
        logger.warn(`e621 media proxy failed: ${error.code || error.name}`);
        if (response.headersSent) response.destroy();
        else reply(response, 502, 'Upstream media request failed.');
      }
      body?.destroy();
      upstream?.destroy();
    };

    response.on('close', () => {
      clearTimeout(connectTimer);
      body?.destroy();
      upstream?.destroy();
    });

    try {
      upstream = upstreamRequest(source, { method: request.method, headers }, (media) => {
        body = media;
        clearTimeout(connectTimer);
        const status = media.statusCode;
        if (status < 200 || status >= 300) {
          // Never follow redirects; the signed URL is the only allowed origin.
          if (status === 416 && media.headers['content-range']) {
            response.setHeader('content-range', media.headers['content-range']);
          }
          reply(response, status, 'Upstream media request failed.');
          media.destroy();
          return;
        }

        for (const name of RESPONSE_HEADERS) {
          if (media.headers[name] !== undefined) response.setHeader(name, media.headers[name]);
        }
        response.setHeader('cache-control', 'public, max-age=31536000, immutable');
        response.setHeader('content-disposition', 'inline');
        response.setHeader('access-control-allow-origin', '*');
        response.setHeader('cross-origin-resource-policy', 'cross-origin');
        response.writeHead(status);
        if (request.method === 'HEAD') {
          response.end();
          media.destroy();
        } else {
          // pipeline propagates backpressure and tears down truncated streams.
          pipeline(media, response, (error) => {
            if (error && !response.destroyed) fail(error);
          });
        }
      });
      upstream.on('error', fail);
      // A separate deadline includes DNS, TCP and TLS setup. Socket inactivity
      // alone does not bound a slow DNS lookup or connection attempt.
      connectTimer = setTimeout(() => fail(new Error('Upstream connection timeout')), openTimeout);
      upstream.setTimeout(readTimeout, () => fail(new Error('Upstream read timeout')));
      upstream.end();
    } catch (error) {
      fail(error);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createMediaServer({
    secretKeyBase: process.env.SECRET_KEY_BASE,
    userAgent: process.env.E621_USER_AGENT,
  });
  server.listen(Number(process.env.PORT || 3001), '0.0.0.0', () => {
    console.log(`e621 media proxy listening on ${server.address().port}`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
