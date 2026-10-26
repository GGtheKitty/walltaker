import copy from './fixtures/original-copy.json' with {type:'json'};
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createApp} from '../src/app.js';
import {Router} from '../src/router.js';
import {addTrackerRoutes} from '../src/tracker-routes.js';
import {HttpError} from '../src/errors.js';
import {trackerPages,orgasmForm} from '../src/templates/tracker.js';
const now=new Date().toISOString(),year=new Date().getUTCFullYear();
const post=fields=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({authenticity_token:'valid',...fields})});
async function fixture(t,{anonymous=false,disabled=false}={}){
  const users=[{id:7,username:'Alice',mascot:'ki'},{id:8,username:'Bob',mascot:'warren'}];
  const link={id:12,user_id:7,terms:'Visible activity card',never_expires:true,blacklist:'',min_score:0};
  const hiddenLink={id:99,user_id:8,terms:'PRIVATE-CARD-SENTINEL',never_expires:true,friends_only:true};
  const state={calls:[],anonymous,disabled,entries:[{id:41,user_id:7,rating:3,is_ruined:false,caused_by_user_id:8,created_at:now}],pledges:[],cooldown:false};
  const graph=()=>({users,links:[link,hiddenLink],parents:[],profiles:[],abilities:[],memberships:[],kinks:[],past_links:[],leashes:[]});
  const form={pornlizard:{id:9,username:'PornLizardKi'},friends:[users[1]],recent_setters:[users[1]]};
  const owner=username=>users.find(u=>u.username===username)||(()=>{throw new HttpError(404,'User not found.');})();
  const backend=async(group,op,input)=>{
    state.calls.push({group,op,input});
    if(group==='browser'){
      if(op==='context')return {user:state.anonymous?null:users[0],surrender:state.delegated?{id:51,controller_user_id:8}:null,csrf_token:'valid',flags:{},graph:graph()};
      if(op==='csrf')return {verified:input.tokens.includes('valid')};
      if(op==='authorize')return state.surrendered?{allowed:false,redirect:'/surrenders/51'}:{allowed:true};
    }
    if(group==='social')return op==='notifications'?{notifications:[]}:{count:0};
    if(group==='tracker'){
      if(state.unavailable)throw new HttpError(503,'Tracker unavailable.');
      if(op==='entries'){if(input.username)owner(input.username);if(input.page==='bad')throw new HttpError(422,'Invalid page.');return {entries:state.entries.filter(o=>!input.username||o.user_id===owner(input.username).id),user:input.username?owner(input.username):null,page:Number(input.page),has_more:true};}
      if(op==='form')return form;
      if(op==='entry'){const entry=state.entries.find(o=>String(o.id)===String(input.entry_id));if(!entry)throw new HttpError(404,'Entry not found.');if(input.edit&&entry.user_id!==7)throw new HttpError(403,'Not authorized.');return {entry,...form};}
      if(op.startsWith('entry-')){
        if(op!=='entry-create'){const entry=state.entries.find(o=>String(o.id)===String(input.entry_id));if(!entry)throw new HttpError(404,'Entry not found.');if(entry.user_id!==7)throw new HttpError(403,'Not authorized.');if(op==='entry-delete'){state.entries=state.entries.filter(o=>o.id!==entry.id);return {entry_id:entry.id};}}
        if(!['1','2','3','4','5'].includes(input.rating))throw new HttpError(422,'Rating must be between 1 and 5.');
        if(op==='entry-create'){if(state.cooldown)throw new HttpError(422,"You're cumming too fast!");state.cooldown=true;const entry={id:42,user_id:7,rating:Number(input.rating),is_ruined:input.is_ruined==='1',caused_by_user_id:input.caused_by==='Bob'?8:null,created_at:now};state.entries.push(entry);return {entry};}
        const entry=state.entries.find(o=>String(o.id)===String(input.entry_id));entry.rating=Number(input.rating);entry.is_ruined=input.is_ruined==='1';return {entry};
      }
      if(op==='pledges'){const user=owner(input.username);if(state.disabled)throw new HttpError(403,'NNN is not currently enabled.');return {user,current:state.pledges.find(p=>p.year===year&&p.user_id===user.id)||null,pledges:state.pledges.filter(p=>p.user_id===user.id),past_links:[{id:71,e621_post_id:'123',post_url:'https://static1.e621.net/data/aa/bb/0123456789abcdef0123456789abcdef.mp4',post_thumbnail_url:'https://static1.e621.net/data/preview/aa/bb/0123456789abcdef0123456789abcdef.jpg'}]};}
      if(op==='pledge-create'||op==='pledge-fail'){
        if(state.disabled)throw new HttpError(403,'NNN is not currently enabled.');if(input.username!=='Alice')throw new HttpError(403,'Not authorized.');
        let pledge=state.pledges.find(p=>p.year===year&&p.user_id===7);
        if(op==='pledge-create'){if(!pledge){if(input.signature!=='Alice')throw new HttpError(422,'Username must be signed exactly!');pledge={id:61,user_id:7,year,failed_on:null,created_at:now};state.pledges.push(pledge);}}
        else if(pledge&&!pledge.failed_on)pledge.failed_on=now;
        return {pledge};
      }
    }
    if(group==='activity'&&op==='history')return {events:[{id:3,user_id:7,surrender_controller_id:8,link_id:12,ahoy_visit_id:21,did_what:1,created_at:now},{id:2,user_id:7,link_id:99,ahoy_visit_id:21,did_what:0,created_at:now},{id:1,user_id:7,link_id:12,ahoy_visit_id:null,did_what:2,created_at:'2020-01-01T00:00:00Z'}],visits:[{id:21,started_at:now}],users,links:[link],graph:{...graph(),links:undefined,parents:[],users,clients:[],decorations:[{link_id:12,emoji:'✨'}]}};
    throw Error('Unexpected '+group+'/'+op);
  };
  const router=new Router();addTrackerRoutes(router);const server=http.createServer(createApp({baseUrl:'http://localhost',secretKeyBase:'tracker-tests',backendUrl:'http://localhost'},{router,backend,proxy:()=>{throw Error('Rails unavailable');},logger:{error(){}}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {state,users,get:(path,options={})=>fetch('http://localhost:'+server.address().port+path,{redirect:'manual',...options})};
}
test('tracker, pledge and activity pages render natively without Rails; standalone tracker layout and frame forms are retained',async t=>{
  const {get}=await fixture(t);
  for(const path of ['/nut/orgasms','/nut/orgasmers/Alice','/nut/orgasms/new','/nut/orgasms/41','/nut/orgasms/41/edit','/users/Alice/nut_pledge','/users/Alice/nut_pledge/new','/users/Alice/nut_pledge/history','/history']){
    const r=await get(path);assert.equal(r.status,200,path);assert.equal(r.headers.get('x-walltaker-renderer'),'node-native');assert.doesNotMatch(await r.text(),/undefined|<%/);
  }
  const standalone=await (await get('/nut/orgasms/new')).text();assert.doesNotMatch(standalone,/<header>/);assert.match(standalone,/src="\/node-assets\/application/);
  const frame=await (await get('/nut/orgasms/new',{headers:{'turbo-frame':'orgasm_form'}})).text();assert.doesNotMatch(frame,/<!doctype/i);assert.match(frame,/id="orgasm_form"/);
  assert.match(await (await get('/nut/orgasms?page=2')).text(),/Previous page/);assert.equal((await get('/nut/orgasms?page=bad')).status,422);
});
test('public tracker reads stay public while signed-out mutations/forms and private history keep authorization',async t=>{
  const {state,get}=await fixture(t,{anonymous:true});
  for(const path of ['/nut/orgasms','/nut/orgasms/41','/nut/orgasmers/Alice','/users/Alice/nut_pledge/history'])assert.equal((await get(path)).status,200);
  for(const path of ['/nut/orgasms/new','/nut/orgasms/41/edit'])assert.equal((await get(path)).headers.get('location'),'/');
  assert.equal((await get('/history')).headers.get('location'),'/login');assert.equal((await get('/users/Alice/nut_pledge/new')).headers.get('location'),'/login');
  assert.ok(!state.calls.some(c=>c.group==='activity'));
});
test('create enforces CSRF, safe fields, validation and cooldown and returns a usable inline flash form',async t=>{
  const {state,get}=await fixture(t);
  assert.equal((await get('/nut/orgasms',post({authenticity_token:'bad','orgasm[rating]':'4'}))).status,422);
  assert.ok(!state.calls.some(c=>c.op==='entry-create'));
  let response=await get('/nut/orgasms',post({'orgasm[rating]':'9'}));assert.equal(response.headers.get('location'),'/nut/orgasms/new');
  response=await get('/nut/orgasms',post({'orgasm[rating]':'4','orgasm[is_ruined]':'1','orgasm[caused_by]':'Bob','orgasm[user_id]':'8','orgasm[created_at]':'2020-01-01'}));assert.equal(response.status,303);assert.equal(state.entries.at(-1).user_id,7);assert.equal(state.entries.at(-1).caused_by_user_id,8);
  const call=state.calls.filter(c=>c.op==='entry-create').at(-1).input;assert.equal(call.user_id,undefined);assert.equal(call.created_at,undefined);assert.equal(call.actor_id,7);assert.match(call.request_key,/:entry-create$/);
  response=await get('/nut/orgasms',post({'orgasm[rating]':'4'}));assert.equal(response.headers.get('location'),'/nut/orgasms/new');assert.equal(state.entries.length,2);
  const cookie=response.headers.getSetCookie().find(c=>c.startsWith('_walltaker_session='));const body=await (await get('/nut/orgasms/new',{headers:{cookie:cookie.split(';')[0],'turbo-frame':'orgasm_form'}})).text();assert.match(body,/cumming too fast/);assert.match(body,/flash--danger unbounded/);
});
test('editing/deletion protect ownership and preserve original attribution/timestamp; edit forms navigate to the full show page',async t=>{
  const {state,get}=await fixture(t);state.entries.push({id:43,user_id:8,rating:2});
  for(const path of ['/nut/orgasms/43/edit'])assert.equal((await get(path)).status,403);
  for(const method of ['patch','delete'])assert.equal((await get('/nut/orgasms/43',post({_method:method,'orgasm[rating]':'4'}))).status,403);
  const form=await (await get('/nut/orgasms/41/edit')).text();assert.match(form,/data-turbo-frame="_top"/);assert.doesNotMatch(form,/name="orgasm\[caused_by\]"/);assert.match(form,/value="3" checked/);
  const response=await get('/nut/orgasms/41',post({_method:'patch','orgasm[rating]':'5','orgasm[is_ruined]':'1','orgasm[caused_by]':'Alice','orgasm[user_id]':'8'}));assert.equal(response.headers.get('location'),'/nut/orgasms/41');assert.equal(state.entries[0].caused_by_user_id,8);assert.equal(state.entries[0].created_at,now);assert.equal(state.entries[0].rating,5);
  await get('/nut/orgasms/41',post({_method:'delete'}));assert.ok(!state.entries.some(o=>o.id===41));
});
test('pledge signing is enabled-gated, owner-only, exactly signed and idempotent; failure updates the pledge frame',async t=>{
  const {state,get}=await fixture(t);
  assert.equal((await get('/users/Bob/nut_pledge/new')).status,403);
  assert.equal((await get('/users/Bob/nut_pledge',post({'nut_pledge[username]':'Bob'}))).status,403);
  assert.equal((await get('/users/Alice/nut_pledge',post({'nut_pledge[username]':'alice'}))).headers.get('location'),'/users/Alice/nut_pledge/new');
  for(let i=0;i<2;i++)assert.equal((await get('/users/Alice/nut_pledge',post({'nut_pledge[username]':'Alice'}))).headers.get('location'),'/users/Alice');assert.equal(state.pledges.length,1);
  assert.equal((await get('/users/Alice/nut_pledge/new')).headers.get('location'),'/users/Alice');
  const response=await get('/users/Alice/nut_pledge',{...post({_method:'put'}),headers:{...post({}).headers,'turbo-frame':'pledge'}});const body=await response.text();assert.match(body,/id="pledge"/);assert.match(body,/Failed NNN/);assert.doesNotMatch(body,/<!doctype/i);
  const failed=state.pledges[0].failed_on;await get('/users/Alice/nut_pledge',post({_method:'put'}));assert.equal(state.pledges[0].failed_on,failed);
  state.disabled=true;assert.equal((await get('/users/Alice/nut_pledge/history')).headers.get('location'),'/');assert.equal((await get('/users/Alice/nut_pledge',post({_method:'put'}))).headers.get('location'),'/');
});
test('pledge history preserves success/in-progress/failure states and video-thumbnail previews',async t=>{
  const {state,get}=await fixture(t);state.pledges=[{id:60,user_id:7,year:year-1,created_at:now},{id:61,user_id:7,year,created_at:now},{id:62,user_id:7,year:year-2,created_at:now,failed_on:now,past_link_id:71}];
  const body=await (await get('/users/Alice/nut_pledge/history')).text();assert.match(body,/Succeeded/);assert.match(body,/In progress/);assert.match(body,/Failed on day/);assert.match(body,/nut-pledge-history__preview/);assert.match(body,/https:\/\/e621.net\/posts\/123/);assert.doesNotMatch(body,/<video/);
  const panel=await (await get('/users/Alice/nut_pledge')).text();assert.match(panel,/data-turbo="true"/);assert.match(panel,/mark your NNN pledge as failed/);
});
test('history groups visits/links, retains visitless events and delegated attribution, and never rehydrates hidden cards',async t=>{
  const {state,get}=await fixture(t);state.delegated=true;
  const response=await get('/history?actor_id=8&user_id=8'),body=await response.text();assert.equal(response.status,200);assert.match(body,/Visible activity card/);assert.match(body,/This wallpaper link is no longer available/);assert.match(body,/on behalf of/);assert.match(body,/set wallpaper/);assert.match(body,/commented on/);assert.doesNotMatch(body,/PRIVATE-CARD-SENTINEL|\/links\/99|undefined/);
  const call=state.calls.find(c=>c.group==='activity'&&c.op==='history');assert.equal(call.input.actor_id,7);assert.equal(call.input.surrender_id,51);assert.equal(call.input.user_id,undefined);assert.ok(!state.calls.some(c=>c.op==='hydrate'));
  assert.equal((body.match(/class="accent-block no-charm"/g)||[]).length,2);
});
test('tracker service failures are retryable and surrendered owners keep the existing authorization redirect',async t=>{
  const {state,get}=await fixture(t);state.unavailable=true;assert.equal((await get('/nut/orgasms')).status,503);assert.equal((await get('/nut/orgasms',post({'orgasm[rating]':'4'}))).status,503);assert.equal(state.entries.length,1);
  state.surrendered=true;assert.equal((await get('/history')).headers.get('location'),'/surrenders/51');
});
test('native forms and pledge paragraphs preserve original static wording and form field hooks',async()=>{
  const v={targetUser:{id:7,username:'Alice',mascot:'ki'},orgasmForm:{friends:[],recent_setters:[]},csrf:'valid',flash:{},pledges:[],graph:{past_links:[]}};
  const plain=s=>String(s).replace(/<[^>]*>/g,' ').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
  for(const [source,page] of [['nuttracker/app/views/nuttracker/orgasms/_form.html.erb','form'],['app/views/nut_pledges/new.html.erb','tracker-pledge-new'],['app/views/nut_pledges/history.html.erb','tracker-pledge-history']]){
    const output=plain(page==='form'?orgasmForm(v):trackerPages[page](v));
    for(const paragraph of copy.paragraphs[source])assert.ok(output.includes(plain(paragraph)),source+': '+plain(paragraph));
  }
});
