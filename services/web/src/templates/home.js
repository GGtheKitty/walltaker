import {html, empty, icon, userPath, safeUrl, timeAgo, plural, button, json} from './html.js';

function clientsTable(clients) {
  return html`<table class="wallpaper-clients"><thead><tr><th>Client</th><th>Platform</th></tr></thead><tbody>${clients.map(client => html`<tr><td>
    <a href="${safeUrl(client.url)}" target="_blank" rel="noopener" class="${client.deprecated ? 'subdued' : ''}">${client.name}</a>
    <strong>${client.deprecated ? '(Deprecated)' : ''}</strong></td><td>${client.platform}</td></tr>`)}</tbody></table>`;
}
function pledge(view) {
  const status = view.tracker;
  if (!status?.nnn_enabled) return empty;
  const path = userPath(view.user)+'/nut_pledge';
  if (!status.current) return html`<div class="dashboard-header"><a href="${path}/new">Sign the NNN Pledge!</a><small>&nbsp;or don't, I'm not your incest-positive mom.</small></div>`;
  const current = status.current;
  const mascot = (view.user.mascot || 'ki').replace(/^./,c=>c.toUpperCase());
  const failed = current.failed_on && new Date(current.failed_on);
  const past = view.pastLinks.get(String(current.past_link_id));
  return html`<turbo-frame id="pledge"><div class="accent-block spaced flat-bottom">${failed ? html`<div class="nut_pledge_failed">${icon('water')} Failed NNN${failed.getUTCFullYear()} on day ${failed.getUTCDate()}
    ${past ? html`<div class="preview"><img src="${view.media(past.post_thumbnail_url || past.post_url)}" alt="Pledge failure wallpaper"></div>` : empty}</div>` : html`
    <div class="accent-block__charm">No Nut November ${current.year}</div><p>I hereby pledge, as ${mascot} as my witness, that I will not cum, squirt, ejaculate, orgasm, or otherwise experience any derivative thereof a pelvic sneeze, during the entire month of November, so help me ${mascot}.</p>
    <p><strong>Signed ${new Date(current.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'})}.</strong></p>
    <div class="center">${button('I Failed',path,view.csrf,{method:'put',frame:'pledge',className:'danger-button',confirm:'Are you sure you want to mark your NNN pledge as failed?'})}</div>`}
    <p><a href="${path}/history" data-turbo-frame="_top">Tracker History</a></p></div></turbo-frame>`;
}
function scoop(view, scoop) {
  if (!scoop) return empty;
  const user = view.users.get(String(scoop.user_id));
  return html`<div class="accent-block tight-top"><div class="accent-block__charm">${icon('newspaper')}
    <a href="${userPath(user)}" data-controller="user-reference">${user?.username || 'Deleted account'}</a> ${timeAgo(scoop.created_at)} ago</div>
    <p>${scoop.details}</p><hr><p>${scoop.was_shown ? html`<strong>Aired ${timeAgo(scoop.updated_at)} ago.</strong>` : 'Awaiting a newsroom slot...'}</p>
    ${String(view.user.id) === String(scoop.user_id) ? html`${button('Stop the presses!','/scoops/'+scoop.id,view.csrf,{method:'delete',disabled:scoop.was_shown,className:'accent-block__button danger-button accent-block__button--left'})}
      ${button('Edit','/scoops/'+scoop.id+'/edit',view.csrf,{method:'get',disabled:scoop.was_shown,className:'accent-block__button accent-block__button--right'})}` : empty}</div>`;
}
function dashboard(view) {
  const data = view.dashboard;
  // Keep headings and data in one row group, as in the original dashboard:
  // its CSS makes tbody a table, so a separate thead sizes columns independently.
  return html`${data.your_total === 0 ? html`<div class="accent-block spaced"><div class="accent-block__charm">${icon('information-circle')} Need help?</div>I made a getting started guide on the <a href="/help">help page!</a></div>` : empty}
    ${pledge(view)}<div class="dashboard"><div class="dashboard__recent"><div class="dashboard__recent__content">
      ${view.stream('dashboard_recent_posts')}<turbo-frame id="recent_posts" target="_top">${(data.recent_posts || []).map(post => {
        const owner = view.users.get(String(post.user_id));
        return html`<a href="${userPath(owner)}"><img src="${view.media(post.post_thumbnail_url)}" alt="Recent wallpaper for ${owner?.username || 'a user'}"></a>`;
      })}</turbo-frame></div></div>
    <div class="dashboard__online"><h2>Online Now</h2><a href="/browse"><div class="dashboard__online__content">${data.online}</div></a>
      <div class="dashboard__users-viewing-links">${view.stream('dashboard_users_viewing_links')}<turbo-frame id="users_viewing_links" target="_top"><strong>Who's Browsing</strong>
        <div class="dashboard__users-viewing-links">${(data.viewers || []).filter(user => !user.deleted_at && user.viewing_link_id).map(user => html`<a href="/links/${user.viewing_link_id}">${user.username}</a>`)}</div></turbo-frame></div></div>
    <div class="dashboard__updates"><h2>Changes</h2><div class="chart"><div id="dashboard-changes-chart" style="height:60px;width:100%" data-controller="dashboard-chart" data-dashboard-chart-data-value="${json((data.days || []).map(row => [row.day,row.count]))}">Loading...</div></div>
      <div class="dashboard__updates__content"><table><tbody><tr><th scope="col">User</th><th scope="col">Wallpapers Changes Today</th></tr>${(data.today || []).map(row => html`<tr><td><a href="${userPath(row)}" data-controller="user-reference">${row.username}</a></td><td>${plural(row.total,'wallpaper')}</td></tr>`)}</tbody></table></div></div>
    <div class="news-room__panel"><h2><span><span class="WTN-logo">WTN</span> News Room</span>${button('My Scoops','/scoops',view.csrf,{method:'get'})}</h2>
      ${scoop(view,data.recent_scoop)}<a href="/news_room/index" class="button-like centred">Tune in</a></div>
    <div class="dashboard__total-updates"><h2>All-time</h2><div class="dashboard__total-updates__content"><em>${data.total}</em>wallpapers</div></div>
    <div class="dashboard__your-total-changes"><h2>Your Total</h2><div class="accent-block tight-top"><div class="accent-block__charm">${icon('eye-off')} Only you see this</div><div class="dashboard__total-updates__content"><em>${data.your_total}</em>wallpapers</div></div></div>
    <div class="dashboard__newest-user"><h2>Newest User</h2><div class="dashboard__newest-user__content">${data.newest_user ? html`<a href="${userPath(data.newest_user)}">${data.newest_user.username}</a>` : empty}</div></div>
    <div class="dashboard__leaderboard"><turbo-frame id="leaderboard"><h2 class="one-line">${icon('flame','big')} Leaderboard<small>The top 10 users who have set the most number of wallpapers for others.</small></h2>
      <ol>${view.leaderboard.map(user => html`<li><a href="${userPath(user)}" target="_top" data-controller="user-reference">${user.username}</a><span>${plural(user.set_count,'change')}</span></li>`)}</ol></turbo-frame></div></div>`;
}
export function home(view) {
  return html`${view.user ? dashboard(view) : empty}
    <h2>What is it?</h2><p>First off: <strong>Walltaker is an app built by adults, for adults. You must be over the age of 18 to use it.</strong>
      Walltaker is inspired by the <a href="https://www.wallclaimer.com/">WallClaimer</a> app, which allows you to set the wallpaper of your friend's phones. This however leads to some weird cases where people post stuff that'd be on your metaphorical blacklist. With that in mind, I wanted it to be restricted to <a href="https://e621.net">e621.net</a> results, with an enforced blacklist. This keeps you in control, but not <em>too much</em> control.</p>
    <h2 id="what-do-i-need">What do I need?</h2><p>Walltaker requires you to <strong>make an account on the website (here!) first.</strong> Once you have an account, you can generate links to send to friends/enemies, which will enqueue new wallpapers for your account. When you want to start seeing these new wallpapers, <strong>then you can download the companion apps listed below</strong> which is able to listen to wallpaper changes to any account. Enter your username, and then go about your day!</p>
    <img src="${view.asset('images/wt.svg')}" class="explainer_graphic" alt="A flow chart, showing links pushing updates to devices running walltaker clients." width="100%">
    <h2 id="companion-apps">Clients</h2>${clientsTable((view.dashboard.clients || []).filter(client => client.section === 'clients'))}
    Please try using clients that are not deprecated. For devs, follow our client guide for updating deprecated clients.
    <h2 id="extra-apps">Companion/Explorer Apps</h2><p>Extra tools that tie into Walltaker's site. These should help to integrate walltaker better or make the user experience cleaner.</p>
    ${clientsTable((view.dashboard.clients || []).filter(client => client.section === 'companion_apps'))}
    <h2>Help us out!</h2><p><img src="${view.asset('images/mascot/TaylorNSFW.png')}" alt="Taylor, a gray and yellow lizard with tits, shaking them at you" class="mascot float-right" width="195">
      We'll be upfront! The site pretty cheap to operate. We have very little in running costs, and I am somewhat OK with paying the ~$40 a month it costs in bandwidth and compute that it takes to keep this service online; however, a few folks have asked if they can help out or compensate our time as a tip, so we set up a Ko-Fi!</p>
    <a href="https://ko-fi.com/pawcorp" target="_blank" rel="noopener" class="kofi-button"><button>${icon('cafe')} Just the tip!</button></a>`;
}
