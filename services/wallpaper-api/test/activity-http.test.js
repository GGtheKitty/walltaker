import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiServer } from '../src/app.js';
import { createActivityHandler,activityToken } from '../src/activity-handler.js';
import { automationToken } from '../src/automation-handler.js';
import { activityProperties,analyticsUrl } from '../src/activity-properties.js';
import { CommandError } from '../src/updates.js';

test('activity endpoints require their own token, POST, JSON, a bounded object and preserve rejection statuses',async()=>{
 const calls=[];const server=createApiServer({repository:{},store:{},secretKeyBase:'secret',baseUrl:'https://example.test',
  activityHandler:createActivityHandler({secretKeyBase:'secret',manage:async(op,input)=>{if(op==='denied')throw new CommandError(403,'Denied');calls.push([op,input]);return {ok:true};}})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/_internal/activity/history`,headers={authorization:'Bearer '+activityToken('secret'),'content-type':'application/json'};
 try {
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,authorization:'Bearer '+automationToken('secret')},body:'{}'})).status,403);
  assert.equal((await fetch(url,{headers})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415);
  for(const body of ['no','[]','null'])assert.equal((await fetch(url,{method:'POST',headers,body})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({x:'a'.repeat(1024*1024)})})).status,413);
  const r=await fetch(url,{method:'POST',headers,body:'{"actor_id":"1"}'});assert.equal(r.status,200);assert.equal(r.headers.get('x-walltaker-backend'),'node-activity');assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(calls,[['history',{actor_id:'1'}]]);
  assert.equal((await fetch(url.replace('history','denied'),{method:'POST',headers,body:'{}'})).status,403);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('analytics properties redact nested credentials and URL secrets, bound depth and preserve useful event fields',()=>{
 const source={_action:'links#update',attempted_post_id:321,api_key:'private',nested:{password:'private',cookie:'private',count:3},_url:'https://user:pass@example.test/page?api_key=private&q=forest#token',items:[{authorization:'private'}]};
 const clean=activityProperties(source);assert.equal(clean._action,'links#update');assert.equal(clean.attempted_post_id,321);assert.equal(clean.nested.count,3);assert.ok(!JSON.stringify(clean).includes('private'));assert.ok(!clean._url.includes('user:pass'));assert.ok(!clean._url.includes('#'));assert.equal(new URL(clean._url).searchParams.get('q'),'forest');
 assert.equal(analyticsUrl('javascript:alert(1)'),null);assert.equal(analyticsUrl('bad'),null);assert.equal(activityProperties('x'.repeat(10000)).length,8192);
 let nested={};for(let i=0;i<10;i++)nested={value:nested};assert.ok(JSON.stringify(activityProperties(nested)).includes('[TRUNCATED]'));
});
