import { enqueueAutomation } from './automation-queue.js';

const gid = (value, type) => {
  const match = new RegExp(`^gid://[^/]+/${type}/([1-9][0-9]*)$`).exec(value?._aj_globalid || '');
  if (!match) throw new Error('InvalidLegacyGlobalId');
  return match[1];
};
export function legacyAutomationJob(row) {
  const serialized = JSON.parse(row.arguments);
  const args = serialized.arguments;
  if (!Array.isArray(args)) throw new Error('InvalidLegacyArguments');
  if (row.class_name==='SetLinkJob') {
    const input = args[0];
    if (!input || !/^[1-9][0-9]*$/.test(String(input.e621_post?.id))) throw new Error('InvalidLegacyPost');
    const previousId = row.active_job_id || serialized.job_id;
    const writeKey = input.request_key || (previousId ? `job:${previousId}` : null);
    if(writeKey && !/^[A-Za-z0-9:_-]{1,160}$/.test(writeKey))throw new Error('InvalidLegacyKey');
    return { kind:'set-link',payload:{link_id:gid(input.link,'Link'),post_id:String(input.e621_post.id),set_by_id:input.set_by==null ? null : gid(input.set_by,'User'),...(writeKey ? {write_key:writeKey} : {})} };
  }
  if (row.class_name==='PushNewsJob') {
    const entry = JSON.parse(args[0]);
    if (typeof entry.message!=='string' || entry.message.length>50000) throw new Error('InvalidLegacyNews');
    const options = args[1] || {};
    const phase = typeof options.transitioning==='string' ? options.transitioning : options.transitioning?.value;
    return {kind:'news-entry',payload:{entry,phase:['away','to_desk'].includes(phase) ? phase : null,done:options.done===true}};
  }
  throw new Error('UnsupportedLegacyJob');
}

// Preserve original job/failed-execution records for diagnosis. Execution
// pointers are removed only after the replacement is durably inserted.
export function createLegacyAutomationImporter(pool) {
  return async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SET LOCAL lock_timeout='3s'");
      const jobs = (await c.query(`SELECT * FROM solid_queue_jobs WHERE finished_at IS NULL
        AND class_name IN ('SetLinkJob','PushNewsJob') ORDER BY id LIMIT 25 FOR UPDATE SKIP LOCKED`)).rows;
      for (const job of jobs) {
        let replacement;
        try { replacement = legacyAutomationJob(job); }
        catch {
          replacement = {kind:'legacy-invalid',payload:{legacy_job_id:job.id,class_name:job.class_name}};
        }
        const result = await enqueueAutomation(c,{key:`legacy:${job.id}`, ...replacement,runAt:job.scheduled_at || new Date()});
        if (replacement.kind==='legacy-invalid') await c.query("UPDATE node_automation_jobs SET status='failed',last_error='LegacyArgumentsInvalid' WHERE id=$1",[result.job_id]);
        for (const table of ['ready','scheduled','claimed','blocked']) await c.query(`DELETE FROM solid_queue_${table}_executions WHERE job_id=$1`,[job.id]);
        await c.query('UPDATE solid_queue_jobs SET finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[job.id]);
      }
      await c.query('COMMIT');
    } catch(error) { await c.query('ROLLBACK');throw error; } finally {c.release();}
  };
}
