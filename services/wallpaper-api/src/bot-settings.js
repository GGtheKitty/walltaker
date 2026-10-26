import {CommandError} from './updates.js';

export const BOTS = {
  taylor: { username: 'PornLizardTaylor', ability: 'can_be_set_by_lizard', mascot: 'taylor', limit: 4, cooldown: 600,
    tags: ['public ~public_sex ~penis_milking ~public_masturbation ~free_use ~leaking_cum ~cum_on_face ~cum_on_butt ~cum_on_clothing score:>100 -swf', '~impregnation ~impregnation_request excessive_cum ~presenting_hindquarters ~cum_in_pussy ~cum_in_ass ~cum_pool score:>80 -swf'] },
  warren: { username: 'PornLizardWarren', ability: 'can_be_set_by_lizard', mascot: 'warren', limit: 4, cooldown: 600,
    tags: ['~big_penis ~big_balls close_up ~big_breasts ~plump_labia ~crotch_shot -obese -hyper ~huge_balls score:>50 -swf', 'hyper ~huge_breasts ~huge_penis ~himbo ~bimbofication ~horsecock ~hyper_breasts ~udders -obese score:>70 -swf'] },
  ki: { username: 'PornLizardKi', ability: 'can_be_set_by_lizard', mascot: 'ki', limit: 4, cooldown: 600,
    tags: ['~massage romantic ~embrace ~cuddle ~hug ~hand_holding score:>90 -swf', '~latex ~rubber glistening_body ~bdsm ~goo_creature ~slime score:>50 -swf'] },
  pornbot: { username: 'PornBot', ability: 'can_be_set_by_porn_bot', mascot: null, limit: 60, cooldown: 1500,
    tags: ['score:>100 -nightmare_fuel -nazi -swf rating:e', 'score:>100 -nightmare_fuel -nazi -swf rating:e'] },
};
export function botDefaults(name,pornbotInterval=600){
  if(!Object.hasOwn(BOTS,name))throw new CommandError(404,'Bot not found.');
  return {...BOTS[name],name,enabled:true,revision:'1',interval_seconds:name==='pornbot'?Math.max(60,Math.min(86400,Number(pornbotInterval)||600)):60};
}
export function effectiveBot(row,pornbotInterval=600){
  const base=botDefaults(row.name,pornbotInterval);
  return {...base,...row,revision:String(row.revision),interval_seconds:row.interval_seconds??base.interval_seconds,
    normal_tags:row.normal_tags??base.tags[0],perverted_tags:row.perverted_tags??base.tags[1],
    tags:[row.normal_tags??base.tags[0],row.perverted_tags??base.tags[1]],
    cooldown_seconds:row.cooldown_seconds??base.cooldown,round_limit:row.round_limit??base.limit,
    cooldown:row.cooldown_seconds??base.cooldown,limit:row.round_limit??base.limit};
}
// Shared locks are held only during short database transactions, never while
// contacting e621. Stop/configuration changes take the matching exclusive lock.
export const lockBot=(c,name,exclusive=false)=>c.query(`SELECT pg_advisory_xact_lock${exclusive?'':'_shared'}(hashtextextended($1,0))`,['walltaker:bot:'+name]);
export async function botSettings(c,name,pornbotInterval=600){
  botDefaults(name,pornbotInterval);
  const row=(await c.query('SELECT * FROM node_bot_settings WHERE name=$1',[name])).rows[0];
  if(!row)throw new CommandError(503,'Bot settings are not configured.');
  return effectiveBot(row,pornbotInterval);
}
export const currentBot=(definition,revision)=>definition.enabled&&definition.revision===String(revision??'1');

