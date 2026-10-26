import {HttpError} from './errors.js';

export function requestPath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\x00-\x20\x7f]/.test(raw) || raw.length > 16384) throw new HttpError(400, 'Invalid request URL.');
  const pathname = new URL(raw, 'http://web.invalid').pathname;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'Invalid URL encoding.'); }
  if (/[\\\x00-\x1f\x7f]/.test(decoded)) throw new HttpError(400, 'Invalid request URL.');
  // Check the path as each upstream could interpret it; never proxy private RPC.
  let probe = decoded;
  for (let i = 0; i < 4; i++) {
    const normalized = new URL(probe.replace(/\/+/g, '/'), 'http://web.invalid').pathname;
    if (/^\/_(?:internal|anycable)(?:\/|$)/i.test(normalized)) throw new HttpError(404, 'This page could not be found.');
    try { const next = decodeURIComponent(probe); if (next === probe) break; probe = next; } catch { break; }
    if (/[\\\x00-\x1f\x7f]/.test(probe)) throw new HttpError(400, 'Invalid request URL.');
    if (i === 3) throw new HttpError(400, 'Invalid URL encoding.');
  }
  return decoded;
}

export class Router {
  routes = [];
  add(method, path, handler, options = {}) {
    const keys = [];
    const pattern = path.split('/').map(part => part.startsWith(':') ? (keys.push(part.slice(1)), '([^/]+)') : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
    this.routes.push({method, pattern:new RegExp('^' + pattern + '$'), keys, handler, ...options});
    return this;
  }
  match(method, path) {
    const candidates = this.routes.map(route => ({route, match:route.pattern.exec(path)})).filter(item => item.match);
    const item = candidates.find(item => item.route.method === (method === 'HEAD' ? 'GET' : method));
    if (item) return {...item.route, params:Object.fromEntries(item.route.keys.map((key, i) => [key, item.match[i + 1]]))};
    if (candidates.length) {
      const methods = [...new Set(candidates.flatMap(({route}) => route.method === 'GET' ? ['GET','HEAD'] : [route.method]))];
      throw new HttpError(405, 'This page does not support that request method.', {allow:methods.join(', ')});
    }
    return null;
  }
}

export function redirectLocation(location, baseUrl) {
  if (typeof location !== 'string' || /[\\\x00-\x20\x7f]/.test(location) || /%(?:0[ad]|5c)/i.test(location) || location.startsWith('//')) throw new HttpError(400, 'Invalid redirect.');
  let url;
  try { url = new URL(location, baseUrl); } catch { throw new HttpError(400, 'Invalid redirect.'); }
  if (url.origin !== new URL(baseUrl).origin || url.username || url.password) throw new HttpError(400, 'Invalid redirect.');
  return url.pathname + url.search + url.hash;
}
