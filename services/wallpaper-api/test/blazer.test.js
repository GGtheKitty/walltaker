import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {createBlazer} from '../src/blazer.js';
import {createBlazerHandler} from '../src/blazer-handler.js';
import {cohortStatement,cohortResults} from '../src/blazer-cohorts.js';
import {createCheckNotifier} from '../src/blazer-mail.js';

test('Blazer private transport requires its own credential, bounded JSON and server-side administrator policy',async t=>{
  let calls=0;const handler=createBlazerHandler({secretKeyBase:'test',manage:{async request(op,input){calls++;return {op,actor_id:input.actor_id};}}});
  const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url='http://localhost:'+server.address().port+'/_internal/blazer/home',authorization='Bearer '+createHmac('sha256','test').update('walltaker:blazer:commands:v1').digest('hex');
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);assert.equal(calls,0);
  assert.equal((await fetch(url,{headers:{authorization}})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{authorization,'content-type':'application/json'},body:'{'})).status,400);assert.equal(calls,0);
  const response=await fetch(url,{method:'POST',headers:{authorization,'content-type':'application/json'},body:'{"actor_id":7}'});assert.equal(response.status,200);assert.equal(response.headers.get('x-walltaker-backend'),'node-blazer');assert.deepEqual(await response.json(),{op:'home',actor_id:7});
});
test('SQL concurrency leaves a connection free for actor-scoped cancellation',async()=>{
  let pid=0;const pending=[],cancels=[];
  const queryPool={async connect(){const processID=++pid;return {processID,async query(q){if(typeof q==='object')return new Promise(resolve=>pending.push(()=>resolve({fields:[],rows:[]})));return {rows:[]};},release(){}};},async query(sql,args){cancels.push(args);return {rows:[]};}};
  const service=createBlazer({pool:{async query(){return {rows:[]};}},queryPool,authorize:async()=>{}});
  const first=service.request('run',{actor_id:7,statement:'SELECT 1',run_id:'first'}),second=service.request('run',{actor_id:7,statement:'SELECT 2',run_id:'second'});
  while(pending.length<2)await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(service.request('run',{actor_id:7,statement:'SELECT 3'}),{status:429});
  assert.equal((await service.request('cancel',{actor_id:8,run_id:'first'})).canceled,false);assert.equal(cancels.length,0);
  assert.equal((await service.request('cancel',{actor_id:7,run_id:'first'})).canceled,true);assert.deepEqual(cancels,[[1]]);
  for(const resolve of pending)resolve();await Promise.all([first,second]);
});
test('scheduled check notifications occur on failures and recoveries, with failed delivery retried',async()=>{
  const check={id:9,query_id:4,creator_id:7,state:'new',check_type:'bad_data',emails:'staff@example.test'},sent=[];let rows=[],rejectMail=false;
  const pool={async query(sql,args){if(sql.startsWith('SELECT * FROM blazer_checks'))return {rows:[{...check}]};if(sql.startsWith('SELECT * FROM blazer_queries'))return {rows:[{id:4,statement:'SELECT 1'}]};if(sql.startsWith('UPDATE blazer_checks')){check.state=args[1];return {rows:[]};}return {rows:[]};}};
  const service=createBlazer({pool,queryPool:{async connect(){return {async query(sql){return typeof sql==='object'?{rows,fields:[]}:{rows:[]};},release(){}};}},authorize:async()=>{},notify:async c=>{if(rejectMail)throw Error('SMTP unavailable');sent.push(c.state);}});
  await service.request('check-run',{id:9});assert.equal(check.state,'passing');assert.deepEqual(sent,[]);
  rows=[[1]];await service.request('check-run',{id:9});await service.request('check-run',{id:9});assert.deepEqual(sent,['failing']);
  rows=[];rejectMail=true;await assert.rejects(service.request('check-run',{id:9}),/SMTP/);assert.equal(check.state,'failing');
  rejectMail=false;await service.request('check-run',{id:9});assert.deepEqual(sent,['failing','passing']);
});
test('native cohort SQL preserves bound values and produces bounded cohort tables with empty periods',()=>{
  const source={statement:'/* cohort analysis */ SELECT {value} AS user_id, now() AS conversion_time',values:['7']};
  const transformed=cohortStatement(source,'invalid');assert.match(transformed.statement,/date_trunc\('week'/);assert.match(transformed.statement,/MIN\(conversion_time\)/);assert.deepEqual(transformed.values,['7']);
  const result=cohortResults([['2026-10-12',0,'2'],['2026-10-12',1,'1'],['2026-09-28',0,'1']],'week',Date.parse('2026-10-25T00:00:00Z'));
  assert.equal(result.cohort,true);assert.equal(result.rows.length,3);assert.equal(result.rows[0][1],2);assert.equal(result.rows[0][2],1);assert.equal(result.rows[0].at(-1),null);assert.equal(result.rows[1][1],0);assert.equal(result.columns.length,14);assert.deepEqual(cohortResults([]).rows,[]);
});
test('Blazer mail uses native escaped content and never opens SMTP for checks without recipients',async()=>{
  const sent=[],notify=createCheckNotifier({baseUrl:'https://example.test',env:{WALLTAKER_MAIL_FROM:'checks@example.test'},transport:{async sendMail(message){sent.push(message);}}});
  await notify({emails:''},{rows:[]});assert.equal(sent.length,0);
  await notify({id:4,query_id:8,state:'error',message:'<img src=x>',emails:'one@example.test, two@example.test'},{rows:[[1]]});
  assert.deepEqual(sent[0].to,['one@example.test','two@example.test']);assert.match(sent[0].html,/&lt;img src=x&gt;/);assert.doesNotMatch(sent[0].html,/<img/);assert.match(sent[0].text,/https:\/\/example.test\/blazer\/queries\/8/);
});
