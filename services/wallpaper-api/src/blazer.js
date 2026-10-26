import {randomUUID} from 'node:crypto';
import {CommandError} from './updates.js';
import {isCohort,cohortStatement,cohortResults} from './blazer-cohorts.js';
const fail=(status,message)=>{throw new CommandError(status,message);};
const text=(value,max=50000)=>typeof value==='string'&&value.length<=max&&!value.includes('\0')?value:fail(422,'Invalid or oversized text.');
const id=value=>/^[1-9]\d{0,18}$/.test(String(value))&&BigInt(value)<=9223372036854775807n?String(value):fail(404,'Record not found.');
const same=(a,b)=>String(a)===String(b);
const schedules={'5 minutes':300000,'1 hour':3600000,'1 day':86400000};
const tokens=sql=>sql.match(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|\$([A-Za-z_][A-Za-z0-9_]*|)\$[\s\S]*?\$\1\$|[^'"/$-]+|./g) || [];
const names=sql=>[...new Set(tokens(sql).filter(t=>!/^--|^\/\*|^\$|^"/.test(t)).flatMap(t=>[...t.matchAll(/\{([A-Za-z_]\w*)\}/g)].map(m=>m[1])))];
export const blazerVariables=names;
export function bindBlazer(sql,variables={}){
  if(!variables||typeof variables!=='object'||Array.isArray(variables))fail(422,'Invalid variables.');
  const values=[];
  const value=name=>{const v=variables[name];if(typeof v!=='string'||!v.length||v.length>10000)fail(422,`Missing value for {${name}}.`);return v;};
  const bind=value=>{values.push(value);return '$'+values.length;};
  const statement=tokens(text(sql)).map(token=>{
    if(/^--|^\/\*|^\$|^"/.test(token))return token;
    if(token.startsWith("'")&&/\{[A-Za-z_]\w*\}/.test(token))return bind(token.slice(1,-1).replaceAll("''","'").replace(/\{([A-Za-z_]\w*)\}/g,(_,n)=>value(n)));
    return token.replace(/\{([A-Za-z_]\w*)\}/g,(_,name)=>bind(value(name)));
  }).join('');
  return {statement,values};
}
export function createBlazer({pool,queryPool,authorize,notify=async()=>{},now=Date.now}){
  const one=async(sql,values=[]) => (await pool.query(sql,values)).rows[0];
  const queries=async()=> (await pool.query("SELECT q.*,u.username AS creator FROM blazer_queries q LEFT JOIN users u ON u.id=q.creator_id ORDER BY q.name NULLS LAST,q.id")).rows;
  const getQuery=async key=>await one('SELECT * FROM blazer_queries WHERE id=$1',[id(key)]) || fail(404,'Query not found.');
  const editable=(q,actorId)=>!q.name||!['*','#'].includes(q.name[0])||same(q.creator_id,actorId);
  const runs=new Map();let active=0;
  async function run(input,actorId,{audit=true}={}){
    const query=input.query_id?await getQuery(input.query_id):null;
    if(input.data_source&&input.data_source!=='main')fail(422,'Unknown data source.');
    const sql=text(input.statement??query?.statement??'').trim();if(!sql)fail(422,"Statement can't be blank");
    const cohort=!!query&&isCohort(sql),period=input.variables?.cohort_period || 'week';
    let source=bindBlazer(sql,input.variables || {});
    const plain=tokens(source.statement).filter(t=>!/^--|^\/\*/.test(t)).join('').trim();
    if(!/^(?:SELECT|WITH|VALUES|TABLE|SHOW|EXPLAIN)\b/i.test(plain))fail(422,'Only read-only queries are supported.');
    if(cohort)source=cohortStatement(source,period);
    const runId=typeof input.run_id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(input.run_id)?input.run_id:randomUUID();
    if(runs.has(runId))fail(409,'This query is already running.');
    if(active>=2)fail(429,'Two queries are already running. Please try again shortly.');
    active++;
    let client;try{client=await queryPool.connect();}catch(error){active--;throw error;}
    const start=performance.now();
    let result,error,truncated=false;
    try{
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='15s'");
      runs.set(runId,{pid:client.processID,actorId});
      const statement=/^(SELECT|WITH|VALUES|TABLE)\b/i.test(plain)?`SELECT * FROM (${source.statement.replace(/;\s*$/,'')}\n) blazer_result LIMIT 1001`:source.statement;
      result=await client.query({text:statement,values:source.values,queryMode:'extended',rowMode:'array'});
    }catch(failure){error=failure.code==='57014'?'Query canceled or timed out.':String(failure.message || 'Query failed.').slice(0,1000);}
    finally{runs.delete(runId);let rollbackError;try{await client.query('ROLLBACK');}catch(error){rollbackError=error;}finally{client.release(rollbackError);active--;}}
    let rows=(result?.rows || []).slice(0,1000),size=0;
    rows=rows.filter(row=>{size+=Buffer.byteLength(JSON.stringify(row));if(size>8*1024*1024){truncated=true;return false;}return true;}).map(row=>row.map(v=>typeof v==='string'&&v.length>100000?(truncated=true,v.slice(0,100000)):v));
    truncated ||= (result?.rows.length || 0)>1000;
    if(audit&&actorId)await pool.query('INSERT INTO blazer_audits(user_id,query_id,statement,data_source,created_at) VALUES($1,$2,$3,\'main\',CURRENT_TIMESTAMP)',[actorId,query?.id || null,sql]);
    return {columns:(result?.fields || []).map(f=>f.name),column_types:(result?.fields || []).map(f=>f.dataTypeID),rows,...(cohort&&!error?cohortResults(rows,period,now()):{}),error:error || null,truncated,duration_ms:Math.round(performance.now()-start),run_id:runId};
  }
  async function checkRun(check){
    if(check.state==='disabled')return;
    const result=await run({query_id:check.query_id},check.creator_id,{audit:false});
    const state=result.error?(result.error.includes('timed out')?'timed out':'error'):check.check_type==='missing_data'?(result.rows.length?'passing':'failing'):(result.rows.length?'failing':'passing');
    if(state!==check.state&&(check.state!=='new'||state!=='passing'))await notify({...check,state,message:result.error},result);
    await pool.query('UPDATE blazer_checks SET state=$2,message=$3,last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[check.id,state,result.error]);
    return result;
  }
  return {
    async request(op,input={}){
      await authorize(input);
      if(op==='home'){
        let list=await queries();list=list.filter(q=>q.name&&(!q.name.startsWith('#')||same(q.creator_id,input.actor_id)));
        if(input.filter==='mine')list=list.filter(q=>same(q.creator_id,input.actor_id)).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
        else if(input.filter==='viewed'){const ids=(await pool.query('SELECT query_id,max(created_at) AS last FROM blazer_audits WHERE user_id=$1 AND query_id IS NOT NULL GROUP BY query_id ORDER BY last DESC LIMIT 500',[input.actor_id])).rows.map(r=>String(r.query_id));list=list.filter(q=>ids.includes(String(q.id))).sort((a,b)=>ids.indexOf(String(a.id))-ids.indexOf(String(b.id)));}
        else list=list.filter(q=>!q.status||q.status==='active');
        const dashboards=input.filter?[]:(await pool.query('SELECT d.*,u.username AS creator FROM blazer_dashboards d LEFT JOIN users u ON u.id=d.creator_id ORDER BY d.name,d.id')).rows;
        return {queries:list.map(q=>({...q,variables:names(q.statement)})),dashboards};
      }
      if(op==='query'){const q=await getQuery(input.id);if(!q.status||q.status==='archived')await pool.query("UPDATE blazer_queries SET status='active' WHERE id=$1",[q.id]);return {query:q,editable:editable(q,input.actor_id),variables:[...names(q.statement),...(isCohort(q.statement)?['cohort_period']:[])],checks:(await pool.query('SELECT * FROM blazer_checks WHERE query_id=$1 ORDER BY id',[q.id])).rows,dashboards:(await pool.query('SELECT dashboard_id FROM blazer_dashboard_queries WHERE query_id=$1',[q.id])).rows};}
      if(op==='query-save'){
        const attrs=input.attributes || {},statement=text(attrs.statement??''),name=text(attrs.name??'',255),description=text(attrs.description??'');
        if(!statement.trim())fail(422,"Statement can't be blank");if(attrs.data_source&&attrs.data_source!=='main')fail(422,'Unknown data source.');
        if(input.id&&!input.fork){const q=await getQuery(input.id);if(!editable(q,input.actor_id))fail(403,'Sorry, permission denied');await pool.query("UPDATE blazer_queries SET name=$2,description=$3,statement=$4,data_source='main',status='active',updated_at=CURRENT_TIMESTAMP WHERE id=$1",[q.id,name,description,statement]);return {id:q.id};}
        return one("INSERT INTO blazer_queries(creator_id,name,description,statement,data_source,status,created_at,updated_at) VALUES($1,$2,$3,$4,'main','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id",[input.actor_id,name,description,statement]);
      }
      if(op==='query-delete'){
        const q=await getQuery(input.id);if(!editable(q,input.actor_id))fail(403,'Sorry, permission denied');
        const c=await pool.connect();try{await c.query('BEGIN');for(const table of ['blazer_checks','blazer_dashboard_queries'])await c.query(`DELETE FROM ${table} WHERE query_id=$1`,[q.id]);await c.query('DELETE FROM blazer_queries WHERE id=$1',[q.id]);await c.query('COMMIT');return {deleted:true};}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
      }
      if(op==='run')return run(input,input.actor_id);
      if(op==='cancel'){const running=runs.get(input.run_id);if(running&&same(running.actorId,input.actor_id))await queryPool.query('SELECT pg_cancel_backend($1)',[running.pid]);return {canceled:!!running&&same(running.actorId,input.actor_id)};}
      if(op==='refresh'){await getQuery(input.id);const checks=(await pool.query('SELECT * FROM blazer_checks WHERE query_id=$1',[input.id])).rows;for(const check of checks)await checkRun(check);return {refreshed:true};}
      if(op==='schema'){
        const data=await queryPool.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");return {columns:data.rows};
      }
      if(op==='checks')return {checks:(await pool.query('SELECT c.*,q.name AS query_name FROM blazer_checks c JOIN blazer_queries q ON q.id=c.query_id ORDER BY q.name,c.id')).rows};
      if(op==='check'){const check=input.id?await one('SELECT * FROM blazer_checks WHERE id=$1',[id(input.id)]):null;if(input.id&&!check)fail(404,'Check not found.');return {check,queries:await queries()};}
      if(op==='check-save'){
        const a=input.attributes || {},q=await getQuery(a.query_id);if(names(q.statement).length)fail(422,"Query can't have variables");
        const emails=text(a.emails??'',4000).trim().replace(/[;\s]+/g,', ').replace(/,+/g,',').replace(/^,|,$/g,'');if(emails&&emails.split(',').some(e=>!/^\S+@\S+\.\S+$/.test(e.trim())))fail(422,'Invalid emails');
        if(!['bad_data','missing_data'].includes(a.check_type))fail(422,'Invalid check type');if(!Object.hasOwn(schedules,a.schedule))fail(422,'Invalid schedule');
        if(input.id){if(!await one('SELECT id FROM blazer_checks WHERE id=$1',[id(input.id)]))fail(404,'Check not found.');await pool.query('UPDATE blazer_checks SET query_id=$2,emails=$3,check_type=$4,schedule=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[input.id,q.id,emails,a.check_type,a.schedule]);return {id:input.id,query_id:q.id};}
        return one("INSERT INTO blazer_checks(creator_id,query_id,emails,check_type,schedule,state,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'new',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id,query_id",[input.actor_id,q.id,emails,a.check_type,a.schedule]);
      }
      if(op==='check-delete'){await pool.query('DELETE FROM blazer_checks WHERE id=$1',[id(input.id)]);return {deleted:true};}
      if(op==='check-run'){const check=await one('SELECT * FROM blazer_checks WHERE id=$1',[id(input.id)]);if(!check)fail(404,'Check not found.');await checkRun(check);return {query_id:check.query_id};}
      if(op==='dashboard'){const dashboard=input.id?await one('SELECT * FROM blazer_dashboards WHERE id=$1',[id(input.id)]):null;if(input.id&&!dashboard)fail(404,'Dashboard not found.');const members=dashboard?(await pool.query('SELECT q.* FROM blazer_dashboard_queries d JOIN blazer_queries q ON q.id=d.query_id WHERE d.dashboard_id=$1 ORDER BY d.position,d.id',[dashboard.id])).rows:[];return {dashboard,queries:members,available:await queries(),variables:[...new Set(members.flatMap(q=>[...names(q.statement),...(isCohort(q.statement)?['cohort_period']:[])]))]};}
      if(op==='dashboard-save'){
        const name=text(input.name??'',255);if(!name.trim())fail(422,"Name can't be blank");if(!Array.isArray(input.query_ids)||input.query_ids.length>100)fail(422,'Invalid charts');const ids=[...new Set(input.query_ids.map(id))];for(const key of ids)await getQuery(key);
        const c=await pool.connect();try{await c.query('BEGIN');let key=input.id;if(key){if(!(await c.query('UPDATE blazer_dashboards SET name=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id',[id(key),name])).rowCount)fail(404,'Dashboard not found.');}else key=(await c.query('INSERT INTO blazer_dashboards(name,creator_id,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id',[name,input.actor_id])).rows[0].id;
          await c.query('DELETE FROM blazer_dashboard_queries WHERE dashboard_id=$1',[key]);for(const [index,qid] of ids.entries())await c.query('INSERT INTO blazer_dashboard_queries(dashboard_id,query_id,position,created_at,updated_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[key,qid,index]);await c.query('COMMIT');return {id:key};
        }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
      }
      if(op==='dashboard-delete'){const c=await pool.connect();try{await c.query('BEGIN');await c.query('DELETE FROM blazer_dashboard_queries WHERE dashboard_id=$1',[id(input.id)]);await c.query('DELETE FROM blazer_dashboards WHERE id=$1',[input.id]);await c.query('COMMIT');return {deleted:true};}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
      fail(404,'Unknown Blazer operation.');
    },
    async tick(){
      const client=await pool.connect();let locked=false;
      try{locked=(await client.query("SELECT pg_try_advisory_lock(hashtextextended('walltaker:blazer:checks',0)) AS locked")).rows[0].locked;if(!locked)return;
        const due=(await client.query("SELECT * FROM blazer_checks WHERE state IS DISTINCT FROM 'disabled' AND (last_run_at IS NULL OR last_run_at<CURRENT_TIMESTAMP-CASE schedule WHEN '5 minutes' THEN INTERVAL '5 minutes' WHEN '1 hour' THEN INTERVAL '1 hour' ELSE INTERVAL '1 day' END) ORDER BY last_run_at NULLS FIRST,id LIMIT 5")).rows;
        for(const check of due)await checkRun(check);
      }finally{if(locked)await client.query("SELECT pg_advisory_unlock(hashtextextended('walltaker:blazer:checks',0))");client.release();}
    },
  };
}
