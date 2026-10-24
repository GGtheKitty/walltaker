import {readFile,statfs} from 'node:fs/promises';
import os from 'node:os';
import {setTimeout} from 'node:timers/promises';
import {one,rows} from './activity-common.js';
const percent=(a,b)=>b?Math.round(a/b*1000)/10:0;
export async function systemMetrics(c,pool,redis) {
 const captured_at=new Date();let machine,database,redisInfo,queue;
 try {
  const times=async()=>(await readFile('/proc/stat','utf8')).split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const first=await times();await setTimeout(100);const second=await times();const total=second.reduce((a,b)=>a+b,0)-first.reduce((a,b)=>a+b,0);const idle=second[3]+second[4]-first[3]-first[4];
  const memory=Object.fromEntries((await readFile('/proc/meminfo','utf8')).trim().split('\n').map(line=>{const [k,v]=line.split(':');return [k,parseInt(v,10)*1024];}));
  const disk=await statfs('/');const diskTotal=disk.blocks*disk.bsize,diskFree=disk.bavail*disk.bsize;
  machine={cpu_count:os.cpus().length,cpu_percent:percent(total-idle,total),load_averages:os.loadavg(),memory_total:memory.MemTotal,memory_used:memory.MemTotal-memory.MemAvailable,memory_percent:percent(memory.MemTotal-memory.MemAvailable,memory.MemTotal),swap_total:memory.SwapTotal,swap_used:memory.SwapTotal-memory.SwapFree,uptime_seconds:os.uptime(),disk:{total:diskTotal,used:diskTotal-diskFree,available:diskFree,percent:percent(diskTotal-diskFree,diskTotal)}};
 } catch {machine={unavailable:true};}
 try {const start=performance.now();await c.query('SELECT 1');database={healthy:true,response_ms:Math.round((performance.now()-start)*10)/10,size:Number((await one(c,'SELECT pg_database_size(current_database()) AS size')).size),pool:{busy:pool.totalCount-pool.idleCount,size:pool.options?.max??2}};}catch {database={healthy:false};}
 try {const start=performance.now();await redis.ping();const info=Object.fromEntries((await redis.info('memory')).split('\r\n').filter(line=>line.includes(':')).map(line=>line.split(':')));redisInfo={healthy:true,response_ms:Math.round((performance.now()-start)*10)/10,used_memory:Number(info.used_memory||0),peak_memory:Number(info.used_memory_peak||0)};}catch {redisInfo={healthy:false};}
 try {
  queue={};
  if((await one(c,"SELECT to_regclass('public.node_automation_jobs') AS table_name")).table_name) {
   queue={backend:'Node',...(await one(c,`SELECT count(*) FILTER(WHERE status='queued' AND run_at<=CURRENT_TIMESTAMP)::integer AS ready,
    count(*) FILTER(WHERE status='running')::integer AS claimed,count(*) FILTER(WHERE status='queued' AND run_at>CURRENT_TIMESTAMP)::integer AS scheduled,
    count(*) FILTER(WHERE status='failed')::integer AS failed FROM node_automation_jobs`))};
  } else for(const [key,table] of Object.entries({ready:'ready',claimed:'claimed',scheduled:'scheduled',failed:'failed'}))queue[key]=Number((await one(c,`SELECT count(*) FROM solid_queue_${table}_executions`)).count);
 }catch {queue={unavailable:true};}
 return {captured_at,machine,database,redis:redisInfo,queue};
}
export async function activityMetrics(c,onlineIds) {
 const live=`u.deleted_at IS NULL AND (l.id=ANY($1::bigint[]) OR l.last_ping>CURRENT_TIMESTAMP-INTERVAL '1 minute' OR (l.last_ping_user_agent LIKE '%widgetExtension%' AND l.last_ping>CURRENT_TIMESTAMP-INTERVAL '20 minutes'))`;
 const online=await one(c,`SELECT count(*)::integer AS links,count(DISTINCT l.user_id)::integer AS users FROM links l JOIN users u ON u.id=l.user_id WHERE ${live}`,[onlineIds]);
 const posts=await one(c,`SELECT count(*)::integer AS total,count(*) FILTER(WHERE created_at>=CURRENT_TIMESTAMP-INTERVAL '1 hour' AND created_at<=CURRENT_TIMESTAMP)::integer AS hour,count(*) FILTER(WHERE created_at>=CURRENT_TIMESTAMP-INTERVAL '24 hours' AND created_at<=CURRENT_TIMESTAMP)::integer AS day,count(*) FILTER(WHERE created_at>=CURRENT_TIMESTAMP-INTERVAL '7 days' AND created_at<=CURRENT_TIMESTAMP)::integer AS week FROM past_links`);
 const activity={online_users:online.users,online_links:online.links,users_viewing_links:Number((await one(c,'SELECT count(*) FROM users WHERE deleted_at IS NULL AND viewing_link_id IS NOT NULL')).count),links_with_wallpapers:Number((await one(c,'SELECT count(*) FROM links l JOIN users u ON u.id=l.user_id WHERE u.deleted_at IS NULL AND l.post_url IS NOT NULL')).count),wallpapers_last_hour:posts.hour,wallpapers_last_day:posts.day,wallpapers_last_week:posts.week,wallpapers_total:posts.total};
 for(const [key,sql] of Object.entries({visits_last_day:"SELECT count(*) FROM ahoy_visits WHERE started_at BETWEEN CURRENT_TIMESTAMP-INTERVAL '24 hours' AND CURRENT_TIMESTAMP",new_users_last_day:"SELECT count(*) FROM users WHERE deleted_at IS NULL AND created_at BETWEEN CURRENT_TIMESTAMP-INTERVAL '24 hours' AND CURRENT_TIMESTAMP",orgasms_last_day:"SELECT count(*) FROM nuttracker_orgasms WHERE created_at BETWEEN CURRENT_TIMESTAMP-INTERVAL '24 hours' AND CURRENT_TIMESTAMP",open_reports:'SELECT count(*) FROM reports WHERE is_closed=false'}))activity[key]=Number((await one(c,sql)).count);
 const hours=await rows(c,`SELECT to_char(h.hour,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS hour,count(p.id)::integer AS count FROM generate_series(date_trunc('hour',CURRENT_TIMESTAMP-INTERVAL '24 hours'),date_trunc('hour',CURRENT_TIMESTAMP),INTERVAL '1 hour') h(hour) LEFT JOIN past_links p ON p.created_at>=h.hour AND p.created_at<h.hour+INTERVAL '1 hour' AND p.created_at BETWEEN CURRENT_TIMESTAMP-INTERVAL '24 hours' AND CURRENT_TIMESTAMP GROUP BY h.hour ORDER BY h.hour`);
 return {activity,hours};
}
