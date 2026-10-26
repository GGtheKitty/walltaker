import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../src/app.js';
import {Router} from '../src/router.js';
import {addWallpaperRoutes,linkPolicy,wizardSteps} from '../src/wallpaper-routes.js';
import {createBackend} from '../src/backend.js';
import {HttpError} from '../src/errors.js';
import {normalizeSettings} from '../../wallpaper-api/src/link-settings.js';
import {applyWizard} from '../../wallpaper-api/src/link-wizard.js';

const user={id:7,username:'Alice',set_count:400,mascot:'ki'},other={id:8,username:'Bob'};
const initial={id:12,user_id:7,never_expires:true,expires:null,friends_only:false,blacklist:'gore',theme:null,min_score:0,terms:'Hello <script>attack()</script><b>world</b>',post_url:'https://static1.e621.net/data/aa/bb/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',post_thumbnail_url:'https://static1.e621.net/data/preview/aa/bb/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',post_description:'Test',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),wizard_page:null};
const post={id:999,file:{url:'https://static1.e621.net/data/cc/dd/cccccccccccccccccccccccccccccccc.png'},preview:{url:'https://static1.e621.net/data/preview/cc/dd/cccccccccccccccccccccccccccccccc.jpg'},sample:{url:'https://static1.e621.net/data/sample/cc/dd/cccccccccccccccccccccccccccccccc.jpg'},tags:{general:['safe'],species:['cat']},rating:'s',description:'Verified'};
const form=fields=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({authenticity_token:'valid',...fields})});
async function fixture(t,{anonymous=false,quarantined=false,ban=false,unavailable=false,masterOnly=false}={}) {
  const state={link:{...initial},calls:[],comments:[],memberships:[],kinks:[],anonymous,quarantined,ban,unavailable,masterOnly};
  const graph=()=>({links:[state.link],users:[user,other],abilities:state.masterOnly?[{id:1,link_id:12,ability:'is_master_only'}]:[],memberships:state.memberships,kinks:state.kinks,leashes:[],past_links:[],connected:[]});
  const backend=async(group,op,input)=>{
    state.calls.push({group,op,input});
    if(group==='browser') {
      if(op==='context')return {user:state.anonymous?null:{...user,quarantined:state.quarantined},graph:graph(),csrf_token:'valid',flags:{}};
      if(op==='csrf')return {verified:input.tokens.includes('valid')};
      if(op==='authorize')return {allowed:true};
      if(op==='link') {
        if(!['12','alias'].includes(input.identifier))throw new HttpError(404,'Private link');
        return {link_id:12,graph:graph()};
      }
      if(op==='hydrate')return {graph:graph()};
      if(op==='user')return {user_id:7,graph:graph()};
      if(op==='thread')return {thread_id:3,graph:graph()};
    }
    if(group==='activity')return {visit:{id:1},ban:state.ban};
    if(group==='social') {
      if(op==='comments')return {comments:state.comments};
      if(op==='comment-create'){state.comments.push({id:1,user_id:7,content:input.content});return {comment_id:1};}
      if(op==='message-send')return {thread_id:input.thread_id};
      return {count:0,notifications:[]};
    }
    if(group==='discovery')return {links:[state.link],new_user_links:[],graph:graph(),page:1,query:'test',total:1,has_next:false,link_id:12};
    if(group==='links') {
      if(op==='list')return {links:[state.link]};
      if(op==='export')return {text:'[Feed]\nfeed = 12\n'};
      if(op==='wizard-start'){state.link.wizard_page='intro';return {link:state.link};}
      if(op==='wizard-apply') {
        if(input.step!==state.link.wizard_page)throw new HttpError(409,'Step changed');
        const result=applyWizard(input.step,input.choices,state.link);
        state.link={...state.link,...normalizeSettings(result.changes,state.link,400),wizard_page:result.wizardPage};
        return {link:state.link,next_step:result.nextStep};
      }
      if(op==='create'||op==='update') {
        try {state.link={...state.link,...normalizeSettings(input.attributes,state.link,400)};}
        catch(error){const e=new HttpError(422,error.message);e.errors=error.errors;throw e;}
        return {link:state.link};
      }
      return {};
    }
    if(group==='wallpaper')return op==='history'?[{...post,post_url:post.file.url,id:1}]:{};
    if(group==='e621') {
      if(state.unavailable)throw new HttpError(503,'Unavailable');
      if(op==='query')return {suffix:'-gore score:>0'};
      if(op==='select')return input.post_id==='0'?null:post;
      return [post];
    }
    throw Error('Unexpected '+group+'/'+op);
  };
  const router=new Router();addWallpaperRoutes(router);
  const app=createApp({baseUrl:'http://localhost',secretKeyBase:'test-native-wallpapers',backendUrl:'http://localhost'}, {router,backend,proxy:()=>{throw Error('Rails must be unreachable');},logger:{error(){}}});
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const get=(path,options={})=>fetch('http://localhost:'+server.address().port+path,{redirect:'manual',...options});
  return {...state,state,get};
}
test('all wallpaper/search pages and lazy frames render natively without Rails',async t=>{
  const {get}=await fixture(t);
  for(const path of ['/links','/links/new','/links/12','/links/alias','/links/12/edit','/browse','/search','/search/index','/search?q=test','/search/query?q=test','/search/results?q=test','/porn_search/index?link=12','/porn_search/search?link=12','/porn_search/index?message_thread=3','/porn_search/search/kinks_for/12','/links/12/comments','/links/12/comments/new','/users/Alice/history','/users/Alice/sets']) {
    const response=await get(path);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-walltaker-renderer'),'node-native',path);assert.doesNotMatch(await response.text(),/<script>attack\(\)/,path);
  }
  const frame=await get('/links/12/comments',{headers:{'turbo-frame':'link_comments'}});assert.doesNotMatch(await frame.text(),/<!doctype/);
  const full=await get('/porn_search/search?link=12&full_rerender=1');assert.match(full.headers.get('content-type'),/turbo-stream/);assert.match(await full.text(),/target="pornsearch_input"/);
});
test('create/update whitelist settings and preserve submitted validation errors',async t=>{
  const {state,get}=await fixture(t);
  let response=await get('/links',form({'link[terms]':'Changed','link[user_id]':'8','link[post_url]':'https://evil.invalid','link[min_score]':'30'}));
  assert.equal(response.status,303);const call=state.calls.find(c=>c.group==='links'&&c.op==='create');assert.deepEqual(call.input.attributes,{terms:'Changed',min_score:'30'});assert.equal(call.input.actor_id,7);
  response=await get('/links/12',form({_method:'patch','link[theme]':'two tags','link[terms]':'Keep <me>'}));assert.equal(response.status,422);assert.match(await response.text(),/Keep &lt;me&gt;/);assert.equal(state.link.terms,'Changed');
  response=await get('/links/12',form({_method:'patch','link[theme]':'cat',commit:'Update and Test'}));assert.equal(response.headers.get('location'),'/links/12/edit');assert.equal(state.link.theme,'cat');
});
test('wallpaper selection uses only verified e621 files and current owner policy',async t=>{
  const {state,get}=await fixture(t,{anonymous:true});
  const response=await get('/links/alias?link%5Bpost_id%5D=999',form({_method:'patch','link[post_url]':'https://evil.invalid','link[user_id]':'8'}));
  assert.equal(response.status,303);const selected=state.calls.find(c=>c.group==='e621'&&c.op==='select');assert.deepEqual(selected.input.policy,linkPolicy({link:initial,graph:{}}));
  const update=state.calls.find(c=>c.group==='wallpaper'&&c.op==='update').input;assert.equal(update.post_url,post.file.url);assert.equal(update.link_id,12);assert.equal(update.set_by_id,null);assert.equal(update.expected_policy.user_id,7);assert.equal(update.tags,'safe cat rating:s');
  const rejected=await get('/links/12',form({_method:'patch','link[post_id]':'0'}));assert.equal(rejected.status,303);assert.equal(state.calls.filter(c=>c.group==='wallpaper').length,1);
});
test('CSRF, private links, quarantine, bans, master-only and anonymous settings remain protected',async t=>{
  const {state,get}=await fixture(t,{anonymous:true});
  const noCsrf=await get('/links/12',form({authenticity_token:'bad',_method:'patch','link[post_id]':'999'}));assert.equal(noCsrf.status,422);assert.ok(!state.calls.some(c=>c.group==='e621'));
  assert.equal((await get('/links/999')).status,404);
  assert.equal((await get('/links/12',form({_method:'patch','link[terms]':'Forbidden'}))).headers.get('location'),'/login');
  state.ban=true;assert.equal((await get('/links/12',form({_method:'patch','link[post_id]':'999'}))).status,403);
  state.ban=false;state.masterOnly=true;assert.equal((await get('/links/12',form({_method:'patch','link[post_id]':'999'}))).status,403);
  state.masterOnly=false;state.anonymous=false;state.quarantined=true;assert.equal((await get('/links/12',form({_method:'patch','link[post_id]':'999'}))).status,403);
  assert.ok(!state.calls.some(c=>c.group==='wallpaper'));
});
test('eight-step wizard persists each choice, resumes, rejects stale steps and finishes',async t=>{
  const {state,get}=await fixture(t);
  const head=await get('/links/wizard',{method:'HEAD'});assert.equal(head.status,302);assert.equal(state.link.wizard_page,null);
  const foreign=await get('/links/wizard',{headers:{'sec-fetch-site':'cross-site'}});assert.equal(foreign.status,403);
  const start=await get('/links/wizard');assert.equal(start.headers.get('location'),'/links/12/wizard/intro');
  for(const step of wizardSteps) {
    const show=await get('/links/12/wizard/'+step);assert.equal(show.status,200,step);assert.match(await show.text(),/wizard\.[a-f0-9]+\.css/);
    if(step==='orgasmic_conclusion')break;
    const choices={intro:{gooner:'false'},summon:{impatient:'false'},control:{protect:'3'},kinks:{terms:'Wizard terms'},gender:{'blacklisted_parts[]':'cloaca'},surprise:{theme:''},no_fun:{friends_only:'true'}}[step];
    const apply=await get('/links/12/wizard/'+step+'/apply',form(choices));assert.equal(apply.status,303,step);assert.equal(apply.headers.get('location'),'/links/12/wizard/'+wizardSteps[wizardSteps.indexOf(step)+1]);
  }
  assert.equal(state.link.wizard_page,null);assert.equal(state.link.friends_only,true);assert.match(state.link.blacklist,/cloaca/);
  const stale=await get('/links/12/wizard/intro/apply',form({gooner:'false'}));assert.equal(stale.headers.get('location'),'/links/12/wizard/orgasmic_conclusion');
});
test('e621 outages preserve retry forms, and update-and-test saves before reporting outage',async t=>{
  const {state,get}=await fixture(t,{unavailable:true});
  const response=await get('/porn_search/search?link=12&tags=cat',{headers:{'turbo-frame':'pornsearch_results'}});assert.equal(response.status,503);assert.match(await response.text(),/temporarily unavailable/);
  const updated=await get('/links/12',form({_method:'patch','link[terms]':'Saved despite outage',commit:'Update and Test'}));assert.equal(updated.status,303);assert.equal(state.link.terms,'Saved despite outage');
});
test('comments, reactions, abilities, export and embed formats use their own Node services',async t=>{
  const {state,get}=await fixture(t);
  for(const fields of [{_method:'patch','link[response_type]':'horny','link[response_text]':'Great!'}])assert.equal((await get('/links/12',form(fields))).status,303);
  assert.equal((await get('/links/12/comments',form({'comment[content]':'Hello'}))).status,303);
  assert.equal((await get('/links/12/abilities/can_show_videos',form({}))).status,303);
  for(const type of ['form','short','link','wallpaper','default']){
    const response=await get('/links/12/embed?type='+type+'&fit=contain&background=ff0000');assert.equal(response.status,200,type);assert.equal(response.headers.get('x-frame-options'),null);assert.equal(response.headers.get('content-security-policy'),'frame-ancestors *');assert.doesNotMatch(await response.text(),/<header>/);
  }
  const exported=await get('/links/12/walltaker.toml');assert.match(exported.headers.get('content-type'),/application\/toml/);assert.match(await exported.text(),/feed = 12/);
  const result=await get('/links/12.json');assert.equal((await result.json()).user_id,7);
  assert.ok(state.calls.some(c=>c.op==='reaction'));assert.ok(state.calls.some(c=>c.op==='comment-create'));
  state.link.response_type=2;state.link.response_text='Hated';assert.doesNotMatch(await (await get('/links/12')).text(),/class="link--response"/);
  state.link.response_type=1;assert.match(await (await get('/links/12')).text(),/💦 said while cumming/);
});
test('backend transports wallpaper history arrays and nullable e621 results with signed credentials',async()=>{
  const calls=[];
  const call=createBackend({secretKeyBase:'test',baseUrl:'http://backend',fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify(String(url).includes('wallpaper-history')?[]:null),{headers:{'content-type':'application/json'}});}});
  assert.deepEqual(await call('wallpaper','history',{user_id:7,kind:'sent',limit:50}),[]);assert.equal(calls[0].options.method,'GET');assert.match(calls[0].url,/user_id=7/);assert.equal(calls[0].options.body,undefined);
  assert.equal(await call('e621','select',{post_id:1}),null);assert.match(calls[1].options.headers.authorization,/^Bearer [a-f0-9]{64}$/);
});

