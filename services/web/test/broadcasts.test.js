import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import http from 'node:http';
import {createBroadcastRenderer} from '../src/broadcasts.js';
import {createApp} from '../src/app.js';
const config={baseUrl:'https://example.test',secretKeyBase:'broadcast-tests',backendUrl:'http://localhost'};
const graph={users:[{id:1,username:'Alice'},{id:2,username:'Bob',viewing_link_id:4}],links:[{id:4,user_id:1,set_by_id:2,never_expires:true,blacklist:'',terms:'<script>unsafe</script>',post_thumbnail_url:'https://static1.e621.net/data/ab/cd/01234567890123456789012345678901.jpg'}],past_links:[{id:5,link_id:4,user_id:1,created_at:new Date().toISOString(),post_thumbnail_url:'https://example.test/image.png'}],viewer_users:[{id:2,username:'Bob',viewing_link_id:4}],comments:[{id:8,user_id:2,content:'<script>comment</script>'}],messages:[{id:9,from_user_id:2,content:'<script>message</script>',created_at:new Date().toISOString()}],notifications:[{id:10,user_id:1,text:'<script>notification</script>',created_at:new Date().toISOString()}],surrenders:[{id:11,user_id:1,controller_user_id:2}],revoked_surrenders:['11']};
test('every broadcast uses native fragments, escaped content and current native assets without an ERB manifest',async()=>{
  const render=createBroadcastRenderer(config);
  for(const [template,locals,expected] of [['links/link',{link:4},'id="link_4"'],['links/details',{link:4},'id="link_details_4"'],['links/embed_image',{link:4},'/e621-media?token='],['links/embed_text',{link:4},'Set by: Bob'],['links/viewing_users',{link:4},'Bob'],['comments/comment',{comment:8},'id="comment_8"'],['message_thread/single_message',{message:9},'id="message_9"'],['application/notifications',{notifications:[10]},'id="header_notifications"'],['layouts/surrender',{surrender:11,revoked:true},'no longer has access'],['dashboard/recent_posts',{recent_posts:[5]},'id="recent_posts"'],['dashboard/users_viewing_links',{users_viewing_links:[2]},"Who's Browsing"],['application/chyron',{message:'<script>news</script>'},'WTN'],['news_room/desk',{news_entry:{message:'hello',lizard_image_url:'mascot/news/TaylorDeskOpen.png'}},'/node-assets/images/mascot/news/'],['news_room/backdrop',{news_entry:{image_url:'https://example.test/image.png'}},'news-room__feature']]){
    const output=await render({template,graph,locals});assert.ok(output.includes(expected),template);assert.doesNotMatch(output,/<script>|<%|\/assets\//,template);
    if(template==='links/link')assert.equal(output.match(/id="link_4"/g).length,1);
  }
  await assert.rejects(render({template:'arbitrary-file',graph}),{status:404});
});
test('broadcast HTTP endpoint rejects public callers and never resolves a browser session',async t=>{
  const server=http.createServer(createApp(config,{backend:()=>assert.fail('Broadcast attempted a browser/backend call'),logger:{error(){}}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const path='http://localhost:'+server.address().port+'/_internal/broadcasts/render';
  assert.equal((await fetch(path,{method:'POST',body:'{}'})).status,403);
  const authorization='Bearer '+createHmac('sha256',config.secretKeyBase).update('walltaker:native-broadcasts:v1').digest('hex');
  const response=await fetch(path,{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({template:'comments/comment',graph,locals:{comment:8}})});
  assert.equal(response.status,200);assert.match(await response.text(),/&lt;script&gt;comment&lt;\/script&gt;/);assert.equal(response.headers.get('x-walltaker-renderer'),'node-native');
  assert.equal((await fetch(path,{headers:{authorization}})).status,405);
  assert.equal((await fetch(path+'?other=true',{headers:{authorization}})).status,404);
});
