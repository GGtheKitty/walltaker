import copy from './fixtures/original-copy.json' with {type:'json'};
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Router} from '../src/router.js';
import {createApp} from '../src/app.js';
import {addSocialRoutes} from '../src/social-routes.js';
import {HttpError} from '../src/errors.js';
import {socialPages,message} from '../src/templates/social.js';

const now=new Date().toISOString(),form=values=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({authenticity_token:'valid',...values})});
async function fixture(t,{anonymous=false}={}){
  const state={anonymous,calls:[],users:[{id:7,username:'Alice',set_count:3},{id:8,username:'Bob',set_count:2},{id:9,username:'Chris',set_count:1}],friendships:[{id:11,sender_id:7,receiver_id:8,confirmed:true,created_at:now,updated_at:now},{id:12,sender_id:9,receiver_id:7,confirmed:false,created_at:now,updated_at:now}],threads:[{id:21,name:null}],participants:[{id:31,message_thread_id:21,user_id:7,notify:true},{id:32,message_thread_id:21,user_id:8,notify:true}],messages:[{id:61,message_thread_id:21,from_user_id:8,content:'Hello <script>private</script> https://example.test',created_at:now}],leashes:[{id:41,master_id:7,pet_id:8,friendship_id:11,flair:'Pet',created_at:now}],surrenders:[{id:51,user_id:7,controller_user_id:8,friendship_id:11,accepted_consequences:true,pending:true,expires_at:new Date(Date.now()+3600000).toISOString(),updated_at:now}],notifications:[{id:71,user_id:7,text:'Private notice',notification_type:9,created_at:now,link:'/friendships'}],scoops:[{id:81,user_id:7,details:'My scoop',was_shown:false,created_at:now,updated_at:now}]};
  const graph=()=>structuredClone({...Object.fromEntries(['users','friendships','threads','participants','messages','leashes','surrenders','scoops'].map(key=>[key,state[key]])),surrender_valid:['51'],recent_sets:[],profiles:[],memberships:[],kinks:[],links:[]});
  const thread=id=>{if(String(id)!=='21'||!state.participants.some(p=>p.user_id===7))throw new HttpError(404,'Thread was not found, or you were removed from it.');return state.threads[0];};
  const backend=async(group,op,input)=>{
    state.calls.push({group,op,input});
    if(group==='browser'){
      if(op==='context')return {user:state.anonymous?null:state.users[0],surrender:state.delegated?{id:51,controller_user_id:8}:null,graph:graph(),csrf_token:'valid',flags:{}};
      if(op==='csrf')return {verified:input.tokens.includes('valid')};
      if(op==='authorize')return state.surrendered&&input.mode!=='surrendered'?{allowed:false,redirect:'/surrenders/51'}:{allowed:true};
      if(op==='hydrate')return {graph:graph()};
      if(op==='profile-page')return {graph:graph(),link_ids:[]};
      if(op==='surrender-assume'||op==='surrender-return')return {user:state.users[op==='surrender-return'?1:0],surrender:op==='surrender-return'?null:{id:51,controller_user_id:8},graph:graph(),clear_legacy:true,cookies:[{name:'walltaker_session',value:'rotated-social-session'}]};
    }
    if(group==='activity')return {visit:{id:1}};
    if(group==='e621')return {post:{file:{url:'https://static1.e621.net/data/aa/bb/0123456789abcdef0123456789abcdef.jpg'}}};
    if(group==='automation')return {entry:{message:'News <script>',image_url:'https://example.test/backdrop.jpg',lizard_image_url:'mascot/news/TaylorDeskOpen.png'}};
    if(group==='social'){
      if(state.unavailable)throw new HttpError(503,'Unavailable');
      if(op==='friend-requests-count')return {count:1};if(op==='leaderboard')return {users:state.users};
      if(op==='notifications')return {notifications:state.notifications};
      if(op==='notification-read'){const n=state.notifications.find(n=>String(n.id)===String(input.notification_id)&&n.user_id===7);if(!n)throw new HttpError(404,'Notification not found.');state.notifications=state.notifications.filter(row=>row.id!==n.id);return {link:n.link};}
      if(op==='notifications-clear'){state.notifications=[];return {};}
      if(op==='friends')return {friendships:state.friendships};
      if(op==='friend'){const f=state.friendships.find(f=>String(f.id)===String(input.friendship_id));if(!f)throw new HttpError(403,'Not authorized.');return {friendship:f};}
      if(op==='friend-request'){if(input.username==='Alice')throw new HttpError(422,'You cannot friend yourself.');return {friendship_id:13};}
      if(op==='friend-accept'){const f=state.friendships.find(f=>String(f.id)===String(input.friendship_id));if(f.receiver_id!==7)throw new HttpError(403,'Only receiver can accept.');f.confirmed=true;return {};}
      if(op==='friend-delete'){state.friendships=state.friendships.filter(f=>String(f.id)!==String(input.friendship_id));return {};}
      if(op==='threads')return {threads:state.threads};
      if(op==='thread'||op==='messages-before'){const t=thread(input.thread_id);const cursor=op==='messages-before'?state.messages.find(m=>String(m.id)===String(input.after_id)):null;if(op==='messages-before'&&!cursor)throw new HttpError(404,'Message cursor not found in this thread.');return {thread:t,participants:state.participants,messages:op==='messages-before'?state.messages.filter(m=>m.id<cursor.id):state.messages,cursor};}
      if(op==='thread-create'||op==='thread-resolve')return {thread_id:21};
      if(['message-send','thread-name','thread-notify','thread-add','thread-remove'].includes(op)){
        thread(input.thread_id);
        if(op==='message-send'){if(!input.content.trim())throw new HttpError(422,'Content cannot be blank.');state.messages.unshift({id:62,message_thread_id:21,from_user_id:7,content:input.content,created_at:now});}
        if(op==='thread-name')state.threads[0].name=input.reset?null:input.name;
        if(op==='thread-notify'){const p=state.participants.find(p=>String(p.id)===String(input.participant_id)&&p.user_id===7);if(!p)throw new HttpError(403,'Not authorized.');p.notify=input.notify==='1';}
        if(op==='thread-remove')state.participants=state.participants.filter(p=>String(p.user_id)!==String(input.user_id));
        if(op==='thread-add')state.participants.push({id:33,message_thread_id:21,user_id:Number(input.user_id)});
        return {thread_id:21};
      }
      if(op==='leashes')return {user:state.users.find(u=>u.username===input.username),leashes:state.leashes};
      if(op==='leash')return {leash:state.leashes[0]};
      if(op==='leash-create'||op==='leash-update'||op==='leash-delete')return {leash_id:41};
      if(op==='surrenders')return {surrenders:state.surrenders};
      if(op==='surrender'){const s=state.surrenders.find(s=>String(s.id)===String(input.id));if(!s)throw new HttpError(403,'Not authorized.');return {surrender:s};}
      if(op==='surrender-create'){if(input.accepted!=='1')throw new HttpError(422,'Accept the consequences.');return {surrender_id:51};}
      if(op==='surrender-delete'){state.surrenders=[];return {};}
      if(op==='scoops')return {scoops:state.scoops};
      if(op==='scoop'){const s=state.scoops.find(s=>String(s.id)===String(input.scoop_id));if(!s)throw new HttpError(404,'Scoop not found.');if(input.edit&&s.user_id!==7)throw new HttpError(403,'Not authorized.');return {scoop:s};}
      if(op==='scoop-create')return {scoop_id:82};
      if(op==='scoop-update'||op==='scoop-delete'){const s=state.scoops[0];if(s.was_shown)throw new HttpError(422,'Scoop was already shown. It can no longer be changed.');if(op==='scoop-update')s.details=input.details;else state.scoops=[];return {scoop_id:s.id};}
    }
    throw Error('Unexpected '+group+'/'+op);
  };
  const router=new Router();addSocialRoutes(router);
  const server=http.createServer(createApp({baseUrl:'http://localhost',secretKeyBase:'social-tests',backendUrl:'http://localhost'},{router,backend,proxy:()=>{throw Error('Rails unavailable');},logger:{error(){}}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {state,get:(path,options={})=>fetch('http://localhost:'+server.address().port+path,{redirect:'manual',...options})};
}
test('all social/community pages and frame fragments render natively with the Rails fallback unavailable',async t=>{
  const {get}=await fixture(t);
  for(const path of ['/friendships','/friendships/requests','/friendships/new?with=Bob','/friendships/11','/messages','/messages/21','/messages/21/edit','/notifications','/users/Alice/leashes','/leashes/new','/leashes/41','/leashes/41/edit','/surrenders','/surrenders/new','/surrenders/51','/scoops','/scoops/new','/scoops/81','/scoops/81/edit','/leaderboard','/news_room/index']){
    const response=await get(path);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-walltaker-renderer'),'node-native',path);assert.doesNotMatch(await response.text(),/undefined|<%/);
  }
  const frame=await get('/surrenders/new',{headers:{'turbo-frame':'surrender_form_wrapper'}});assert.doesNotMatch(await frame.text(),/<!doctype/i);
});
test('private pages require login while leaderboard, public leashes, scoop interviews and newsroom remain public',async t=>{
  const {get}=await fixture(t,{anonymous:true});
  for(const path of ['/friendships','/messages','/messages/21','/notifications','/leashes/new','/surrenders','/surrenders/51','/scoops','/scoops/81/edit'])assert.equal((await get(path)).headers.get('location'),'/login',path);
  for(const path of ['/leaderboard','/users/Bob/leashes','/scoops/81','/news_room/index'])assert.equal((await get(path)).status,200,path);
});
test('friend requests and acceptance/removal use actor identity and preserve original redirects and notices',async t=>{
  const {state,get}=await fixture(t);
  assert.match(await (await get('/friendships/requests')).text(),/Chris/);
  let response=await get('/friendships',form({receiver_username:'Alice'}));assert.equal(response.headers.get('location'),'/friendships');
  response=await get('/friendships',{...form({receiver_username:'Bob',actor_id:'9'}),headers:{...form({}).headers,referer:'http://localhost/friendships/new'}});assert.equal(response.headers.get('location'),'/friendships/new');
  assert.equal(state.calls.find(c=>c.op==='friend-request').input.actor_id,7);
  assert.equal((await get('/friendships/11/accept',form({_method:'put'}))).status,403);
  assert.equal((await get('/friendships/12/accept',form({_method:'put'}))).headers.get('location'),'/friendships');assert.ok(state.friendships[1].confirmed);
  await get('/friendships/12',form({_method:'delete'}));assert.equal(state.friendships.length,1);
});
test('thread messages, membership, names, notify streams and cursors retain membership enforcement',async t=>{
  const {state,get}=await fixture(t);
  let body=await (await get('/messages/21')).text();assert.ok(body.includes(Buffer.from(JSON.stringify('social_thread_member_31_7')).toString('base64')));assert.doesNotMatch(body,/<script>private<\/script>/);assert.match(body,/id="message_content"/);assert.match(body,/message_thread=21/);
  assert.equal((await get('/messages/99')).status,404);
  await get('/messages/21/send',form({'message[content]':'New message','from_user_id':'9'}));assert.equal(state.messages[0].from_user_id,7);
  await get('/messages/21',form({_method:'patch','message_thread[name]':'Group',commit:'Set'}));assert.equal(state.threads[0].name,'Group');
  await get('/messages/21',form({_method:'patch',commit:'Reset'}));assert.equal(state.threads[0].name,null);
  assert.equal((await get('/messages/21/participants/32',form({_method:'patch','message_thread_participant[notify]':'0'}))).status,403);
  const response=await get('/messages/21/participants/31',form({_method:'patch','message_thread_participant[notify]':'0'}));assert.match(response.headers.get('content-type'),/turbo-stream/);assert.match(await response.text(),/target="message_thread_21-controls"/);assert.equal(state.participants[0].notify,false);
  body=await (await get('/messages/21/load_more?after_id=62')).text();assert.match(body,/action="append"/);assert.match(body,/target="message_62_load_more_link"/);
  assert.equal((await get('/messages/21/load_more?after_id=900')).status,404);
  await get('/messages/21/users/9',form({}));assert.ok(state.participants.some(p=>p.user_id===9));
  assert.equal((await get('/messages/21/users/7',form({_method:'delete'}))).headers.get('location'),'/messages');assert.equal((await get('/messages/21')).status,404);
});
test('GET side effects exclude HEAD, prefetch and cross-site navigation',async t=>{
  const {state,get}=await fixture(t);
  for(const path of ['/messages/new','/messages/resolve_thread_with/8','/notifications/71']){
    await get(path,{method:'HEAD'});await get(path,{headers:{purpose:'prefetch'}});assert.equal((await get(path,{headers:{'sec-fetch-site':'cross-site'}})).status,403);
  }
  assert.ok(!state.calls.some(c=>['thread-create','thread-resolve','notification-read'].includes(c.op)));
  assert.equal((await get('/messages/new')).headers.get('location'),'/messages/21/edit');
  assert.equal((await get('/messages/resolve_thread_with/8')).headers.get('location'),'/messages/21');
});
test('notifications can be consumed only by their owner, and clear/read redirects stay on-site',async t=>{
  const {state,get}=await fixture(t);assert.equal((await get('/notifications/999')).status,404);
  assert.equal((await get('/notifications/71')).headers.get('location'),'/friendships');assert.equal(state.notifications.length,0);
  await get('/notifications',{...form({_method:'delete'}),headers:{...form({}).headers,referer:'https://foreign.invalid/'}});assert.equal(state.notifications.length,0);
});
test('surrenders retain consent fields, surrendered-owner access, and full session transitions',async t=>{
  const {state,get}=await fixture(t);
  const body=await (await get('/surrenders/new')).text();assert.match(body,/surrender\[accepted_consequences\]/);assert.match(body,/value="336"/);assert.match(body,/Let me keep using the site/);
  assert.equal((await get('/surrenders',form({'surrender[friendship]':'11','surrender[duration]':'24','surrender[accepted_consequences]':'0'}))).headers.get('location'),'/surrenders/new');
  assert.equal((await get('/surrenders',form({'surrender[friendship]':'11','surrender[duration]':'24','surrender[accepted_consequences]':'1'}))).headers.get('location'),'/surrenders/51');
  state.surrendered=true;assert.equal((await get('/messages')).headers.get('location'),'/surrenders/51');assert.equal((await get('/surrenders/51')).status,200);state.surrendered=false;
  let response=await get('/surrenders/51/assume',form({}));assert.equal(response.headers.get('location'),'/');assert.ok(response.headers.getSetCookie().some(c=>c.startsWith('walltaker_session=rotated-social-session')));
  state.delegated=true;response=await get('/surrenders/return_to_controller',form({}));assert.equal(response.headers.get('location'),'/');assert.ok(state.calls.some(c=>c.op==='visit-authenticate'&&c.input.user_id===8));
  state.surrenders[0].user_id=8;assert.equal((await get('/surrenders/51')).status,403);
});
test('CSRF rejects every unsafe social command before business services are called',async t=>{
  const {state,get}=await fixture(t);
  for(const [path,values] of [['/friendships',{}],['/messages/21/send',{}],['/messages/21/users/8',{_method:'delete'}],['/notifications',{_method:'delete'}],['/leashes',{}],['/leashes/41',{_method:'delete'}],['/surrenders',{}],['/surrenders/51/assume',{}],['/surrenders/return_to_controller',{}],['/scoops',{}]])assert.equal((await get(path,form({...values,authenticity_token:'bad'}))).status,422,path);
  assert.ok(!state.calls.some(c=>c.group==='social'||c.group==='browser'&&c.op!=='csrf'));
});
test('scoop content stays escaped, owner editing is checked, and aired scoops remain immutable',async t=>{
  const {state,get}=await fixture(t);
  await get('/scoops/81',form({_method:'patch','scoop[details]':'Updated <script>text</script>'}));assert.match(await (await get('/scoops')).text(),/Updated &lt;script&gt;text&lt;\/script&gt;/);
  state.scoops[0].user_id=8;assert.equal((await get('/scoops/81/edit')).status,403);state.scoops[0].user_id=7;state.scoops[0].was_shown=true;
  const body=await (await get('/scoops')).text();assert.match(body,/disabled/);
  assert.equal((await get('/scoops/81',form({_method:'delete'}))).headers.get('location'),'/scoops');assert.equal(state.scoops.length,1);
});
test('native message rendering links safe URLs, proxies e621 images/videos and escapes hostile HTML',()=>{
  const v={users:new Map([['7',{username:'Alice'}]]),media:src=>'/proxy?src='+encodeURIComponent(src)};
  const output=String(message(v,{id:1,from_user_id:7,created_at:now,content:'<img src=x onerror=attack()> javascript:alert(1) https://example.test https://static1.e621.net/data/aa/bb/abc.jpg https://static2.e621.net/data/aa/bb/abc.mp4'}));
  assert.doesNotMatch(output,/<img src=x|href="javascript/);assert.match(output,/href="https:\/\/example.test\/"/);assert.match(output,/<video controls>/);assert.match(output,/src="\/proxy\?/);
  const formatted=String(message(v,{id:2,from_user_id:7,created_at:now,content:'<b>Bold</b> <a href="https://example.test?a=1&amp;b=2">Link</a>'}));assert.match(formatted,/<b>Bold<\/b>/);assert.match(formatted,/href="https:\/\/example.test\?a=1&amp;b=2"/);
});
test('native warnings, introductory paragraphs and thread help preserve original wording',async()=>{
  const users=[{id:7,username:'Alice'},{id:8,username:'Bob'}];const v={user:users[0],targetUser:users[0],users:new Map(users.map(u=>[String(u.id),u])),graph:{users,leashes:[],participants:[],recent_sets:[]},leashes:[],friendships:[],scoops:[],surrenders:[],thread:{id:21},csrf:'valid',flash:{}};
  const plain=s=>String(s).replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
  for(const [file,page] of [['leashes/index','social-leashes'],['leashes/new','social-leash-new'],['surrenders/index','social-surrenders'],['surrenders/new','social-surrender-new'],['surrenders/_form','social-surrender-new'],['message_thread/edit','social-thread-edit']]){
    const output=plain(socialPages[page](v))+plain(socialPages[page]({...v,currentSurrender:{id:51}}));
    for(const paragraph of copy.paragraphs['app/views/'+file+'.html.erb'])assert.ok(output.includes(plain(paragraph)),file+': '+plain(paragraph));
  }
});
test('Node media assets support bounded byte ranges, HEAD, suffix reads and invalid ranges',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'node-media-'));t.after(()=>rm(directory,{recursive:true,force:true}));await mkdir(join(directory,'video'));
  const filename='video/globe.0123456789abcdef0123.mp4';await writeFile(join(directory,filename),'0123456789');await writeFile(join(directory,'manifest.json'),JSON.stringify({version:1,assets:{'application.js':'app.0123456789abcdef0123.js','application.css':'app.0123456789abcdef0123.css','video/globe.mp4':filename}}));
  const server=http.createServer(createApp({baseUrl:'http://localhost',backendUrl:'http://localhost',legacyUrl:'http://localhost',secretKeyBase:'test',assetsDirectory:directory}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url='http://localhost:'+server.address().port+'/node-assets/'+filename;
  let response=await fetch(url,{headers:{range:'bytes=2-5'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 2-5/10');assert.equal(response.headers.get('content-type'),'video/mp4');assert.equal(await response.text(),'2345');
  response=await fetch(url,{headers:{range:'bytes=-3'}});assert.equal(await response.text(),'789');
  response=await fetch(url,{method:'HEAD'});assert.equal(response.headers.get('content-length'),'10');assert.equal(await response.text(),'');
  response=await fetch(url,{headers:{range:'bytes=100-200'}});assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),'bytes */10');
});