test('e621 browser pages carry the link owner’s kinks through the full view model',async t=>{
  const {state,get}=await fixture(t);
  state.memberships=[{id:1,user_id:'7',kink_id:'21',is_starred:true},{id:2,user_id:8,kink_id:22}];
  state.kinks=[{id:21,name:'owner_kink',works_on_e621:true},{id:22,name:'other_users_kink',works_on_e621:true}];
  for(const path of ['/porn_search/index?link=12','/porn_search/search/kinks_for/12']) {
    const response=await get(path,{headers:{'turbo-frame':path.includes('kinks_for')?'kink_tools':'pornsearch'}});assert.equal(response.status,200);const body=await response.text();assert.match(body,/id="kink_21" class="kink valid"/);assert.match(body,/owner_kink/);assert.doesNotMatch(body,/other_users_kink/);
    const href=/<a href="([^"]+)" target="_self" data-turbo-frame="pornsearch_results" data-turbo-stream>owner_kink/.exec(body)?.[1];assert.ok(href,'Kink must be a Turbo-interceptable stream link');
    const selected=await get(href.replaceAll('&amp;','&'),{headers:{'turbo-frame':'pornsearch_results',accept:'text/vnd.turbo-stream.html'}});assert.equal(selected.status,200);assert.match(selected.headers.get('content-type'),/turbo-stream/);
    const stream=await selected.text();assert.match(stream,/target="pornsearch_input"/);assert.match(stream,/id="tags"[^>]*value="owner_kink"/);assert.match(stream,/target="pornsearch_results"/);
  }
  assert.ok(state.calls.some(c=>c.group==='e621'&&c.op==='search'&&c.input.tags==='owner_kink'));
});
