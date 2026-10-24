import { createHash, randomUUID } from 'node:crypto';
import { CommandError } from './updates.js';

export const automationKey = (prefix, value) => `${prefix}:${createHash('sha256').update(String(value)).digest('hex')}`;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

// This accepts an existing transaction so wallpaper writes, child jobs and
// newsroom work either all commit or all roll back together.
export async function enqueueAutomation(c, { key, kind, payload = {}, runAt = new Date() }) {
  const result = await c.query(`INSERT INTO node_automation_jobs
    (job_key,kind,payload,run_at,created_at,updated_at) VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT (job_key) DO NOTHING RETURNING id`, [key, kind, JSON.stringify(payload), runAt]);
  if (result.rowCount) return { job_id: result.rows[0].id, replayed: false };
  const prior = (await c.query('SELECT id,kind,payload FROM node_automation_jobs WHERE job_key=$1', [key])).rows[0];
  if (prior.kind !== kind || JSON.stringify(canonical(prior.payload)) !== JSON.stringify(canonical(payload))) {
    throw new CommandError(409, 'Automation request key reused for different work.');
  }
  return { job_id: prior.id, replayed: true };
}

export function createAutomationQueue(pool, { leaseSeconds = 60, maxAttempts = 8 } = {}) {
  const owner = randomUUID();
  return {
    enqueue: job => enqueueAutomation(pool, job),
    async claim() {
      // Expired work remains retryable after an unclean shutdown. Each claim
      // gets a distinct token, preventing a late worker from acknowledging it.
      await pool.query(`UPDATE node_automation_jobs SET status=CASE WHEN attempts >= $1 THEN 'failed' ELSE 'queued' END,
        locked_at=NULL,locked_by=NULL,updated_at=CURRENT_TIMESTAMP,last_error='LeaseExpired'
        WHERE status='running' AND locked_at < CURRENT_TIMESTAMP - $2::integer * INTERVAL '1 second'`, [maxAttempts, leaseSeconds]);
      const token = `${owner}:${randomUUID()}`;
      return (await pool.query(`UPDATE node_automation_jobs SET status='running',attempts=attempts+1,
        locked_at=CURRENT_TIMESTAMP,locked_by=$1,updated_at=CURRENT_TIMESTAMP WHERE id=(
          SELECT id FROM node_automation_jobs WHERE status='queued' AND run_at<=CURRENT_TIMESTAMP
          ORDER BY run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [token])).rows[0] || null;
    },
    heartbeat: job => pool.query(`UPDATE node_automation_jobs SET locked_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND status='running' AND locked_by=$2`, [job.id, job.locked_by]),
    async complete(job) {
      await pool.query(`UPDATE node_automation_jobs SET status='completed',completed_at=CURRENT_TIMESTAMP,
        locked_at=NULL,locked_by=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND status='running' AND locked_by=$2`, [job.id, job.locked_by]);
    },
    async defer(job, until) {
      await pool.query(`UPDATE node_automation_jobs SET status='queued',run_at=$3,attempts=GREATEST(0,attempts-1),
        locked_at=NULL,locked_by=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='running' AND locked_by=$2`,
      [job.id, job.locked_by, until]);
    },
    async retry(job, error) {
      // Only an error class/code is retained: upstream messages can contain
      // private content, URLs or database parameters.
      const code = String(error.code || error.name || 'Error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 100);
      await pool.query(`UPDATE node_automation_jobs SET status=CASE WHEN attempts >= $3 THEN 'failed' ELSE 'queued' END,
        run_at=CURRENT_TIMESTAMP + LEAST(300,POWER(2,LEAST(attempts,8))) * INTERVAL '1 second',
        locked_at=NULL,locked_by=NULL,last_error=$4,updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND status='running' AND locked_by=$2`, [job.id, job.locked_by, maxAttempts, code]);
    },
  };
}

export function startAutomationWorker({ queue, run, schedule, importLegacy, interval = 250, logger = console }) {
  let running, stopped = false, lastSchedule = 0;
  const tick = async () => {
    if (Date.now() - lastSchedule >= 5000) {
      await importLegacy?.();
      await schedule();
      lastSchedule = Date.now();
    }
    const job = await queue.claim();
    if (!job) return;
    const heartbeat = setInterval(() => { queue.heartbeat(job).catch(error => logger.warn(`Automation lease: ${error.code || error.name}`)); }, 10000);
    heartbeat.unref();
    try {
      const result = await run(job);
      if (result?.deferUntil) await queue.defer(job, result.deferUntil);
      else await queue.complete(job);
    }
    catch (error) { await queue.retry(job, error); logger.warn(`Automation ${job.kind}: ${error.code || error.name}`); }
    finally { clearInterval(heartbeat); }
  };
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = tick().catch(error => logger.warn(`Automation worker: ${error.code || error.name}`)).finally(() => { running = undefined; });
  }, interval);
  timer.unref();
  return async () => { stopped = true; clearInterval(timer); await running; };
}

export async function automationTransaction(pool, job, work) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='3s'");
    const current = (await c.query('SELECT result,locked_by,status FROM node_automation_jobs WHERE id=$1 FOR UPDATE', [job.id])).rows[0];
    if (!current || current.result.done || current.status !== 'running' || current.locked_by !== job.locked_by) {
      await c.query('COMMIT'); return;
    }
    const result = await work(c);
    if (!result?.deferUntil) await c.query("UPDATE node_automation_jobs SET result=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [job.id, JSON.stringify({ done: true })]);
    await c.query('COMMIT');
    return result;
  } catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}
