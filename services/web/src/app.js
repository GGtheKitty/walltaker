import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {createBackend} from './backend.js';
import {Cookies, Flash, createFlashCodec} from './cookies.js';
import {HttpError, errorResponse} from './errors.js';
import {readForm, parseFields, formMethod} from './forms.js';
import {requestPath, redirectLocation} from './router.js';
import {createRoutes} from './routes.js';
import {createBroadcastHandler} from './broadcasts.js';
import {createTemplates} from './templates/index.js';
import {serveAsset} from './native-assets.js';

export function clientIp(req, hops = 0) {
  const chain = [...String(req.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean), req.socket.remoteAddress];
  const value = chain[Math.max(0, chain.length - 1 - hops)]?.replace(/^::ffff:/, '');
  if (!isIP(value || '')) throw new HttpError(400, 'Invalid client address.');
  return value;
}

export function createApp(config, {backend, router = createRoutes(), logger = console} = {}) {
  const base = new URL(config.baseUrl);
  if (!['http:','https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid public URL');
  const trustedHops = config.trustProxyHops ?? 0;
  if (!config.secretKeyBase || !Number.isInteger(trustedHops) || trustedHops < 0 || trustedHops > 8) throw new Error('Invalid web configuration');
  const call = backend || createBackend({secretKeyBase:config.secretKeyBase, baseUrl:config.backendUrl,accountsUrl:config.accountsUrl});
  const templates = createTemplates(config.secretKeyBase);
  const broadcasts=createBroadcastHandler(config);
  const codec = createFlashCodec(config.secretKeyBase);
  return async (req, res) => {
    const requestId = randomUUID(); let ctx;
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-walltaker-web', 'node');
    res.setHeader('x-content-type-options', 'nosniff');
    try {
      if(req.url==='/_internal/broadcasts/render')return await broadcasts(req,res);
      const path = requestPath(req.url);
      if (await serveAsset(req,res,path,config)) return;
      if (req.method === 'CONNECT' || req.method === 'TRACE') throw new HttpError(405, 'Unsupported request method.');
      // Unknown URLs fail locally, before forms or sessions are read.
      let route;
      if (req.method === 'POST') { try { route = router.match('POST', path); } catch (error) { if (error.status !== 405) throw error; route = {pendingMethod:true}; } }
      else route = router.match(req.method, path);
      if (!route) throw new HttpError(404,'This page could not be found.');
      if (req.headers.host) {
        let host;
        try { host = new URL('http://' + req.headers.host); } catch { throw new HttpError(400, 'Invalid host.'); }
        if (host.username || host.password || host.pathname !== '/' || host.search || host.hash || ![base.hostname.toLowerCase(),'localhost','127.0.0.1','node_web'].includes(host.hostname.toLowerCase())) throw new HttpError(400, 'Invalid host.');
      }
      ctx = {req, res, config, path, params:route.params || {}, requestId, originalUrl:base.origin + req.url, ip:clientIp(req, trustedHops),
        prefetch:/prefetch/i.test([req.headers.purpose,req.headers['sec-purpose'],req.headers['x-purpose']].join(' ')),
        cookies:new Cookies(req.headers.cookie, base.protocol === 'https:'),
      };
      ctx.flash = new Flash(ctx.cookies, codec);
      ctx.templates = templates;
      ctx.call = (group, operation, input = {}) => call(group, operation, input, {cookie:ctx.cookies.header(), requestId});
      ctx.applyCookies = result => {
        if (result.clear_legacy) { ctx.cookies.delete('permanent_session_id'); ctx.cookies.delete('surrender_id'); ctx.flash.clearIdentity(); }
        if (result.clear_session) ctx.cookies.delete('walltaker_session');
        for (const cookie of result.cookies || []) if (['walltaker_session','walltaker_csrf'].includes(cookie.name)) ctx.cookies.set(cookie.name, cookie.value, {expires:cookie.expires_at});
      };
      ctx.transition = result => { ctx.flash.reset(); ctx.applyCookies(result); ctx.auth = result; };
      ctx.send = (status, body, headers = {}) => {
        ctx.response = {status, body, headers};
      };
      ctx.redirect = (location, status = req.method === 'GET' || req.method === 'HEAD' ? 302 : 303) => {
        if (![301,302,303,307,308].includes(status)) throw new Error('Invalid redirect status');
        ctx.send(status, '', {location:redirectLocation(location, config.baseUrl)});
      };
      ctx.authorize = async (mode = 'standard') => {
        if (!ctx.auth.user) { ctx.flash.set('alert', 'Not authorized'); ctx.redirect('/login'); return false; }
        const result = await ctx.call('browser', 'authorize', {mode, ip:ctx.ip, method:ctx.method, path, request_key:requestId});
        if (result.redirect) { ctx.flash.set('alert', 'This account is currently surrendered.'); ctx.redirect(result.redirect); return false; }
        return result.allowed;
      };
      ctx.query = parseFields(new URL(req.url, base).searchParams);
      ctx.body = await readForm(req);
      ctx.method = formMethod(req.method, ctx.body);
      route = router.match(ctx.method, path);
      if (!route) throw new HttpError(405, 'Unsupported request method.');
      ctx.params = route.params;
      if (!route.public) {
        // CSRF is checked against the browser's original cookie before a
        // context lookup can rotate or migrate it during this request.
        if (!['GET','HEAD','OPTIONS'].includes(ctx.method)) {
          const result = await ctx.call('browser', 'csrf', {tokens:[ctx.body.authenticity_token, req.headers['x-csrf-token']], method:ctx.method, path, origin:req.headers.origin || null});
          if (!result.verified) throw new HttpError(422, 'Your form expired or could not be verified. Please reload and try again.');
        }
        ctx.auth = await ctx.call('browser', 'context', {path, ip:ctx.ip});
        ctx.applyCookies(ctx.auth);
        if (ctx.auth.evil_blocked) { ctx.flash.set('alert', 'The evil account is unavailable while invite-only mode is enabled.'); ctx.redirect('/login'); }
      }
      if (!ctx.response) await route.handler(ctx);
      if (!ctx.response) throw new Error('Route did not produce a response');
      ctx.flash.commit();
      const {status, body, headers} = ctx.response;
      const responseHeaders = {'cache-control':'no-store', 'x-frame-options':'SAMEORIGIN', 'referrer-policy':'strict-origin-when-cross-origin', ...headers, ...(ctx.cookies.headers().length ? {'set-cookie':ctx.cookies.headers()} : {})};
      if (headers['x-frame-options'] === null) delete responseHeaders['x-frame-options'];
      res.writeHead(status,responseHeaders);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      req.resume();
      if (res.headersSent) { if (!res.writableEnded) res.destroy(); return; }
      const result = errorResponse(error, requestId, req.headers.accept);
      if (result.status >= 500) logger.error(JSON.stringify({event:'node-web-error', request_id:requestId, status:result.status}));
      // Failed submissions never serialize the submitted form or exception.
      res.writeHead(result.status, {'content-type':result.type, 'cache-control':'no-store', ...(error instanceof HttpError ? error.headers : {}), ...(ctx?.cookies.headers().length ? {'set-cookie':ctx.cookies.headers()} : {})});
      res.end(req.method === 'HEAD' ? undefined : result.body);
    }
  };
}

export function createServer(config, options) {
  const server = http.createServer({maxHeaderSize:32768, requestTimeout:30000, headersTimeout:15000, keepAliveTimeout:5000}, createApp(config, options));
  server.maxRequestsPerSocket = 1000;
  return server;
}
