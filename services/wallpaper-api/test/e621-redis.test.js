import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from 'redis';
import { createE621Store } from '../src/e621-store.js';

test('real Redis shares request slots, cooldowns and expiring search results', { skip: !process.env.TEST_REDIS_URL }, async () => {
  const redis = createClient({ url: process.env.TEST_REDIS_URL }); await redis.connect();
  const keys = ['e621:v1:gate', 'e621:v1:cooldown', 'e621:test:cache'];
  try {
    await redis.del(keys);
    const first = createE621Store(redis), second = createE621Store(redis);
    assert.equal(await first.takeSlot(), 0);
    const wait = await second.takeSlot(); assert.ok(wait > 0 && wait <= 1000);
    await first.pause(2000); await second.pause(1000);
    assert.ok(await second.takeSlot() > 1500);
    await first.set(keys[2], [{ id: 123 }], 60);
    assert.deepEqual(await second.get(keys[2]), [{ id: 123 }]);
    assert.ok(await redis.ttl(keys[2]) > 0);
    await redis.set(keys[2], 'invalid-json'); assert.equal(await first.get(keys[2]), null);
  } finally { await redis.del(keys); await redis.close(); }
});