export async function botAdministration(c,pornbotInterval=600){
  const settings=(await c.query('SELECT * FROM node_bot_settings ORDER BY name')).rows;
  const schedules=(await c.query('SELECT name,next_run_at,last_checked_at FROM node_automation_schedules')).rows;
  const jobs=(await c.query(`SELECT payload->>'bot' AS bot,COALESCE(payload->>'bot_revision','1') AS revision,status,count(*)::integer AS count
    FROM node_automation_jobs WHERE kind IN ('bot-round','bot-link') AND status IN ('queued','running','failed')
    GROUP BY payload->>'bot',COALESCE(payload->>'bot_revision','1'),status`)).rows;
  const accounts=(await c.query('SELECT username FROM users WHERE system_account=true AND deleted_at IS NULL AND username=ANY($1::text[])',[Object.values(BOTS).map(b=>b.username)])).rows;
  const seen=schedules.map(s=>s.last_checked_at).filter(Boolean).sort((a,b)=>new Date(b)-new Date(a))[0]||null;
  return {worker:{healthy:!!seen&&Date.now()-new Date(seen).getTime()<15000,last_seen_at:seen},bots:settings.map(row=>{
    const bot=effectiveBot(row,pornbotInterval),schedule=schedules.find(s=>s.name===row.name);
    return {...bot,account_available:accounts.some(u=>u.username===bot.username),next_run_at:schedule?.next_run_at||null,
      jobs:Object.fromEntries(['queued','running','failed'].map(status=>[status,jobs.find(j=>j.bot===row.name&&j.revision===bot.revision&&j.status===status)?.count||0]))};
  })};
}
function integer(value,min,max,label){
  if(!/^(?:0|[1-9]\d*)$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)
    throw new CommandError(422,`${label} must be a whole number between ${min} and ${max}.`);
  return Number(value);
}
function tags(value){
  if(typeof value!=='string'||value.length>2000||value.includes('\0'))throw new CommandError(422,'Tags must contain at most 2000 characters.');
  return value.replace(/\s+/g,' ').trim();
}
export async function changeBot(c,op,input,pornbotInterval=600){
  if(!['bot-update','bot-start','bot-stop'].includes(op))throw new CommandError(404,'Unknown bot operation.');
  botDefaults(input.bot,pornbotInterval);
  await lockBot(c,input.bot,true);
  const current=await botSettings(c,input.bot,pornbotInterval);
  if(String(input.revision)!==current.revision)throw new CommandError(409,'These bot settings changed. Refresh the page and try again.');
  if(op==='bot-start'&&!(await c.query('SELECT id FROM users WHERE username=$1 AND system_account=true AND deleted_at IS NULL',[current.username])).rows[0])
    throw new CommandError(422,'The bot system account is missing or inactive. Restore it before starting this bot.');
  let fields;
  if(op==='bot-update'){
    const a=input.attributes||{};
    fields={enabled:current.enabled,normal_tags:tags(a.normal_tags),perverted_tags:tags(a.perverted_tags),
      interval_seconds:integer(a.interval_seconds,60,86400,'Check interval'),cooldown_seconds:integer(a.cooldown_seconds,0,604800,'Wallpaper cooldown'),
      round_limit:integer(a.round_limit,1,60,'Links per round')};
  }else fields={enabled:op==='bot-start',normal_tags:current.normal_tags,perverted_tags:current.perverted_tags,
    interval_seconds:current.interval_seconds,cooldown_seconds:current.cooldown_seconds,round_limit:current.round_limit};
  const row=(await c.query(`UPDATE node_bot_settings SET enabled=$2,normal_tags=$3,perverted_tags=$4,interval_seconds=$5,
    cooldown_seconds=$6,round_limit=$7,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE name=$1 RETURNING *`,
    [input.bot,fields.enabled,fields.normal_tags,fields.perverted_tags,fields.interval_seconds,fields.cooldown_seconds,fields.round_limit])).rows[0];
  // Starting schedules an immediate check; saving changes restarts its interval.
  // Never manufacture a worker heartbeat from an administrative action.
  await c.query(`INSERT INTO node_automation_schedules(name,next_run_at,created_at,updated_at)
    VALUES($1,CURRENT_TIMESTAMP+$2::integer*INTERVAL '1 second',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET next_run_at=EXCLUDED.next_run_at,updated_at=CURRENT_TIMESTAMP`,[input.bot,op==='bot-start'?0:fields.interval_seconds]);
  return {bot:input.bot,enabled:row.enabled,revision:String(row.revision)};
}
