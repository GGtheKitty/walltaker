import {html, empty, icon, userPath, safeUrl, timeAgo, button} from './html.js';
import {notification} from './social.js';

export function title(view) {
  const {user, surrender, asset} = view;
  const mascot = ['ki','warren','taylor'].includes(user?.mascot) ? user.mascot : 'ki';
  const pervert = !!user?.pervert;
  const image = mascot === 'ki' ? `Ki${pervert ? 'NSFW' : ''}` : `${mascot === 'warren' ? 'Warren' : 'Taylor'}${pervert ? 'N' : ''}SFW`;
  const label = surrender ? 'Walltaken' : String(user?.id) === '2103' ? 'HEEHAW' : String(user?.id) === '8266' ? 'MOOOO!' : 'Walltaker';
  return html`<turbo-frame id="title"><span class="show-desktop">${label}<div class="mascot ${pervert ? 'perverted' : ''}">
    ${surrender ? html`<img src="${asset('images/marx.png')}" class="mascot__under-cover ${mascot} ${pervert ? 'nsfw' : 'sfw'}" alt="">` : empty}
    <img src="${asset(`images/mascot/${image}.png`)}" alt="A suave little lizard welcoming you to the website." class="mascot" height="190"></div></span>
    <span class="show-mobile">WT <img src="${asset(`images/mascot/${image}.png`)}" alt="A suave little lizard welcoming you to the website." class="mascot" height="100"></span></turbo-frame>`;
}
export function mascotPicker(view) {
  return html`<turbo-frame id="mascot_picker" class="mascot-picker">
    ${button(icon('caret-forward'), '/api/mascot/next', view.csrf, {frame:'title',title:'next mascot'})}
    ${button(view.user?.pervert ? '>_<' : 'OwO', '/api/pervert/toggle', view.csrf, {frame:'title',title:'naughty toggle'})}
    <em>${(view.user?.mascot || 'ki').replace(/^./, c => c.toUpperCase())}</em></turbo-frame>`;
}
export function headerNotifications(view) {
  return html`<turbo-frame id="header_notifications" target="_top"><div class="notifications" data-controller="notifications">
    <button class="notification-bell" data-notifications-target="trigger" data-action="click->notifications#toggle">${icon('notifications')}</button>
    <div class="notifications__popover" data-notifications-target="popover">${view.notifications.length ? html`
      ${view.notifications.map(note => notification(view,note))}
      <div class="accent-block tight-top tight notification-actions">
        ${button('Delete All','/notifications',view.csrf,{method:'delete',className:'accent-block__button danger-button accent-block__button--left'})}
        ${button('See All','/notifications',view.csrf,{method:'get',className:'accent-block__button accent-block__button--right'})}</div>` : html`<div class="notifications__empty">No notifications yet.</div>`}
    </div></div></turbo-frame>`;
}
export function surrenderBanner(view) {
  const surrender = view.ownedSurrender;
  if (view.surrender || !surrender) return empty;
  const controller = view.users.get(String(surrender.controller_user_id));
  if(view.revoked || !(view.graph.surrender_valid || []).map(String).includes(String(surrender.id)))return html`<turbo-frame id="surrender_status" target="_top"><div class="surrender-status accent-block"><div class="surrender-status__status"><div class="surrender-status__circle surrender-status__circle--invalid">${icon('checkmark')}</div><span>${controller?html`<a href="${userPath(controller)}">${controller.username}</a>`:'The other user'} no longer has access to your account.</span></div>${button('Next steps','/surrenders',view.csrf,{method:'get',className:'accent-block__button'})}</div></turbo-frame>`;
  const pending = !!surrender.pending && !surrender.started_at;
  return html`${view.stream(view.globalStream('Surrender',surrender.id))}<turbo-frame id="surrender_status" target="_top"><div class="surrender-status accent-block">
    <div class="surrender-status__status"><div class="surrender-status__circle surrender-status__circle--${pending ? 'pending' : 'active'}">${icon(pending ? 'timer' : 'ban')}</div>
    <span>${pending ? 'Account will be surrendered when' : 'Account is surrendered to'} <a href="${userPath(controller)}">${controller?.username || 'the other user'}</a>${pending ? ' logs in.' : '.'}
    ${surrender.logged_in ? html` Logged in ${surrender.current_page ? 'and viewing ' + surrender.current_page : ''}` : empty}</span></div>
    ${button('Help me!','/surrenders/'+surrender.id,view.csrf,{method:'get',className:'accent-block__button'})}</div></turbo-frame>`;
}
export function layout(view, content, pageTitle) {
  const {user, asset, stream, csrf} = view;
  const mascot = ['ki','warren','taylor'].includes(user?.mascot) ? user.mascot : 'ki';
  const head = {ki:'Ki',warren:'Warren',taylor:'Taylor'}[mascot];
  const controller = view.surrender && view.users.get(String(view.surrender.controller_user_id));
  return html`<!doctype html><html lang="en" class="${user ? 'force-' + (['light','dark'].includes(user.colour_preference) ? user.colour_preference : ({0:'auto',1:'light',2:'dark'}[user.colour_preference] || 'auto')) : ''} current-mascot-${mascot} ${user?.pervert ? 'currently-perverted' : ''}">
  <head><meta charset="utf-8"><title>${pageTitle}</title>
    ${view.profileDocument?html`<base target="_top"><meta name="robots" content="noindex, nofollow">`:empty}<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1"><meta name="rating" content="adult">
    <meta property="og:type" content="website"><meta property="og:title" content="(18+) ${pageTitle}"><meta property="og:description" content="Take control of your friends wallpapers">
    <meta property="og:url" content="${view.originalUrl}"><meta property="og:image" content="${view.baseUrl}${asset('images/mascot/KiHead.png')}"><meta name="theme-color" content="#ffb300">
    <meta name="walltaker-base-url" content="${view.baseUrl}"><meta name="csrf-param" content="authenticity_token"><meta name="csrf-token" content="${csrf}"><meta name="action-cable-url" content="/cable">
    <link rel="icon" href="${asset(`images/mascot/${head}Head.png`)}"><link rel="stylesheet" href="${asset('application.css')}" data-turbo-track="reload">
    ${view.headContent || empty}
    ${(view.stylesheets || []).map(name=>html`<link rel="stylesheet" href="${asset(name)}" data-turbo-track="dynamic">`)}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:ital,wght@0,100..700;1,100..700&family=Lacquer&family=Mrs+Saint+Delafield&family=Vibur&display=swap" rel="stylesheet">
    <script type="module" src="${asset('application.js')}" data-turbo-track="reload"></script>
  </head><body ${view.profileDocument?html`data-turbo="false"`:empty}><div data-controller="age"><dialog class="modal" data-age-target="modal"><h4>This is an adult website</h4><p>Minors cannot use this website. Are you over the age of 18?</p>
    <div class="modal__buttons"><button class="no-underline primary" data-age-target="cancel" data-action="click->age#cancel">No</button><button class="no-underline secondary" data-action="click->age#dismiss">I am over the age of 18.</button></div></dialog></div>
    <header><div class="header__age-warning"><span id="age-warning__icon">🔞</span> This is an app for adults over the age of 18 only.</div>
      ${surrenderBanner(view)}<div class="header__inner"><h1><a href="/">${title(view)}</a></h1><div class="user-tools">
      ${user ? html`<a class="username" href="${userPath(user)}">${user.username}</a>` : empty}
      <span class="user-tools__browse"><a href="/browse">${icon('sparkles')} Browse</a>${controller ? button('Return to '+controller.username,'/surrenders/return_to_controller',csrf,{className:'return-from-surrender',turbo:false}) : empty}</span>
      ${user ? html`<a href="/links">Links</a><a href="/friendships" class="${view.friendRequests ? 'pinged' : ''}">Friends</a><a href="/logout" data-turbo="false" data-turbo-prefetch="false">Logout</a>
        <div class="user-tools__nested"><a href="/messages">${icon('chatbubbles','dont-hide chat')}</a>${stream('header_notifications_'+user.id)}${headerNotifications(view)}</div>` : html`<a href="/signup">Sign Up</a><a href="/login">Login</a>`}
      </div></div></header>
    ${stream('chyron')}<turbo-frame id="chyron"></turbo-frame>
    ${stream((user?.username || 'anon')+'-flashes')}<turbo-frame id="flashes" class="flashes">${Object.entries(view.flash).map(([type,message]) => html`<turbo-frame id="flash-${type}"><div class="flash flash--${type === 'notice' ? 'success' : 'danger'}">${message}</div></turbo-frame>`)}</turbo-frame>
    ${user ? html`<div class="hang"><div data-controller="discord-invite"><dialog class="modal" data-discord-invite-target="modal"><h4>Just a note!</h4>
      <p>To keep things organized and peaceful, we ask that you verify your walltaker account in the discord when you join. It's really quick, doesn't require anything other than your username and a link ID from your account! <strong>We also kick discord accounts newer than a week old or those without profile pictures!</strong> Try again after that period if you can't join.</p>
      <div class="modal__buttons"><a href="https://discord.gg/s4z9GfwuKw" class="no-underline secondary" target="_blank" rel="noopener">Let me join!</a></div></dialog>${icon('logo-discord','big')} Join our Discord</div>${mascotPicker(view)}</div>` : empty}
    <main ${view.mainClass?html`class="${view.mainClass}"`:empty}>${content}</main><footer><p>Want more horny debauchery? Try <a href="https://joi.how">joi.how</a>.<br>Horny lizards Warren, Taylor, and Ki conceived of and drawn by
      <a href="https://www.furaffinity.net/user/cherryzbun/" target="_blank" rel="noopener">CherryzBun</a><br><a href="/help">Need help with Walltaker?</a> &nbsp; <a href="/help/faq">FAQs</a> &nbsp; <a href="/help/client_guide" target="_top">Client Building Guide</a></p>
      <small>© joi.how 2024 / Commit <a href="${safeUrl(view.env.COMMIT_LINK,'https://github.com/GGtheKitty/walltaker/tree/node')}">#${view.env.COMMIT_HASH?.slice(0,9) || ''} ${view.env.RELEASE_CREATED_AT ? timeAgo(view.env.RELEASE_CREATED_AT)+' ago' : ''}</a>
      ${user?.admin ? html`<a href="/blazer">${icon('stats-chart')} Stats</a><a href="/mod_tools">${icon('nuclear')} Mod Tools</a>` : empty}
      ${user && (user.admin || ['PornLizardWarren','PornLizardKi','PornLizardTaylor'].includes(user.username)) ? html`<a href="/lizard_tools">${icon('sparkles')} Lizard Tools</a>` : empty}</small></footer>
    <script type="module" src="https://unpkg.com/ionicons@5.5.2/dist/ionicons/ionicons.esm.js"></script><script nomodule src="https://unpkg.com/ionicons@5.5.2/dist/ionicons/ionicons.js"></script>
  </body></html>`;
}
