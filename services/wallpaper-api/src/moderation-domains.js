import {domainToASCII} from 'node:url';
import {isIP} from 'node:net';
import {rows,one,validId,text,fail} from './moderation-common.js';
export function normalizeDomain(raw) {
 let host=text(raw).trim().toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
 if(isIP(host))return host;
 host=domainToASCII(host);
 if(!host || host.length>253 || !host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))fail(422,'Invalid domain.');
 return host;
}
export function domainDecision(rules,host) {
 const candidates=isIP(host)?[host]:host.split('.').map((_,i)=>host.split('.').slice(i).join('.'));
 return candidates.map(domain=>rules.find(r=>r.domain===domain && r.status!==0)).find(Boolean) || null;
}
// The Rails HTML/Markdown parser prepares scrubbed content. Only this service
// persists it, with a compare-and-swap guard against concurrent profile edits.
export async function domainService(c,op,input,{baseUrl}) {
 if(op==='domain-rules')return {rules:await rows(c,'SELECT id,domain,status FROM profile_domains WHERE status<>0 ORDER BY domain')};
 if(op==='domain-seen') {
  if(!Array.isArray(input.domains) || input.domains.length>1000)fail(422,'Invalid domain list.');
  const host=new URL(baseUrl).hostname;const rules=await rows(c,'SELECT id,domain,status FROM profile_domains WHERE status<>0');
  for(const raw of new Set(input.domains)) {
   const domain=normalizeDomain(raw);if(domain===host || domain.endsWith('.'+host))continue;
   const decision=domainDecision(rules,domain);const target=decision?.domain || domain;
   await c.query(`INSERT INTO profile_domains(domain,status,seen_count,first_seen_at,last_seen_at,created_at,updated_at)
    VALUES($1,0,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(domain) DO UPDATE SET seen_count=profile_domains.seen_count+1,last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,[target]);
  }
  return {recorded:true};
 }
 if(!validId(input.event_id))fail(403,'A pending domain review event is required.');
 const event=await one(c,"SELECT id,effects FROM node_moderation_events WHERE id=$1 AND operation='domain-update' AND delivered_at IS NULL",[input.event_id]);
 if(!event?.effects.scrub)fail(403,'A pending domain review event is required.');
 if(op==='domain-scrub-page') {
  if(input.after_id!=null && !validId(input.after_id))fail(422,'Invalid cursor.');
  return {profiles:await rows(c,'SELECT id,content FROM profiles WHERE id>$1 ORDER BY id LIMIT 10',[input.after_id??0])};
 }
 if(op==='domain-scrub-save') {
  if(!validId(input.profile_id))fail(422,'Invalid profile.');
  const content=text(input.content,200000),expected=text(input.expected_content,200000);
  const changed=await c.query('UPDATE profiles SET content=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND content=$2',[input.profile_id,expected,content]);
  return {saved:changed.rowCount===1,exists:changed.rowCount===1 || Boolean(await one(c,'SELECT id FROM profiles WHERE id=$1',[input.profile_id]))};
 }
 fail(404,'Unknown domain operation.');
}
