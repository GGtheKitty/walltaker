import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { normalizeSettings } from '../src/link-settings.js';
import { applyWizard } from '../src/link-wizard.js';
import { exportLink } from '../src/link-export.js';
import { createApiServer } from '../src/app.js';
import { createLinkHandler, linkToken } from '../src/link-handler.js';
import { commandToken } from '../src/internal.js';

test('settings validation preserves Rails form booleans and link restrictions', () => {
  const saved = normalizeSettings({ never_expires: '1', friends_only: '0', min_score: '300', theme: 'forest', custom_url: 'my_link' }, {}, 300);
  assert.equal(saved.never_expires, true); assert.equal(saved.friends_only, false); assert.equal(saved.min_score, 300);
  assert.equal(saved.custom_url, 'my_link');
  assert.equal(normalizeSettings({ never_expires: true, min_score: 0, custom_url: 'not valid!' }, {}, 299).custom_url, null);
  for (const attributes of [{ min_score: 0 }, { never_expires: true, min_score: -1 }, { never_expires: true, min_score: 301 },
    { never_expires: true, min_score: 0, theme: 'two tags' }, { never_expires: true, min_score: 0, theme: 'score:50' },
    { never_expires: true, min_score: 0, custom_url: 'not valid!' }, { user_id: 1 }, { post_url: 'injected' }]) {
    assert.throws(() => normalizeSettings(attributes, {}, 300), { status: 422 });
  }
});

test('wizard choices preserve scores, abilities, blacklists, preferences and completion', () => {
  const intro = applyWizard('intro', { gooner: 'true' }, {});
  assert.deepEqual(intro.user, { pervert: true, mascot: 'taylor' }); assert.equal(intro.changes.min_score, 10);
  const summon = applyWizard('summon', { impatient: 'true' }, { min_score: 10 });
  assert.equal(summon.changes.min_score, 0); assert.deepEqual(summon.enable, ['can_be_set_by_lizard']);
  const protection = applyWizard('control', { protect: '3' }, { min_score: 40, blacklist: '' });
  assert.equal(protection.changes.min_score, 55); assert.match(protection.changes.blacklist, /gore scat$/);
  const gender = applyWizard('gender', { blacklisted_genders: ['female'], blacklisted_parts: ['cocks'], blacklisted_sexualities: ['gay'] }, { blacklist: 'gore' });
  assert.equal(gender.changes.blacklist, 'gore female_focus girly penis female/female'); assert.equal(gender.user.mascot, 'warren');
  assert.equal(applyWizard('surprise', { theme: 'forest ' }, {}).changes.theme, 'forest');
  assert.equal(applyWizard('no_fun', { friends_only: 'true' }, {}).wizardPage, null);
  assert.throws(() => applyWizard('control', { protect: '999' }, {}), { status: 422 });
  assert.throws(() => applyWizard('gender', { blacklisted_genders: ['unexpected'] }, {}), { status: 422 });
});

test('export keeps existing client configuration keys and values', () => {
  const text = exportLink('123', 'https://example.test/', new Date('2026-01-01Z'));
  for (const line of ['[Base]', 'base = "https://example.test/links/"', '[Feed]', 'feed = 123', '[Preferences]',
    'interval = 10', 'mode = "crop"', 'discordPresence = false', 'saveLocally = false', 'notifications = false']) assert.ok(text.includes(line));
});

test('management HTTP routes require a separate service credential and JSON', async (t) => {
  const calls = [];
  const server = createApiServer({ secretKeyBase: 'test', baseUrl: 'https://example.test',
    linkHandler: createLinkHandler({ secretKeyBase: 'test', manage: async (operation, input) => { calls.push([operation, input]); return { ok: true }; } }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/_internal/links/create`;
  for (const authorization of ['', `Bearer ${commandToken('test')}`, 'Bearer invalid']) {
    assert.equal((await fetch(url, { method: 'POST', headers: { authorization, cookie: 'session' }, body: '{}' })).status, 403);
  }
  const headers = { authorization: `Bearer ${linkToken('test')}`, 'content-type': 'application/json' };
  assert.equal((await fetch(url, { headers })).status, 405);
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{' })).status, 400);
  const response = await fetch(url, { method: 'POST', headers, body: '{"actor_id":1}' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-walltaker-backend'), 'node-link-manager');
  assert.deepEqual(calls, [['create', { actor_id: 1 }]]);
});
