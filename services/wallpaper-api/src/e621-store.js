// All e621 API consumers share one request gate, including chat previews and
// bot/fork lookups. Redis coordinates it across restarts and service replicas.
const SLOT = `local cooldown = redis.call('PTTL', KEYS[2]);
  if cooldown > 0 then return cooldown end;
  if redis.call('SET', KEYS[1], '1', 'NX', 'PX', ARGV[1]) then return 0 end;
  return math.max(1, redis.call('PTTL', KEYS[1]))`;
const PAUSE = `if redis.call('PTTL', KEYS[1]) < tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], '1', 'PX', ARGV[1]) end; return 1`;

export function createE621Store(redis) {
  return {
    async get(key) {
      const value = await redis.get(key);
      if (value == null) return null;
      try { return JSON.parse(value); } catch { return null; }
    },
    async set(key, data, ttl) { await redis.set(key, JSON.stringify(data), { EX: ttl }); },
    async takeSlot() {
      return Number(await redis.eval(SLOT, { keys: ['e621:v1:gate', 'e621:v1:cooldown'], arguments: ['1000'] }));
    },
    async pause(milliseconds) {
      await redis.eval(PAUSE, { keys: ['e621:v1:cooldown'], arguments: [String(milliseconds)] });
    },
  };
}
