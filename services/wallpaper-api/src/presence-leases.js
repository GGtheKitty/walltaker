export const PRESENCE_TTL = 5 * 60;
export const presenceKey = id => `link:${id}:ws_client_leases`;
export const READ_PRESENCE = `local counts = {}
 for i, key in ipairs(KEYS) do
  redis.call('ZREMRANGEBYSCORE', key, '-inf', ARGV[1])
  counts[i] = redis.call('ZCARD', key)
 end
 return counts`;
export async function connectedIds(redis, ids, now = Date.now()) {
 if (!ids.length) return new Set();
 const counts = await redis.eval(READ_PRESENCE, {keys:ids.map(presenceKey), arguments:[String(now/1000-PRESENCE_TTL)]});
 return new Set(ids.filter((_,i)=>Number(counts[i])>0).map(String));
}
