import { createHash } from 'node:crypto';
import {connectedIds} from './presence-leases.js';

const RATE = `local n = redis.call('INCR', KEYS[1]);
  if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end; return n`;

export function createRedisStore(client, {now=Date.now}={}) {
  return {
    async connected(ids) {
      return connectedIds(client, ids, now());
    },
    async onlineIds() {
      const ids = [];
      for await (const batch of client.scanIterator({ MATCH: 'link:*:ws_client_leases', COUNT: 200 })) {
        const candidates = (Array.isArray(batch) ? batch : [batch]).map(key => /^link:(\d+):ws_client_leases$/.exec(key)?.[1]).filter(Boolean);
        ids.push(...await connectedIds(client,candidates,now()));
      }
      return ids;
    },
    async limit(ip, path, now) {
      // Match the existing Rails exemption for the frequently polled user API.
      if (/^\/api\/users\/\w+\.json$/.test(path)) return 0;
      const identity = createHash('sha256').update(ip).digest('hex');
      const count = async (scope, window) => Number(await client.eval(RATE, {
        keys: [`wallpaper-api:rate:${identity}:${scope}:${Math.floor(now / window)}`], arguments: [String(window)],
      }));
      if (await count('all', 60000) > 250) return 60 - Math.floor(now / 1000) % 60;
      if (/^\/api\/links\/\d+\.json$/.test(path) && await count(path, 10000) > 3) {
        return 10 - Math.floor(now / 1000) % 10;
      }
      return 0;
    },
    async health() { await client.ping(); },
  };
}
