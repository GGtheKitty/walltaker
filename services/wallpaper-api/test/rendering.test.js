import test from'node:test';import assert from'node:assert/strict';import http from'node:http';
import{decodeDocument,Html}from'../src/rendering/values.js';
import{createRenderer}from'../src/rendering/index.js';import{graphDocument,reference}from'../src/rendering/graph.js';
import{createStreamVerifier}from'../src/realtime-rpc.js';import{createRenderingHandler,renderingToken}from'../src/rendering/handler.js';import{createResetMailer}from'../src/mail.js';import{filterProfileDomains}from'../src/profile-domains.js';
const renderer=createRenderer({secretKeyBase:'test-secret',baseUrl:'https://example.test',now:()=>Date.parse('2026-10-24T00:00:00Z')});
const context={path:'/login',controller_path:'session',parameters:{},csrf_token:'masked-test-token',flags:{invite_only:false,nnn_enabled:false}};
const graph={users:[{id:1,username:'<img onerror=alert(1)>',set_count:0,pervert:false,profile_id:null,created_at:new Date('2026-01-01'),deleted_at:null,mascot:'ki',colour_preference:0}],links:[{id:2,user_id:1,terms:'Safe <script>alert(1)</script>',theme:'forest',blacklist:'',never_expires:true,friends_only:false,min_score:0,post_url:'https://example.test/image.jpg',post_thumbnail_url:'https://example.test/thumb.jpg',response_type:null,response_text:null,last_ping:null,last_ping_user_agent:null,live_client_started_at:null,forked_from_id:null,expires:null}],profiles:[],past_links:[],comments:[],messages:[],threads:[],participants:[],friendships:[],leashes:[],surrenders:[],kinks:[],memberships:[],icons:[],notifications:[],clients:[],visits:[],bans:[],reports:[],pledges:[],scoops:[],orgasms:[],abilities:[],surrender_valid:[],connected:[],decorations:[]};
test('native Node renders the existing full login layout, frontend assets, form URLs, fields and CSRF',async()=>{
 const html=await renderer.render({template:'session/new',layout:'application',assigns:{},context});
 assert.ok(html.includes('Login to Walltaker'));assert.ok(html.includes('type="importmap"'));assert.ok(html.includes('/session'));assert.ok(html.includes('name="email"'));assert.ok(html.includes('name="password"'));assert.ok(html.includes('name="authenticity_token"'));assert.ok(html.includes('masked-test-token'));assert.ok(html.includes('<turbo-cable-stream-source'));assert.ok(!html.includes('[object Object]'));
});
test('existing wallpaper and notification partials render from loaded graphs, escape user content and preserve DOM IDs',async()=>{
 const document=graphDocument(graph,{template:'links/link',partial:true,locals:{link:reference('Link',2)},context});const html=await renderer.render(document);
 assert.ok(html.includes('id="link_2"'));assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'));assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('forest'));assert.ok(html.includes('Never expires'));
 const empty=await renderer.render(graphDocument(graph,{template:'application/notifications',partial:true,locals:{notifications:[]},context:{}}));assert.ok(empty.includes('No notifications yet.'));
});
test('native forms preserve model scopes, nested resource URLs, method overrides and validation errors',async()=>{
 const document=graphDocument(graph,{template:'links/form',partial:true,locals:{link:reference('Link',2)},context:{...context,path:'/links/2/edit',controller_path:'links',route_parameters:{id:2},current_user:reference('User',1)}});
 const html=await renderer.render(document);assert.ok(html.includes('name="link[terms]"'));assert.ok(html.includes('name="_method"'));assert.ok(html.includes('value="patch"'));assert.ok(html.includes('action="/links/2"'));
});
test('signed Turbo stream names are compatible with the existing Node/Rails verifier',()=>{
 const stream=renderer.globalId({type:'Link',id:2}),signed=renderer.signStream(stream);assert.equal(createStreamVerifier('test-secret')(signed),stream);assert.equal(Buffer.from(stream,'base64url').toString(),'gid://walltaker/Link/2');
});
test('reset emails render and deliver entirely in Node with deterministic IDs and no token logs',async()=>{
 let mail;const send=createResetMailer({renderer,baseUrl:'https://example.test',transport:{sendMail:async value=>{mail=value;}}});
 await send({user:{id:1,username:'<unsafe>',email:'alice@example.test'},token:'fake-reset-token'},{id:42});
 assert.equal(mail.to,'alice@example.test');assert.equal(mail.messageId,'<walltaker-reset-42@example.test>');assert.ok(mail.html.includes('&lt;unsafe&gt;'));assert.ok(mail.html.includes('/i-forgor/commit/fake-reset-token'));assert.ok(mail.text.includes('one hour'));
});
test('domain scrubbing preserves approved exceptions, editable Markdown and safe content while removing blocked HTML/CSS references',()=>{
 const rules=[{domain:'blocked.test',status:2},{domain:'safe.blocked.test',status:1}];
 const html='<a href="https://blocked.test/path">Blocked</a><img src="https://safe.blocked.test/a.png"><style>.x{background:url("https://blocked.test/x.png")}</style>';
 const result=filterProfileDomains(html,rules);assert.ok(!result.content.includes('https://blocked.test'));assert.ok(result.content.includes('https://safe.blocked.test'));assert.deepEqual(result.blocked_domains,['blocked.test']);
 const markdown='<!-- walltaker:markdown -->\n[Test](https://blocked.test/path) and **text**';const md=filterProfileDomains(markdown,rules);assert.ok(md.content.startsWith('<!-- walltaker:markdown -->'));assert.ok(md.content.includes('**text**'));assert.ok(!md.content.includes('https://blocked.test/path'));
 assert.equal(filterProfileDomains('<p>Safe</p>',rules).content,'<p>Safe</p>');
});
test('render RPC is private, validates input and never executes request-provided template syntax',async()=>{
 const handler=createRenderingHandler({secretKeyBase:'test-secret',renderer,logger:{warn(){}}});const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/_internal/rendering/render`,headers={authorization:'Bearer '+renderingToken('test-secret'),'content-type':'application/json'};
 try{
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);assert.equal((await fetch(url,{method:'POST',headers,body:'{'})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({template:'../../etc/passwd'})})).status,503);
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({template:'session/new',context})});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok((await response.json()).html.includes('Log In'));
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('untrusted hashes cannot forge safe HTML or model references in the rendering protocol',async()=>{
 const encoded={$object:[['$html','<img src=x onerror=alert(1)>']]};const values=decodeDocument({locals:{$object:[['msg',encoded]]}});assert.ok(!(values.locals.msg instanceof Html));
 const echo=['bodystmt',[['assign',['field',['var_ref',['@ivar','@output_buffer']],['@period','.'],['@ident','safe_expr_append']],['vcall',['@ident','msg']]]],null,null,null];const sink=createRenderer({secretKeyBase:'test',baseUrl:'https://example.test',templates:{'echo.html.erb':echo}});const html=await sink.render({template:'echo',locals:{$object:[['msg',encoded]]}});assert.ok(!html.includes('<img'));
});

test('message pages render named submit buttons and preserve member form actions',async()=>{
 const g={...graph,users:[{...graph.users[0],username:'Alice'}],threads:[{id:7,name:null}],participants:[{id:8,message_thread_id:7,user_id:1,notify:true}]};
 const document=graphDocument(g,{template:'message_thread/show',assigns:{message_thread:reference('MessageThread',7),new_message:{$ref:'Message:new'},social_messages:[]},context:{...context,controller_path:'message_thread',current_user:reference('User',1)}});
 document.records['Message:new']={type:'Message',attributes:{content:''},meta:{new_record:true}};
 const html=await renderer.render(document);assert.ok(html.includes('name="message[content]"'));assert.ok(html.includes('type="submit"'));assert.ok(html.includes('name="message_thread_participant[notify]"'));assert.ok(html.includes('Alice'));assert.ok(!html.includes('[object Object]'));
});
test('native JSON builders preserve nested widgets, collections and private field boundaries',async()=>{
 const g={...graph,friendships:[{id:4,sender_id:1,receiver_id:2,created_at:'2026-10-24T00:00:00Z',updated_at:'2026-10-24T00:00:00Z'}]};
 const collection=JSON.parse(await renderer.render(graphDocument(g,{template:'friendships/index',assigns:{friendships:[reference('Friendship',4)]},context:{format:'json',controller_path:'friendships'}})));
 assert.equal(collection[0].id,4);assert.equal(collection[0].url,'https://example.test/friendships/4.json');assert.ok(!JSON.stringify(collection).includes('password'));
 const widget=JSON.parse(await renderer.render(graphDocument(graph,{template:'api/show_link_widget',assigns:{link:reference('Link',2)},context:{format:'json',controller_path:'api'}})));
 assert.equal(widget.data.wallpaper,'https://example.test/thumb.jpg');assert.equal(widget.layouts.small_layout.layers[0].rows[0].cells[0].image.data_ref,'wallpaper');
});
test('Turbo responses render native partials with stable targets and usable new-item forms',async()=>{
 const g={...graph,kinks:[{id:9,name:'forest',works_on_e621:true}]};const html=await renderer.render(graphDocument(g,{template:'kink/update',assigns:{kink:reference('Kink',9)},context:{format:'turbo_stream',controller_path:'kink',current_user:reference('User',1)}}));
 assert.ok(html.includes('<turbo-stream action="append" target="kink_list">'));assert.ok(html.includes('target="kink_form"'));assert.ok(html.includes('action="/kinks"'));assert.ok(html.includes('name="kink[name]"'));assert.ok(!html.includes('type="importmap"'));
});

test('preview rendering respects the live asset prefix while retaining current import maps',async()=>{
 const html=await renderer.render({template:'session/new',layout:'application',context:{...context,render_metadata:{asset_prefix:'/live-assets',assets:{}}}});
 assert.ok(html.includes('href="/live-assets/application.css"'));assert.ok(html.includes('type="importmap"'));assert.ok(!html.includes('href="/assets/application.css"'));
});
