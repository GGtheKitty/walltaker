import assert from 'node:assert/strict';
import test from 'node:test';
import { createTokenResolver } from '../src/token.js';
import { fixture, sign } from './helpers.js';

const resolve = createTokenResolver(fixture.secretKeyBase);

test('accepts an actual Rails token with unchanged URL', () => {
  assert.equal(resolve(fixture.token)?.href, fixture.source);
  assert.equal(sign(fixture.source), fixture.token);
});

test('requires a secret and rejects tokens signed with another key', () => {
  assert.throws(() => createTokenResolver(''), /SECRET_KEY_BASE/);
  assert.equal(createTokenResolver('different-secret')(fixture.token), null);
});

test('rejects invalid signatures, malformed metadata and unsupported Marshal values', () => {
  for (const token of [
    null, '', 'x'.repeat(2049), `${fixture.token}changed`, fixture.token.replace(/^./, 'X'),
    sign(fixture.source, { purpose: 'other-purpose' }),
    sign(fixture.source, { serialized: Buffer.from([4, 8, 0x6f]) }),
    sign(fixture.source, { serialized: Buffer.concat([Buffer.from([4, 8, 0x49, 0x22, 5]), Buffer.from('junk')]) }),
  ]) assert.equal(resolve(token), null);
});

test('enforces expiry when supplied by Rails', () => {
  assert.equal(resolve(sign(fixture.source, { expires: '2000-01-01T00:00:00Z' })), null);
  assert.equal(resolve(sign(fixture.source, { expires: 'invalid' })), null);
  assert.equal(resolve(sign(fixture.source, { expires: '2100-01-01T00:00:00Z' }))?.href, fixture.source);
});

test('valid signatures cannot turn this into an open proxy', () => {
  for (const source of [
    fixture.source.replace('https:', 'http:'),
    fixture.source.replace('static1.e621.net', '127.0.0.1'),
    fixture.source.replace('static1.e621.net', 'static1.e621.net.evil.test'),
    fixture.source.replace('static1.e621.net', 'user@static1.e621.net'),
    fixture.source.replace('static1.e621.net', 'static1.e621.net:8443'),
    fixture.source.replace('/data/', '/other/../data/'),
    fixture.source.replace('/data/', '/%64ata/'),
    fixture.source.replace('.jpg', '.svg'),
    fixture.source.replace('/ab/cd/', '/preview/ab/cd/'),
    'https://static1.e621.net/posts.json',
    `${fixture.source}?x=1`, `${fixture.source}#fragment`, `${fixture.source}\n`,
  ]) assert.equal(resolve(sign(source)), null, source);
});

test('supports the existing media extensions and explicit TLS port', () => {
  for (const extension of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'webm', 'mp4', 'bmp', 'JPG']) {
    const source = fixture.source.replace('.jpg', `.${extension}`);
    assert.equal(resolve(sign(source))?.href, source);
  }
  assert.equal(resolve(sign(fixture.source.replace('.net/', '.net:443/')))?.href, fixture.source);
});
