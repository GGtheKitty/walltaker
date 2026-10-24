import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { activityActor,fail,one,rows,same,token,validId,writeActivityRecord,visibleHistoryLink } from './activity-common.js';
import { activityProperties,analyticsUrl } from './activity-properties.js';
import { discoveryGraph } from './discovery.js';
import { systemMetrics,activityMetrics } from './activity-metrics.js';

const canonical=v=>Array.isArray(v)?v.map(canonical):v && typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const text=(value,max=255)=>value==null?null:typeof value==='string'?value.replace(/\0/g,'').slice(0,max):fail(422,'Invalid analytics text.');
const timestamp=value=>{const date=new Date(value);if(value==null || !Number.isFinite(date.getTime()) || date.getTime()>Date.now()+60000)fail(422,'Invalid analytics time.');return date.toISOString();};
const optionalId=value=>value==null?null:validId(value)?String(value):fail(422,'Invalid analytics user.');
const requestKey=value=>typeof value==='string' && /^[A-Za-z0-9:_-]{1,160}$/.test(value)?value:fail(422,'Request key required.');

export function createActivity({pool,store,redis}) {
 async function activeUser(c,id) {
  if(id==null)return;
  if(!await one(c,'SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL FOR SHARE',[id]))fail(403,'User is no longer active.');
 }
 async function findVisit(c,input) {
  return one(c,'SELECT * FROM ahoy_visits WHERE visit_token=$1 AND visitor_token=$2',[token(input.visit_token),token(input.visitor_token)]);
 }
 async function visitDocument(c,visit,ip) {
  if(ip!=null && (typeof ip!=='string' || !isIP(ip)))fail(422,'Invalid client IP.');
  const ban=await one(c,'SELECT id,ip_address FROM banned_ips WHERE ip_address=$1 OR ip_address=$2 ORDER BY id LIMIT 1',[visit?.ip || null,ip || null]);
  return {visit:visit || null,ban:ban || null};
 }
 async function receipt(c,operation,input,userId,work) {
  const key=requestKey(input.request_key),digest=createHash('sha256').update(JSON.stringify(canonical({operation,...input}))).digest('hex');
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['activity:'+key]);
  const prior=await one(c,'SELECT operation,payload_digest,result FROM node_activity_receipts WHERE request_key=$1',[key]);
  if(prior) {if(prior.operation!==operation || prior.payload_digest!==digest)fail(409,'Activity request key reused for different content.');return prior.result;}
  const result=await work();
  await c.query(`INSERT INTO node_activity_receipts(request_key,payload_digest,operation,user_id,result,created_at,updated_at)
   VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,[key,digest,operation,userId,JSON.stringify(result)]);
  return result;
 }
 async function history(c,input) {
  const {user}=await activityActor(c,input);
  const events=await rows(c,'SELECT * FROM history_events WHERE user_id=$1 ORDER BY id DESC LIMIT 170',[user.id]);
  const visitIds=[...new Set(events.map(e=>e.ahoy_visit_id).filter(Boolean))];
  const visits=visitIds.length?await rows(c,'SELECT id,started_at FROM ahoy_visits WHERE id=ANY($1::bigint[])',[visitIds]):[];
  const linkIds=[...new Set(events.map(e=>e.link_id))];
  const links=linkIds.length?await rows(c,`SELECT l.* FROM links l JOIN users owner ON owner.id=l.user_id
   WHERE l.id=ANY($1::bigint[]) AND owner.deleted_at IS NULL AND ${visibleHistoryLink('l','$2')}`,[linkIds,user.id]):[];
  const result=await discoveryGraph(c,{links});
  // The history adapter reuses the card graph. Only currently visible parent
  // links are retained, so changing a fork's privacy cannot expose its card.
  const parentIds=result.graph.parents.map(l=>l.id);
  if(parentIds.length) {
   const allowed=await rows(c,`SELECT l.id FROM links l WHERE l.id=ANY($1::bigint[]) AND ${visibleHistoryLink('l','$2')}`,[parentIds,user.id]);
   const ids=new Set(allowed.map(l=>String(l.id)));result.graph.parents=result.graph.parents.filter(l=>ids.has(String(l.id)));
  }
  const people=[...new Set(events.flatMap(e=>[e.user_id,e.surrender_controller_id]).filter(Boolean))];
  const users=people.length?await rows(c,'SELECT id,username,deleted_at FROM users WHERE id=ANY($1::bigint[])',[people]):[];
  return {...result,events,visits,users};
 }
 return async(operation,input={})=>{
  if(!input || typeof input!=='object' || Array.isArray(input))fail(400,'JSON object required.');
  const c=await pool.connect();
  try {
   await c.query(operation==='history'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
   await c.query("SET LOCAL lock_timeout='3s'");
   let result;
   if(operation==='history')result=await history(c,input);
   else if(operation==='activity' || operation==='system') {
    await activityActor(c,input,{admin:true});
    result=operation==='activity'?await activityMetrics(c,await store.onlineIds()):await systemMetrics(c,pool,redis);
   } else if(operation==='visit') {
    let visit;
    try {visit=await findVisit(c,input);}catch(error){if(error.status!==422)throw error;}
    result=await visitDocument(c,visit,input.ip);
   }
   else if(operation==='visit-create') {
    const data=input.data;if(!data || typeof data!=='object' || Array.isArray(data))fail(422,'Visit data required.');
    const userId=optionalId(data.user_id);await activeUser(c,userId);
    const clean={visit_token:token(data.visit_token),visitor_token:token(data.visitor_token),user_id:userId,started_at:timestamp(data.started_at)};
    if(data.ip!=null && (typeof data.ip!=='string' || !isIP(data.ip)))fail(422,'Invalid client IP.');
    clean.ip=data.ip || null;
    for(const key of ['browser','os','device_type','referring_domain','utm_source','utm_medium','utm_term','utm_content','utm_campaign','app_version','os_version','platform'])clean[key]=text(data[key]);
    clean.user_agent=text(data.user_agent,8192);clean.referrer=analyticsUrl(data.referrer);clean.landing_page=analyticsUrl(data.landing_page);
    const fields=Object.keys(clean);
    await c.query(`INSERT INTO ahoy_visits(${fields.join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(visit_token) DO NOTHING`,Object.values(clean));
    const visit=await findVisit(c,clean);if(!visit)fail(403,'Visit proof does not match.');
    result=await visitDocument(c,visit,data.ip);
   } else if(operation==='visit-authenticate') {
    const userId=optionalId(input.user_id);if(!userId)fail(422,'User required.');await activeUser(c,userId);
    const visit=await findVisit(c,input);
    if(visit && visit.user_id==null)await c.query('UPDATE ahoy_visits SET user_id=$2 WHERE id=$1 AND user_id IS NULL',[visit.id,userId]);
    result=await visitDocument(c,await findVisit(c,input),input.ip);
   } else if(operation==='event-create') {
    const userId=optionalId(input.user_id);await activeUser(c,userId);
    const visit=await findVisit(c,input);if(!visit)fail(404,'Visit not found.');
    const name=text(input.name);if(!name)fail(422,'Event name required.');
    if(input.properties!=null && (typeof input.properties!=='object' || Array.isArray(input.properties)))fail(422,'Event properties must be an object.');
    const properties=activityProperties(input.properties || {});
    if(Buffer.byteLength(JSON.stringify(properties))>65536)fail(422,'Event properties are too large.');
    const data={request_key:requestKey(input.request_key),user_id:userId,visit_id:visit.id,name,properties,time:timestamp(input.time)};
    result=await receipt(c,operation,data,userId,async()=>{
     const event=await one(c,'INSERT INTO ahoy_events(visit_id,user_id,name,properties,time) VALUES($1,$2,$3,$4,GREATEST($5::timestamp,$6::timestamp)) RETURNING id',[visit.id,userId,name,JSON.stringify(properties),data.time,visit.started_at]);
     return {event_id:event.id};
    });
   } else if(operation==='record') {
    const actor=await activityActor(c,input,{lock:true});
    const data={request_key:requestKey(input.request_key),actor_id:String(actor.user.id),surrender_id:input.surrender_id==null?null:String(input.surrender_id),link_id:input.link_id==null?null:String(input.link_id),kind:input.kind,visit:input.visit || null};
    result=await receipt(c,operation,data,actor.user.id,async()=>({history_event_id:(await writeActivityRecord(c,data,{kind:input.kind,linkId:input.link_id,actor})).id}));
   } else fail(404,'Unknown activity operation.');
   await c.query('COMMIT');return result;
  } catch(error) {await c.query('ROLLBACK');throw error;} finally {c.release();}
 };
}
