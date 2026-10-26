import {createCipheriv, pbkdf2Sync, randomBytes} from 'node:crypto';
import {browserCookies, createLegacyCookies} from '../../wallpaper-api/src/browser-cookies.js';

export class Cookies {
  constructor(header, secure) { this.values = browserCookies(header); this.secure = secure; this.pending = new Map(); }
  set(name, value, {expires, maxAge, httpOnly = true} = {}) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('Invalid cookie name');
    let cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
    if (httpOnly) cookie += '; HttpOnly';
    if (this.secure) cookie += '; Secure';
    if (expires) cookie += '; Expires=' + new Date(expires).toUTCString();
    if (maxAge !== undefined) cookie += '; Max-Age=' + Math.max(0, Math.floor(maxAge));
    if (Buffer.byteLength(cookie) > 4096) throw new Error('Cookie too large');
    this.pending.set(name, cookie);
    if (maxAge === 0) delete this.values[name]; else this.values[name] = value;
  }
  delete(name) { this.set(name, '', {maxAge:0, expires:new Date(0)}); }
  header() { return Object.entries(this.values).map(([key, value]) => key + '=' + encodeURIComponent(value)).join('; '); }
  headers() { return [...this.pending.values()]; }
}

// Use the existing encrypted Rails cookie for flash during the transition.
// Auth identities and CSRF remain owned entirely by the Node browser backend.
export function createFlashCodec(secret) {
  const reader = createLegacyCookies(secret), key = pbkdf2Sync(secret, 'authenticated encrypted cookie', 1000, 32, 'sha256');
  return {
    read: value => reader.encrypted(value)?.value,
    write(value) {
      const envelope = {_rails:{message:Buffer.from(JSON.stringify(value)).toString('base64'), exp:null, pur:'cookie._walltaker_session'}};
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([cipher.update(JSON.stringify(envelope)), cipher.final()]);
      return [bytes, iv, cipher.getAuthTag()].map(part => part.toString('base64')).join('--');
    },
  };
}

export class Flash {
  constructor(cookies, codec) {
    this.cookies = cookies; this.codec = codec; this.dirty = false;
    const value = codec.read(cookies.values._walltaker_session);
    this.session = value && typeof value === 'object' && !Array.isArray(value) ? {...value} : {session_id:randomBytes(16).toString('hex')};
    const entries = this.session.flash?.flashes || {}, discarded = this.session.flash?.discard || [];
    this.values = Object.fromEntries(Object.entries(entries).filter(([key, msg]) => /^[a-z_]{1,40}$/.test(key) && typeof msg === 'string' && msg.length <= 1200 && !discarded.includes(key)));
    this.written = {};
  }
  set(type, message) {
    if (!/^[a-z_]{1,40}$/.test(type) || typeof message !== 'string' || message.length > 1200) throw new Error('Invalid flash message');
    this.values[type] = message; this.written[type] = message;
    this.session.flash = {discard:[], flashes:{...this.values}}; this.dirty = true;
  }
  consume() {
    if (this.session.flash) {
      if (Object.keys(this.written).length) this.session.flash = {discard:[], flashes:{...this.written}};
      else delete this.session.flash;
      this.dirty = true;
    }
  }
  clearIdentity() { if ('user_id' in this.session) { delete this.session.user_id; this.dirty = true; } }
  reset() { this.session = {session_id:randomBytes(16).toString('hex')}; this.values = {}; this.written = {}; this.dirty = true; }
  commit() { if (this.dirty) this.cookies.set('_walltaker_session', this.codec.write(this.session)); }
}
