import { createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto';

const SOURCE = /^https:\/\/static1\.e621\.net(?::443)?\/data\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{32}\.(?:png|jpe?g|gif|webp|webm|mp4|bmp)$/i;

export function createTokenIssuer(secretKeyBase) {
  if (!secretKeyBase) throw new Error('SECRET_KEY_BASE is required');
  const key = pbkdf2Sync(secretKeyBase, 'e621_media', 1000, 64, 'sha256');
  return (source) => {
    if (typeof source !== 'string' || SOURCE.exec(source)?.[0] !== source) return null;
    // Match Rails' exact host restriction before URL normalizes host case.
    if (!/^https:\/\/static1\.e621\.net(?::443)?\//.test(source)) return null;
    const data = Buffer.from(new URL(source).href);
    const marshal = Buffer.concat([
      Buffer.from([4, 8, 0x49, 0x22, data.length + 5]), data, Buffer.from([6, 0x3a, 6, 0x45, 0x54]),
    ]);
    const payload = Buffer.from(JSON.stringify({
      _rails: { message: marshal.toString('base64'), exp: null, pur: 'e621_media' },
    })).toString('base64');
    return `${payload}--${createHmac('sha1', key).update(payload).digest('hex')}`;
  };
}

// Only the literal string emitted by the existing Rails verifier is accepted.
// This is deliberately not a general Ruby Marshal deserializer.
function railsString(bytes) {
  if (bytes[0] !== 4 || bytes[1] !== 8) return null;
  const encoded = bytes[2] === 0x49; // I: a string with an encoding attribute
  const offset = encoded ? 3 : 2;
  if (bytes[offset] !== 0x22) return null;
  const size = bytes[offset + 1] - 5;
  if (size < 1 || size > 122) return null;
  const end = offset + 2 + size;
  const suffix = bytes.subarray(end);
  if (encoded) {
    // One :E attribute, true (UTF-8) or false (US-ASCII).
    if (!suffix.equals(Buffer.from([6, 0x3a, 6, 0x45, 0x54])) &&
        !suffix.equals(Buffer.from([6, 0x3a, 6, 0x45, 0x46]))) return null;
  } else if (suffix.length !== 0) {
    return null;
  }
  return bytes.subarray(offset + 2, end).toString('utf8');
}

export function createTokenResolver(secretKeyBase) {
  if (!secretKeyBase) throw new Error('SECRET_KEY_BASE is required');
  // Rails 7.0 defaults: SHA256 key generation, 1000 iterations, 64 bytes.
  const key = pbkdf2Sync(secretKeyBase, 'e621_media', 1000, 64, 'sha256');

  return (token) => {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const match = /^([A-Za-z0-9+/=]+)--([0-9a-f]{40})$/.exec(token);
    if (!match) return null;
    const [, payload, signature] = match;
    const expected = createHmac('sha1', key).update(payload).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;

    try {
      const metadata = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))._rails;
      if (metadata?.pur !== 'e621_media') return null;
      if (metadata.exp != null) {
        const expires = Date.parse(metadata.exp);
        if (!Number.isFinite(expires) || expires <= Date.now()) return null;
      }
      const source = railsString(Buffer.from(metadata.message, 'base64'));
      // Validate the raw URL before URL normalization can hide path traversal,
      // credentials, query strings, fragments, or a different origin.
      if (!source || SOURCE.exec(source)?.[0] !== source) return null;
      const uri = new URL(source);
      if (uri.hostname !== 'static1.e621.net') return null;
      return uri;
    } catch {
      return null;
    }
  };
}
