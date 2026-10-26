import {createHmac, pbkdf2Sync} from 'node:crypto';
import {html} from './html.js';
import {layout, title, mascotPicker} from './layout.js';
import {home} from './home.js';
import {login} from './login.js';
import {wallpaperPages,e621Input,e621Results} from './wallpaper.js';
import {wizard} from './wizard.js';
import {profilePages} from './profiles.js';
import {accountPages} from './accounts.js';
import {socialPages} from './social.js';
import {trackerPages,trackerLayout} from './tracker.js';
import {moderationPages} from './moderation.js';
import {helpPages} from './help.js';
import {blazerPages,blazerLayout} from './blazer.js';

export function createTemplates(secretKeyBase) {
  const key = pbkdf2Sync(secretKeyBase,'turbo/signed_stream_verifier_key',1000,64,'sha256');
  function stream(name) {
    const payload = Buffer.from(JSON.stringify(name)).toString('base64');
    const signed = payload + '--' + createHmac('sha256',key).update(payload).digest('hex');
    return html`<turbo-cable-stream-source channel="Turbo::StreamsChannel" signed-stream-name="${signed}"></turbo-cable-stream-source>`;
  }
  return (page, view) => {
    view = {...view, stream, globalStream:(type,id) => Buffer.from(`gid://walltaker/${type}/${id}`).toString('base64url')};
    if(blazerPages[page]){const content=blazerPages[page](view);return String(view.fragment?content:blazerLayout(view,content));}
    if(helpPages[page])return String(layout(view,helpPages[page](view),'Walltaker'));
    if(moderationPages[page]){const content=moderationPages[page](view);return String(view.frameRequest||page==='mod-user-update'?content:layout(view,content,'Walltaker'));}
    if(trackerPages[page]){
      const content=trackerPages[page](view);
      if(view.frameRequest)return String(content);
      return String(page.startsWith('tracker-entr')?trackerLayout(view,content):layout(view,content,'Walltaker'));
    }
    if(socialPages[page]){
      const content=socialPages[page](view);
      if(view.frameRequest||['social-message-history','social-thread-controls'].includes(page))return String(content);
      return String(layout(view,content,({'social-friends':'Your Walltaker Friends','social-friend-new':'New Friendship','social-friend-show':'Friendship'}[page] || 'Walltaker')));
    }
    if(accountPages[page])return String(layout(view,accountPages[page](view),({'account-signup':'Sign Up for Walltaker','account-settings':view.targetUser?.username+' walltaker settings'}[page] || 'Walltaker')));
    if (profilePages[page]) {
      const content=profilePages[page](view);
      if(page==='profile-shell'||view.frameRequest||page==='profile-sharing'||page==='profile-interest-update'||page==='profile-interest-status'||page==='profile-interest-error')return String(content);
      return String(layout(view,content,view.targetUser?'Walltaker '+view.targetUser.username:page.startsWith('profile-community')?'Browse by Kink':'Profile Styles'));
    }
    if (page === 'mascot') return String(html`<turbo-stream action="replace" target="title"><template>${title(view)}</template></turbo-stream><turbo-stream action="replace" target="mascot_picker"><template>${mascotPicker(view)}</template></turbo-stream>`);
    if (page === 'wallpaper-wizard') return String(layout({...view,stylesheets:['wizard.css']},wizard(view),'Link Wizard'));
    if (wallpaperPages[page]) {
      const content=wallpaperPages[page](view);
      if(page==='wallpaper-embed')return String(content);
      if(page==='wallpaper-e621-results' && view.fullRerender) return String(html`<turbo-stream action="replace" target="pornsearch_input"><template>${e621Input(view)}</template></turbo-stream><turbo-stream action="replace" target="pornsearch_results"><template>${content}</template></turbo-stream>`);
      if(view.frameRequest)return String(content);
      return String(layout(view,content,page==='wallpaper-show'?'Walltaker #'+view.link.id+' for '+view.users.get(String(view.link.user_id))?.username:({'wallpaper-list':'Your Walltaker Links','wallpaper-browse':'Browse Walltaker Links','wallpaper-search':'Search Walltaker Links','wallpaper-form':view.creating?'New Walltaker Link':'Edit Link '+view.link?.id}[page] || 'Walltaker')));
    }
    if (!['home','login'].includes(page)) throw new Error('Unknown native template');
    const content = page === 'home' ? home(view) : login(view);
    return String(layout(view,content,page === 'login' ? 'Login to Walltaker' : view.user ? 'Walltaker Dashboard' : 'Walltaker'));
  };
}
