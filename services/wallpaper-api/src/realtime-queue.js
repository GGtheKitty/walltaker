// Coalesce replacement broadcasts without losing an update that arrives while
// an older version is being delivered. Redis persists this queue across restarts.
export const QUEUE_KEYS = ['node:realtime:pending', 'node:realtime:versions'];
export const ENQUEUE = `local v = redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1]); return v`;
const ACK = `if redis.call('HGET', KEYS[2], ARGV[1]) == ARGV[2] then
  redis.call('ZREM', KEYS[1], ARGV[1]); redis.call('HDEL', KEYS[2], ARGV[1]); return 1 end; return 0`;
const RETRY = `if redis.call('HGET', KEYS[2], ARGV[1]) == ARGV[2] then
  redis.call('ZADD', KEYS[1], ARGV[3], ARGV[1]) end; return 1`;

export function createRealtimeQueue(redis) {
  return {
    enqueue: (job) => redis.eval(ENQUEUE, { keys: QUEUE_KEYS, arguments: [job, String(Date.now())] }),
    async drain(deliver) {
      const jobs = await redis.zRangeByScore(QUEUE_KEYS[0], 0, Date.now(), { LIMIT: { offset: 0, count: 10 } });
      for (const job of jobs) {
        const version = await redis.hGet(QUEUE_KEYS[1], job);
        if (version == null) continue;
        try {
          await deliver(job);
          await redis.eval(ACK, { keys: QUEUE_KEYS, arguments: [job, version] });
        } catch (error) {
          await redis.eval(RETRY, { keys: QUEUE_KEYS, arguments: [job, version, String(Date.now() + 5000)] });
          throw error;
        }
      }
    },
  };
}

export function startRealtimeDelivery({ queue, deliver, interval = 250, logger = console }) {
  let running, stopped = false;
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = queue.drain(deliver).catch((error) => logger.warn(`Realtime delivery failed: ${error.code || error.name}`))
      .finally(() => { running = undefined; });
  }, interval);
  timer.unref();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
