import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiServer } from '../src/app.js';
import { createAutomationHandler,automationToken } from '../src/automation-handler.js';
import { commandToken } from '../src/internal.js';
import { legacyAutomationJob } from '../src/automation-legacy.js';
import { wallpaperSpeech } from '../src/newsroom-speech.js';
import { CommandError } from '../src/updates.js';

test('automation commands require a distinct credential, POST, JSON and a bounded object body',async()=>{
 const calls=[];
 const server=createApiServer({repository:{},store:{},secretKeyBase:'secret',baseUrl:'https://example.test',
  automationHandler:createAutomationHandler({secretKeyBase:'secret',manage:async(op,input)=>{if(op==='bad')throw new CommandError(422,'Bad command');calls.push([op,input]);return {ok:true};}})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/_internal/automation/status`;
 const headers={authorization:'Bearer '+automationToken('secret'),'content-type':'application/json'};
 try {
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,authorization:'Bearer '+commandToken('secret')},body:'{}'})).status,403);
  assert.equal((await fetch(url,{headers})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415);
  for(const body of ['no','null','[]'])assert.equal((await fetch(url,{method:'POST',headers,body})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({content:'x'.repeat(1024*1024)})})).status,413);
  const r=await fetch(url,{method:'POST',headers,body:'{}'});assert.equal(r.status,200);assert.equal(r.headers.get('x-walltaker-backend'),'node-automation');assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(calls,[['status',{}]]);
  assert.equal((await fetch(url.replace('/status','/bad'),{method:'POST',headers,body:'{}'})).status,422);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('legacy jobs decode real ActiveJob keyword/global ID/symbol shapes without deserializing arbitrary classes',()=>{
 const row={class_name:'SetLinkJob',arguments:JSON.stringify({arguments:[{e621_post:{id:321},link:{_aj_globalid:'gid://walltaker/Link/42'},set_by:{_aj_globalid:'gid://walltaker/User/7'},_aj_ruby2_keywords:['e621_post','link','set_by']}]})};
 assert.deepEqual(legacyAutomationJob(row),{kind:'set-link',payload:{link_id:'42',post_id:'321',set_by_id:'7'}});
 const original=JSON.parse(row.arguments);original.arguments[0].request_key='original-write';row.arguments=JSON.stringify(original);
 assert.equal(legacyAutomationJob(row).payload.write_key,'original-write');
 row.arguments=JSON.stringify({arguments:[{e621_post:{id:321},link:{_aj_globalid:'gid://walltaker/User/42'}}]});assert.throws(()=>legacyAutomationJob(row));
 const entry={message:'Hello',type:'post'};
 assert.deepEqual(legacyAutomationJob({class_name:'PushNewsJob',arguments:JSON.stringify({arguments:[JSON.stringify(entry),{transitioning:{_aj_serialized:'ActiveJob::Serializers::SymbolSerializer',value:'away'}}]})}),{kind:'news-entry',payload:{entry,phase:'away',done:false}});
});

test('native newsroom speech covers existing tones, mascot names and empty tag lists',()=>{
 for(const tags of ['', 'rating:s clothed', 'impregnation cum', 'jerma985', 'canine feline']) {
  const text=wallpaperSpeech({tags,setter:'Alice',settee:'Bob',random:()=>0.2});
  assert.equal(typeof text,'string');assert.ok(text.length>0);assert.ok(!text.includes('undefined'));
 }
});
