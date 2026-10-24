import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSerializer, online, widget } from '../src/payload.js';
import { createTokenIssuer, createTokenResolver } from '../../e621-media/src/token.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/rails.json', import.meta.url)));
const serialize = createSerializer(fixture);

test('detail, listing and widget match JSON rendered by the actual Rails views', () => {
  assert.deepEqual(serialize(fixture.row, { detail: true }), fixture.detail);
  assert.deepEqual(serialize(fixture.row), fixture.listEntry);
  assert.deepEqual(widget(fixture.row, fixture.baseUrl), fixture.widget);
});

test('signed backup URLs are accepted by the existing media proxy', () => {
  const payload = serialize(fixture.row);
  const token = new URL(payload.post_url_backup).searchParams.get('token');
  assert.equal(createTokenResolver(fixture.secretKeyBase)(token).href, fixture.row.post_url);
  assert.equal(createTokenIssuer(fixture.secretKeyBase)('https://evil.test/file.jpg'), null);
});

test('does not disclose owner secrets or list setters and preserves optional fields', () => {
  const row = { ...fixture.row, api_key: 'secret', email: 'secret@example.test', post_description: ' ',
    post_url: 'https://example.test/image.jpg', response_type: null, set_by_username: null };
  const payload = serialize(row, { detail: true });
  for (const key of ['email', 'api_key', 'set_by', 'post_description', 'last_ping', 'last_ping_user_agent']) {
    assert.equal(key in payload, false, key);
  }
  assert.equal(payload.response_type, null);
  assert.equal(payload.post_url_backup, null);
  assert.equal(widget({ ...row, post_thumbnail_url: null }, fixture.baseUrl).data.wallpaper, '');
  assert.equal(widget(row, fixture.baseUrl).layouts.large_layout.layers.length, 1);
});

test('preserves one-minute polling, twenty-minute widgets and WebSocket presence', () => {
  const now = Date.now();
  const row = { last_ping: new Date(now - 120000), last_ping_user_agent: 'Client/1' };
  assert.equal(online(row, false, now), false);
  assert.equal(online({ ...row, last_ping_user_agent: 'widgetExtension' }, false, now), true);
  assert.equal(online({ ...row, last_ping: null }, true, now), true);
  assert.equal(online({ last_ping: new Date(now), last_ping_user_agent: null }, false, now), false);
  assert.equal(online({ last_ping: new Date(now), last_ping_user_agent: '' }, false, now), true);
  assert.equal(online({ ...row, last_ping: new Date(now - 60000) }, false, now), false);
});
