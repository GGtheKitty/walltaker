import {createHmac,timingSafeEqual} from 'node:crypto';
import {readForm} from './forms.js';
import {HttpError} from './errors.js';
import {nativeAssets,assetUrl} from './native-assets.js';
import {createTokenIssuer} from '../../e621-media/src/token.js';
import {html,empty,userPath,safeUrl} from './templates/html.js';
import {card,details,comment,viewingUsers} from './templates/wallpaper.js';
import {message,newsDesk,newsBackdrop} from './templates/social.js';
import {headerNotifications,surrenderBanner} from './templates/layout.js';

// Broadcasts share the actual browser templates. No generated view manifests,
// template-language evaluator, database connection or browser identity is used.
export function createBroadcastRenderer(config){
  const media=createTokenIssuer(config.secretKeyBase);
  return async({template,graph={},locals={}})=>{
    const assets=await nativeAssets(config),users=new Map((graph.users || []).map(u=>[String(u.id),u]));
    const view={user:null,surrender:null,graph,users,csrf:'',flash:{},baseUrl:config.baseUrl,
      stream:()=>empty,globalStream:()=>'',asset:name=>assetUrl(assets.assets,name),media:source=>{const token=media(source);return token?'/e621-media?token='+encodeURIComponent(token):safeUrl(source);}};
    const find=(key,id)=>{const row=(graph[key] || []).find(r=>String(r.id)===String(id));if(!row)throw new HttpError(422,'Missing broadcast record.');return row;};
    let content;
    switch(template){
      case 'links/link':content=card(view,find('links',locals.link));break;
      case 'links/details':content=details(view,find('links',locals.link));break;
      case 'links/embed_image':{const l=find('links',locals.link);content=l.post_thumbnail_url?html`<img src="${view.media(l.post_thumbnail_url)}" alt="Current wallpaper">`:html`No image set! :(`;break;}
      case 'links/embed_text':{const l=find('links',locals.link),past=(graph.past_links || []).filter(p=>String(p.link_id)===String(l.id)).sort((a,b)=>Number(b.id)-Number(a.id))[0];content=html`Set by: ${users.get(String(l.set_by_id))?.username || 'anon'} ${past?html`<time datetime="${past.created_at}">${past.created_at}</time>`:empty}`;break;}
      case 'links/viewing_users':content=viewingUsers(view,{id:locals.link});break;
      case 'comments/comment':content=comment(view,find('comments',locals.comment));break;
      case 'message_thread/single_message':content=message(view,find('messages',locals.message));break;
      case 'application/notifications':content=headerNotifications({...view,notifications:(locals.notifications || []).map(id=>find('notifications',id))});break;
      case 'layouts/surrender':{const s=find('surrenders',locals.surrender);content=surrenderBanner({...view,ownedSurrender:s,revoked:locals.revoked});break;}
      case 'dashboard/recent_posts':content=html`<turbo-frame id="recent_posts" target="_top">${(locals.recent_posts || []).map(id=>{const p=find('past_links',id);return html`<a href="${userPath(users.get(String(p.user_id)))}"><img src="${view.media(p.post_thumbnail_url)}" alt="Recent wallpaper"></a>`;})}</turbo-frame>`;break;
      case 'dashboard/users_viewing_links':content=html`<turbo-frame id="users_viewing_links" target="_top"><strong>Who's Browsing</strong><div class="dashboard__users-viewing-links">${(locals.users_viewing_links || []).map(id=>find('users',id)).filter(u=>!u.deleted_at&&u.viewing_link_id).map(u=>html`<a href="/links/${u.viewing_link_id}">${u.username}</a>`)}</div></turbo-frame>`;break;
      case 'application/chyron':content=html`<a href="/news_room/index" target="_top"><div class="chyron"><div class="WTN-logo">WTN</div><div>${locals.message}</div></div></a>`;break;
      case 'news_room/desk':content=newsDesk(view,locals.news_entry || {});break;
      case 'news_room/backdrop':content=newsBackdrop(view,locals.news_entry || {});break;
      default:throw new HttpError(404,'Unknown broadcast fragment.');
    }
    return String(content);
  };
}
export function createBroadcastHandler(config){
  const expected=Buffer.from('Bearer '+createHmac('sha256',config.secretKeyBase).update('walltaker:native-broadcasts:v1').digest('hex')),render=createBroadcastRenderer(config);
  return async(req,res)=>{
    const token=Buffer.from(req.headers.authorization || '');
    if(token.length!==expected.length||!timingSafeEqual(token,expected))throw new HttpError(403,'Forbidden.');
    if(req.method!=='POST')throw new HttpError(405,'POST required.');
    const input=await readForm(req,{limit:8*1024*1024,complexity:200000});
    const output=await render(input);res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-walltaker-renderer':'node-native'});res.end(output);
  };
}
