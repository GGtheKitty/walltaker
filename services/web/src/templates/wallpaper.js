import {html,empty,icon,userPath,safeUrl,timeAgo,plural,paragraphs,hidden,checked,button} from './html.js';

const capitalize = text => {text=String(text || '');return text.charAt(0).toUpperCase()+text.slice(1).toLowerCase();};
const linkPath = l => '/links/'+l.id;
const own = (v,l) => v.user && String(v.user.id)===String(l.user_id);
const owner = (v,l) => v.users.get(String(l.user_id));
const ability = (v,l,name) => (v.graph.abilities || []).some(a=>String(a.link_id)===String(l.id)&&a.ability===name);
const latest = (v,l) => [...(v.graph.past_links || []),...(v.graph.latest || [])].filter(p=>String(p.link_id)===String(l.id)).sort((a,b)=>Number(b.id)-Number(a.id))[0];
const clients = (v,l) => (v.graph.clients || []).find(c=>c.match_text && (l.last_ping_user_agent || '').includes(c.match_text));
const csrf = v => hidden('authenticity_token',v.csrf);
const patch = v => html`${csrf(v)}${hidden('_method','patch')}`;
const tools = (left,right=empty) => html`<div data-turbo-prefetch="false" class="task-tools"><div class="left">${left}</div><div class="right">${right}</div></div>`;
export const errors = v => v.errors ? html`<div class="error" role="alert"><ul>${Object.entries(v.errors).flatMap(([key,items])=>(Array.isArray(items)?items:[items]).map(text=>html`<li>${key==='base'?'':key+' '}${text}</li>`))}</ul></div>` : empty;
const cards = (v,links=[]) => links.map(l=>html`<div data-controller="go" data-go-to-value="${linkPath(l)}">${card(v,l)}</div>`);
export function kinks(v,l) {
  const ids=new Set((v.graph.memberships || []).filter(m=>String(m.user_id)===String(l.user_id)).map(m=>String(m.kink_id)));
  return (v.graph.kinks || []).filter(k=>ids.has(String(k.id)));
}
export function kinkList(v,l,{editable=false,search=false}={}) {
  const memberships=v.graph.memberships || [];
  return html`<turbo-frame id="kink_list" ${search?html`target="pornsearch"`:empty}>${kinks(v,l).map(k=>{
    const starred=memberships.some(m=>String(m.user_id)===String(l.user_id)&&String(m.kink_id)===String(k.id)&&m.is_starred);
    return html`<turbo-frame id="kink_${k.id}" class="kink ${k.works_on_e621?'valid':'untested'}">
      <a href="${search?queryURL('/porn_search/search',{tags:k.name,link:l.id,full_rerender:'1'}):'/kinks/'+k.id}" target="${search?'_self':'_top'}" ${search?html`data-turbo-frame="pornsearch_results" data-turbo-stream`:empty}>${k.name}${!editable&&starred?html` ${icon('star','big star')}`:empty}</a>
      ${editable?html`${button(icon(starred?'star':'star-outline'),'/kinks/'+k.id+'/star',v.csrf)}${button(icon('trash'),'/kinks/'+k.id,v.csrf,{method:'delete'})}`:empty}
    </turbo-frame>`;
  })}</turbo-frame>`;
}
export function card(v,l) {
  const u=owner(v,l), client=clients(v,l), expired=!l.never_expires && new Date(l.expires)<=new Date();
  const connected=(v.graph.connected || []).map(String).includes(String(l.id));
  const online=connected || l.last_ping && Date.now()-new Date(l.last_ping)<((l.last_ping_user_agent || '').includes('widgetExtension')?1200000:60000);
  const tags=(l.blacklist || '').split(/[\s,]+/).filter(Boolean).map(t=>t.replace(/^-/,'')).filter(t=>t.length>1);
  const decor=(v.graph.decorations || []).find(d=>String(d.link_id)===String(l.id));
  const parent=[...(v.graph.links || []),...(v.graph.parents || [])].find(p=>String(p.id)===String(l.forked_from_id));
  const type=typeof l.response_type==='number'?['horny','came','disgust','ok'][l.response_type]:l.response_type;
  return html`${v.stream(v.globalStream('Link',l.id))}<turbo-frame id="link_${l.id}" target="_top">${expired?html`<div class="accent-block accent-block--link"><div class="accent-block__charm">${icon('eye-off')}Only you ${ (v.graph.leashes || []).some(edge=>String(edge.pet_id)===String(l.user_id))?'and your owner ':''}see this because it's expired</div>`:empty}
  <div class="link" data-feed-number="${decor?.emoji || l.id}">
  ${l.post_thumbnail_url?html`<div class="link--backdrop"><img src="${v.media(l.post_thumbnail_url)}" alt=""></div>`:empty}
  <div class="link--presence"><strong class="${online?'online':'offline'}">${online?'Online':l.last_ping || l.live_client_started_at?html`<abbr title=">1 minute since last ping">Offline</abbr>`:html`<abbr title="New link with nothing currently connected">New</abbr>`}${connected?icon('pulse-sharp'):empty}</strong></div>
  <div class="link--expires">${l.never_expires?html`<em>${icon('infinite')}Never expires</em>`:html`<strong>${expired?'Expired:':'Expires:'}</strong> ${expired?new Date(l.expires).toUTCString():'in '+timeAgo(l.expires,Date.now()+2*(new Date(l.expires)-Date.now()))}`}</div>
  ${l.theme || l.min_score>0?html`<div class="link--theme"><strong>${icon('pricetag-outline')}Theme</strong><span>${l.theme} ${l.min_score>0?'score:>'+l.min_score:''}</span></div>`:empty}
  ${(v.graph.abilities || []).some(a=>String(a.link_id)===String(l.id))?html`<div class="link--abilities"><strong>${icon('sparkles')}Abilities</strong>${(v.graph.abilities || []).filter(a=>String(a.link_id)===String(l.id)).map(a=>html`<span title="${a.ability}">${a.ability==='can_be_set_by_lizard'?html`<img src="${v.asset('images/mascot/'+({ki:'Ki',warren:'Warren',taylor:'Taylor'}[u?.mascot] || 'Ki')+'Head.png')}" class="mascot" width="22" height="22" alt="Lizard">`:icon({can_show_videos:'videocam-outline',can_be_set_by_porn_bot:'dice-outline',is_kink_aligned:'bookmark',is_master_only:'lock-closed-outline'}[a.ability] || 'sparkles')}</span>`)}</div>`:empty}
  <div class="link--blacklist"><strong>${icon('cut')}Blacklist</strong><div>${tags.length?tags.map(t=>html`<span>${t}</span>`):'No Blacklisted Tags'}</div></div>
  <div class="link--terms"><blockquote>${ability(v,l,'is_kink_aligned')?html`<div class="kink_tools" style="margin-bottom: 1rem"><div class="kinks">${kinkList(v,l)}</div></div>`:empty}${paragraphs(l.terms)}</blockquote></div>
  ${parent?html`<a class="link--forked-from" href="${linkPath(parent)}">${icon('git-branch')}${owner(v,parent)?.username}#${parent.id}</a>`:empty}
  <div class="link--status-bar">${l.friends_only?html`<abbr class="link--friends-only" title="Friends only">${icon('document-lock')}</abbr>`:empty}<em>${u?.username || 'Deleted user'}</em><div class="link--device-in-use"><span>${client?.link_label}</span>${icon(client?.icon_name || 'help-circle-outline')}</div></div></div>
  ${l.response_text!=null && type!=='disgust'?html`<div class="link--response"><strong>${u?.username} ${type==='horny'?'😍:':type==='came'?'💦 said while cumming:':!l.response_text?'says thanks':':'}</strong> ${l.response_text}</div>`:empty}
  ${expired?html`</div>`:empty}</turbo-frame>`;
}
export function details(v,l) {
  const u=owner(v,l),post=latest(v,l),setter=v.users.get(String(post?.set_by_id)),device=clients(v,l)?.device_type==='mobile'?'mobile':'desktop';
  const md5=/\/([a-f0-9]{32})\.[a-z0-9]+(?:\?|$)/i.exec(l.post_url || '')?.[1];
  return html`<turbo-frame id="link_details_${l.id}"><h2 class="one-line"><span><a href="${userPath(u)}" target="_top">${u?.username}</a>'s wallpaper</span><small>Last changed ${post?html`<relative-time datetime="${post.created_at}">${timeAgo(post.created_at)} ago</relative-time> by ${setter?html`<a href="${userPath(setter)}" data-controller="user-reference">${setter.username}</a>`:'anon'}`:'never'}</small></h2>
  ${l.post_url&&l.post_thumbnail_url?html`<figure data-controller="embiggen-toggle"><a href="${safeUrl(l.post_url)}" target="_blank" rel="noopener" class="background-sample">${icon(device==='mobile'?'phone-portrait-outline':'laptop-outline','background-sample__icon--'+device+' hide-when-embiggened')}<img src="${v.media(l.post_thumbnail_url)}" alt="Current wallpaper" class="embiggen-me-daddy background-sample__image--${device}"></a><figcaption class="link--description"><div class="embiggen-button-container"><button type="button" data-action="click->embiggen-toggle#toggle">${icon('expand','text-embiggen')}${icon('contract','text-ensmallen')}<span class="show-for-warren show-for-perverts text-embiggen">MAKE IT HUGE!</span><span class="show-for-warren show-for-nonperverts text-embiggen">Bigger</span><span class="show-for-warren show-for-perverts text-ensmallen">MAKE IT TINY!</span><span class="show-for-warren show-for-nonperverts text-ensmallen">Smaller</span><span class="show-for-taylor show-for-perverts text-embiggen">Show it all~!</span><span class="show-for-taylor show-for-nonperverts text-embiggen">Show more</span><span class="show-for-taylor show-for-perverts text-ensmallen">Cover up a little~</span><span class="show-for-taylor show-for-nonperverts text-ensmallen">Show less</span><span class="show-for-ki show-for-perverts text-embiggen">Let's get up close~</span><span class="show-for-ki show-for-nonperverts text-embiggen">Expand</span><span class="show-for-ki show-for-perverts text-ensmallen">That's plenty~</span><span class="show-for-ki show-for-nonperverts text-ensmallen">Collapse</span></button>${md5?html`<a href="https://e621.net/posts?md5=${md5}" class="small" target="_blank" rel="noopener">Show on E621 ${icon('arrow-forward')}</a>`:empty}</div>${paragraphs(l.post_description)}</figcaption></figure>`:empty}</turbo-frame>`;
}
function linkFlashes(v) {
  return html`<div class="link--flashes">${Object.entries(v.flash || {}).filter(([type])=>type!=='notice').map(([,message])=>html`<div class="flash--danger">${message}</div>`)}</div>`;
}
export function selector(v,l) {
  const seconds=latest(v,l)?Math.max(0,(Date.now()-new Date(latest(v,l).created_at))/1000):86400;
  return html`<div class="tabs" data-controller="tabs">
    <div class="tabs__charm">${icon('magnet')} Select wallpaper via...</div>
    <div class="tab" data-tabs-target="tab" data-title="Search" data-controller="porn-search" data-porn-search-seconds-since-last-wallpaper-value="${seconds}">
      <dialog class="modal" data-porn-search-target="modal">
        <h4>Confirm Wallpaper</h4>
        <p>This link's wallpaper was changed less than a minute ago, are you sure you want to overwrite it so soon?</p>
        <div class="modal__buttons">
          <button class="no-underline primary" data-action="click->porn-search#cancel">${icon('close')} Cancel</button>
          <button class="no-underline secondary" data-action="click->porn-search#confirm">Yes, Use This Wallpaper</button>
        </div>
      </dialog>
      ${linkFlashes(v)}
      ${(l.blacklist || '').split(/\s+/).filter(Boolean).length>36?html`
        <div class="accent-block accent-block--warning spaced">
          <div class="accent-block__charm">${icon('warning')} Link has long blacklist.</div>
          <p>Some searches may fail! You'll have to search with a lower number of tags.</p>
        </div>`:empty}
      <p>Enter some e621 tags, click search, then click any post to set ${owner(v,l)?.username}'s wallpaper.</p>
      ${l.theme?html`<p class="subdued">The theme tag <strong>${icon('pricetag-outline')} ${l.theme}</strong> is being automatically applied.</p>`:empty}
      ${ability(v,l,'can_show_videos')?html`<p class="subdued">You can select <strong>${icon('videocam','video-icon')} videos</strong> on this link.</p>`:empty}
      <turbo-frame id="pornsearch" src="/porn_search/index?link=${l.id}"><div>Loading</div></turbo-frame>
    </div>
    <div class="tab" data-tabs-target="tab" data-title="Post ID">
      <turbo-frame id="submit_link_${l.id}">
        ${linkFlashes(v)}
        <form method="post" action="${linkPath(l)}" class="set-post-id" data-turbo-frame="_top">${patch(v)}
          <div><label for="link_post_id" style="display: block">E621 Post ID</label><input type="text" id="link_post_id" name="link[post_id]" autocomplete="off"></div>
          <div><input type="submit" name="commit" value="Update Link"></div>
          ${l.theme?html`<p class="subdued center">The theme tag <strong>${icon('pricetag-outline')} ${l.theme}</strong> must be present.</p>`:empty}
          ${v.searchSuffix?html`<a href="https://e621.net/posts?tags=${encodeURIComponent(v.searchSuffix)}" target="_blank" rel="noopener" class="no-underline">Browse E621 with this blacklist ${icon('arrow-forward')}</a>`:html`<p class="subdued">Search is temporarily unavailable. Please try again shortly.</p>`}
        </form>
        <figure class="half-page-break">
          <img src="${v.asset('images/e621postid.gif')}" alt="Finding the e621 post ID">
          <figcaption>The post ID is the main number shown in the post URL. You should only include this number, not
            anything after the question mark in the post URL, or anything before the number.</figcaption>
        </figure>
      </turbo-frame>
    </div>
  </div>`;
}
export function setup(v,l) {
  return html`<div class="accent-block client-configs__wrapper accent-block__charm--accordion" data-controller="accordion" data-accordion-expand-value="false">
    <div class="accent-block__charm accent-block__charm--accordion-header" data-action="click->accordion#toggle" tabindex="0">
      ${icon('information-circle')} Need help getting set up?
      ${icon('chevron-down','accent-block__charm--accordion-header__indicator')}
    </div>
    <div data-accordion-target="content" style="display: none">
      <p>
        You'll need a client that watches for changes to this link and sets your background for you. You can see a list
        of available clients on the <a href="/#what-do-i-need">homepage.</a> Once you have a client
        set up, you should be able to either enter your Feed ID:
        <strong>"${l.id}"</strong> or import one of the following files:
      </p>
      <div class="client-configs">
        <a download href="${linkPath(l)}/walltaker.toml">${icon('document-outline')} walltaker.toml</a>
        <div class="as-link no-underline" data-controller="widget-installer">
          ${icon('copy-outline')} Install iOS Widget <span class="beta-tag">beta</span>
          <dialog class="modal" data-widget-installer-target="modal">
            <h4>iOS Widget Installation</h4>
            <p>
              We support iOS only thru a widget app. This is a workaround for Apple's draconian adult-content rules.
              <strong>You will need to install
                <a href="https://apps.apple.com/us/app/widget-construction-set/id6444323235?platform=iphone">Widget
                  Construction Set</a> first.</strong> When installed, click the "Add Widget" button below and select
              one of the widget sizes you'd like. Then add the WCS widget to your homescreen!
            </p>
            <div class="modal__buttons">
              <a href="https://apps.apple.com/us/app/widget-construction-set/id6444323235?platform=iphone" class="no-underline secondary">${icon('cloud-download')} Install WCS</a>
              <a href="widget://add_widget?url=${v.baseUrl}/api/links/${l.id}/widget.json" class="no-underline secondary">${icon('duplicate')} Add Widget</a>
            </div>
          </dialog>
        </div>
      </div>
      I also wrote up some tips about combating harassment on the
      <a href="/help#bad-wallpaper">help page.</a> that I suggest you read if you're a new user. It's very
      important you know how to avoid shock content! It's your responsibility.
    </div>
  </div>`;
}
export function viewingUsers(v,l) {
  const viewers=(v.graph.viewer_users || []).filter(user=>String(user.viewing_link_id)===String(l.id)&&!user.deleted_at);
  return html`<turbo-frame id="link_viewing_users_${l.id}">${viewers.length>1?html`<div class="accent-block"><div class="accent-block__charm">${icon('eye')} Who's here right now</div><div class="viewing-users__users">${viewers.map(user=>html`<a href="${userPath(user)}" target="_top" data-controller="user-reference">${user.username}</a>`)}</div></div>`:empty}</turbo-frame>`;
}
export function show(v) {
  const l=v.link,u=owner(v,l),isOwn=own(v,l),masterEdge=(v.graph.leashes || []).find(edge=>String(edge.pet_id)===String(l.user_id)),master=v.users.get(String(masterEdge?.master_id));
  const restricted=ability(v,l,'is_master_only')&&String(masterEdge?.master_id)!==String(v.user?.id),packProperty=ability(v,l,'is_master_only')&&master;
  const blacklistCount=(l.blacklist || '').split(/\s+/).filter(Boolean).length;
  const forkCount=(v.graph.fork_counts || []).find(f=>String(f.link_id)===String(l.id))?.count || 0;
  return html`
    <div data-controller="presence" data-presence-id-value="${l.id}"></div>
    ${isOwn?html`
      <div data-turbo-prefetch="false" class="task-tools" data-controller="link" data-link-id-value="${l.custom_url || l.id}">
        <dialog class="modal" data-link-target="modal">
          <h4>Confirm Delete</h4><p>Are you sure you want to delete this link?</p>
          <div class="modal__buttons">
            <button class="no-underline primary" data-link-target="cancel" data-action="click->link#cancel">${icon('close')} Cancel</button>
            ${button('Delete this link',linkPath(l),v.csrf,{method:'delete',className:'no-underline secondary'})}
          </div>
        </dialog>
        <div class="left"><a href="/links">Back</a></div>
        <div class="right">
          <a href="#" class="no-underline"><ion-icon data-link-target="shareIcon" role="presentation" name="share-outline"></ion-icon><ion-icon data-link-target="checkmarkIcon" role="presentation" name="checkmark" style="display: none"></ion-icon><span data-link-target="copy">Copy</span></a>
          <a href="${linkPath(l)}/edit" title="Edit this link" class="no-underline">${icon('build')} Edit</a>
          ${l.wizard_page?html`<a href="${linkPath(l)}/wizard/${l.wizard_page}" title="Return to wizard" class="no-underline">${icon('color-wand')} Finish Wizard</a>`:empty}
          <button data-action="click->link#confirm">Delete</button>
        </div>
      </div>`:tools(html`<a href="/browse">Back</a>`,html`
        ${v.user?html`<a href="${linkPath(l)}/reports/new" class="no-underline">Report</a>`:empty}
        ${!v.has_friendship?html`<a href="/friendships/new?with=${encodeURIComponent(u?.username || '')}" title="Become friends" class="no-underline">${icon('person-add')} Send Friend Request</a>`:empty}`)}
    ${card(v,l)}
    ${isOwn&&blacklistCount>36?html`
      <div class="accent-block accent-block--warning spaced">
        ${icon('warning','scare-charm')}<div class="accent-block__charm">${icon('warning')} Configuration warning</div>
        <p>Your link has a really long blacklist! I know I ask that you fill out your blacklist as fully as you can, but we
          can only make requests to e621 with a maximum number of tags. Your link still works, this is just a warning.</p><br>
        <p>${blacklistCount} blacklist tags ${l.theme?'+ 1 theme tag':''} =
          only ${plural(45-(blacklistCount+(l.theme?1:0)),'tag')} a user can search with.</p>
      </div>`:empty}
    ${latest(v,l)&&Date.now()-new Date(latest(v,l).created_at)<120000?html`<div class="accent-block"><div class="accent-block__charm inline">${icon('hourglass')} Wallpaper was just changed <a class="right-side" href="${linkPath(l)}/show_similar">Try another link</a></div></div>`:empty}
    ${isOwn?html`
      <div class="accent-block">
        <div class="accent-block__charm">${icon('eye-off')} Only you see this</div>
        <form method="post" action="${linkPath(l)}" class="set-post-response">${patch(v)}
          <div>
            <input type="text" id="link_response_text" name="link[response_text]" placeholder="How do you feel about this wallpaper?" autocomplete="off">
            <select id="link_response_type" name="link[response_type]"><option value="horny">Love it!</option><option value="disgust">Hate it!</option><option value="came">I came</option><option value="ok">Thanks</option></select>
            <input type="submit" name="commit" value="Reply">
          </div>
        </form>
        <p class="set-post-response__description">
          Reply publicly to the user who set your wallpaper so they know what you like! If you select "Hate it", the
          wallpaper will be reset to the previous wallpaper. If you select "I came" an orgasm will be logged on your user
          profile.
        </p>
      </div>
      ${setup(v,l)}`:empty}
    ${v.user?html`
      <aside class="comments-sidebar" data-controller="comments-sidebar" data-hidden="true">
        <button data-comments-sidebar-target="toggle" data-action="click->comments-sidebar#toggleClick" data-hidden="true">
          ${icon('chatbox-ellipses','toggle-open-icon')}${icon('caret-forward','toggle-close-icon')}
          <div class="toggle-badge" data-comments-sidebar-target="badge" data-hidden="true"></div>
        </button>
        ${v.stream('link_comments_'+l.id)}
        <div id="comments"><turbo-frame id="link_comments" src="${linkPath(l)}/comments"></turbo-frame></div>
        <turbo-frame id="link_comments_new" src="${linkPath(l)}/comments/new"></turbo-frame>
      </aside>`:empty}
    ${v.stream('link_details_'+l.id)}${details(v,l)}
    ${restricted?empty:selector(v,l)}
    ${packProperty?html`<div class="accent-block"><div class="accent-block__charm"><iconify-icon icon="mdi:dog-service"></iconify-icon> Leash in use</div>
      ${capitalize(u?.username)} is leashed to Owner <a href="${userPath(master)}">${capitalize(master.username)}</a>, who opted to make this link pack property.
      ${masterEdge.flair?html`<blockquote>${masterEdge.flair}</blockquote>`:empty}</div>`:empty}
    ${masterEdge&&String(masterEdge.master_id)===String(v.user?.id)?html`
      <div class="abilities accent-block"><div class="accent-block__charm">${icon('eye-off')} Only you see this, as you are the owner of ${u?.username}</div>
        <div class="abilities__ability"><div class="abilities__ability__title">
          <strong>${ability(v,l,'is_master_only')?html`<iconify-icon icon="mdi:dog-service"></iconify-icon>`:icon('eye')} ${ability(v,l,'is_master_only')?'Owner Only':'Public'}</strong>
          <p>${ability(v,l,'is_master_only')?html`Only bots and you, the owner of ${u?.username}, will be able to set wallpapers.`:html`Anyone can set wallpapers for this link.`}</p>
        </div><div class="abilities__ability__controls">${button(ability(v,l,'is_master_only')?'Make Public':'Make Owner Only',linkPath(l)+'/abilities/is_master_only',v.csrf,{className:ability(v,l,'is_master_only')?'enabled':'disabled'})}</div></div>
      </div>`:empty}
    ${v.stream('link_viewing_users_'+l.id)}${viewingUsers(v,l)}
    ${forkCount>0?html`
      <div class="accent-block accent-block__charm--accordion" data-controller="accordion">
        <div class="accent-block__charm accent-block__charm--accordion-header" data-action="click->accordion#toggle" tabindex="0">${icon('git-branch')} ${plural(forkCount,'fork')} will also be changed ${icon('chevron-down','accent-block__charm--accordion-header__indicator')}</div>
        <div data-accordion-target="content">
          <p>Links that are forks of this link will receive wallpaper changes that are set here; but only if their separete
            blacklists allow it. You may receive responses from anyone of the following:</p>
          <div class="forks-list">${(v.graph.links || []).filter(f=>String(f.forked_from_id)===String(l.id)).map(f=>html`<a href="${linkPath(f)}">${owner(v,f)?.username}#${f.id}</a>`)}</div>
        </div>
      </div>`:empty}`;
}
const checkbox = (name,label,value,extra=empty) => html`<div class="link--form--checkbox-row"><label for="link_${name}">${label}</label>${hidden('link['+name+']','0')}<input type="checkbox" id="link_${name}" name="link[${name}]" value="1" ${checked(value)} ${extra}></div>`;
const lizardDescriptions = {
  "warren": {
    "false": "He loves everything big. Big tits. Big dicks. Fat asses. All he cares about are your bits, just to feel the heft of it, what it smells like, and to taste anything dripping from them. Expect him to give you lots of larger than life close ups, and a little bit of light musk.",
    "true": "He loves everything big. Really big. Huge udders. Horse dicks. Fat haunches. All he cares about it your bits, just to feel the sheer size of it, what it reeks like, and to taste whatever gross fluid is leaking out of it. Expect him to give you lots of hyper content and heavy musk."
  },
  "taylor": {
    "false": "She's a party girl, she'll fuck anyone that looks at her the right way. She especially loves showing off and she's maybe a bit competitive about it. Seeing anyone walking around with a fresh load dripping out their ass or cunt gets her looking for the closest cock she can milk. Expect public sex, creampies and facials.",
    "true": "She's a party girl, she'll fuck anything really. She especially loves showing off and she's very competitive about it. Seeing anyone walking around with a fresh load dripping out their ass or cunt gets her looking for the closest cock to get bred by. She's never minded flashing her cunt to make that happen. Expect lots of public sex with flashing, excessive cum and impregnation."
  },
  "ki": {
    "false": "They're demisexual. That means they need to sense a connection with someone before they can do anything in bed. (And just talking about it makes them blush!) They love cuddling, rubbing, and any sensual touch. Expect to see lots of very cozy posts. Not all posts may be explicit, sometimes they just like a cozy wallpaper you know?",
    "true": "They're demisexual... and they like you. You should be scared. They love touch, and nothing is more sensual to them than raw textural experiences. Latex, rubber, neoprene, slime, they love it all. They might even tickle you, it's hard to know what to expect! Just know, you're going to feel it."
  }
};
export function form(v) {
  const l=v.link,creating=v.creating;
  const expires=l.expires&&Number.isFinite(Date.parse(l.expires))?new Date(l.expires).toISOString().slice(0,16):'';
  return html`
    ${tools(html`<a href="${creating?'/links':linkPath(l)}">${creating?'Back to links':'Back to link'}</a>`)}
    ${creating?html`<h2>New link</h2>`:empty}
    <form method="post" action="${creating?'/links':linkPath(l)}" class="link-settings">
      ${creating?csrf(v):patch(v)}${errors(v)}
      <div class="link--form__section">
        <h3>${icon('newspaper')} Metadata</h3>
        <p>Tell people about yourself! What do you like, what do you not like? Customize your link to fit you.</p>
        <div>
          <label for="link_terms" style="display: block">Description (Basic HTML supported)</label>
          <textarea id="link_terms" name="link[terms]" cols="70" rows="5">${l.terms}</textarea>
        </div>
        <div class="accent-block spaced">
          <div class="accent-block__charm">${icon('trophy-sharp')} Requires the silver trophy (set &gt;300 wallpapers for others)</div>
          <div data-controller="theme-form" class="link--form--theme">
            <label for="link_custom_url_checkbox" class="no-margin">
              ${icon('document-attach-outline')} Custom URL
              <input type="checkbox" id="link_custom_url_checkbox" data-theme-form-target="switch" data-action="click->theme-form#toggle" ${checked(!!l.custom_url)} ${Number(v.user?.set_count)<300?html`disabled`:empty}>
            </label>
            <div data-theme-form-target="container">
              <p class="text-light">
                In addition to your regular walltaker link URL (${v.baseUrl}/links/1), you can provide your own
                text for a custom url. It will be accessible as <strong>${v.baseUrl}/links/
                <mark>your-text-here</mark></strong>
              </p>
              ${v.baseUrl}/links <input type="text" id="link_custom_url" name="link[custom_url]" value="${l.custom_url}" placeholder="horny-deer-please" data-theme-form-target="input">
            </div>
          </div>
        </div>
      </div>
      <div class="link--form__section">
        <h3>${icon('funnel')} Restrictions</h3>
        <p>Define when and by who your wallpaper can be set using this link.</p>
        <div data-controller="expiry-form">
          ${checkbox('never_expires',html`${icon('infinite')} Never expires`,l.never_expires,html`data-expiry-form-target="switch" data-action="click->expiry-form#toggle"`)}
          <div class="link--form--text-row" data-expiry-form-target="input">
            <label for="link_expires" style="display: block">Expires</label>
            <input type="datetime-local" id="link_expires" name="link[expires]" value="${expires}">
          </div>
        </div>
        ${checkbox('friends_only',html`${icon('document-lock')} Friends Only (No public access)`,l.friends_only)}
      </div>
      <div class="link--form__section">
        <h3>${icon('receipt')} Content</h3>
        <p>
          Set the scope of content that users can select for this link. Pay attention to what you enter here, these are the
          most important settings for avoiding shock content.
        </p>
        <div>
          <label for="link_blacklist" style="display: block">Blacklist (same format as e621.net)</label>
          <input type="text" id="link_blacklist" name="link[blacklist]" value="${l.blacklist}">
        </div>
        <div class="link--form--min_score" data-controller="range">
          <label for="link_min_score">${icon('shield-outline')} Minimum score</label>
          <input type="range" id="link_min_score" name="link[min_score]" min="0" max="300" value="${l.min_score || 0}" data-range-target="input" data-action="input->range#refresh">
          <output for="link_min_score" data-range-target="value"></output>
        </div>
        <div data-controller="theme-form" class="link--form--theme">
          <label for="link_theme">
            ${icon('pricetag-outline')} Theme tag
            <input type="checkbox" data-theme-form-target="switch" data-action="click->theme-form#toggle" ${checked(!!l.theme)}>
          </label>
          <div data-theme-form-target="container">
            <em>All wallpapers selected for this link must contain this tag. You can only use 1 theme tag. Leave it blank to
              allow all posts that are not otherwise blacklisted.</em><br>
            <input type="text" id="link_theme" name="link[theme]" value="${l.theme}" placeholder="loimu_(character)" data-theme-form-target="input">
          </div>
        </div>
      </div>
      <div class="link--form--submit-row">
        <input type="submit" name="commit" value="${creating?'Create Link':'Update Link'}">
        <input type="submit" name="commit" value="Update and Test" class="secondary">
      </div>
    </form>
    ${creating?empty:html`
      <div class="link--form__section">
        <h3>${icon('sparkles')} Abilities</h3>
        <p>Some clients support special features that aren't required to be possible on every client. You can toggle those
          here, but they make break compatibility with some clients that don't support them.</p>
        ${abilities(v,l)}
      </div>
      <div class="accent-block">
        <div class="accent-block__charm">${icon('information-circle')} Need help?</div>
        There's a concise explanation of every single one of these options on the
        <a href="/help#getting-started-make-a-link">help page.</a>
      </div>
    `}`;
}
export function abilities(v,l) {
  const videos=ability(v,l,'can_show_videos'),bot=ability(v,l,'can_be_set_by_porn_bot'),lizardOn=ability(v,l,'can_be_set_by_lizard'),aligned=ability(v,l,'is_kink_aligned');
  const lizard=['ki','warren','taylor'].includes(v.user?.mascot)?v.user.mascot:'ki',name=lizard[0].toUpperCase()+lizard.slice(1);
  const toggle=(enabled,abilityName,label)=>button(label,linkPath(l)+'/abilities/'+abilityName,v.csrf,{className:enabled?'enabled':'disabled'});
  return html`<turbo-frame id="link_form_abilities"><div class="abilities">
    <div class="abilities__ability">
      <div class="abilities__ability__title">
        <strong>${icon(videos?'videocam':'videocam-off')} ${videos?'Allowing':'Disallowing'} videos</strong>
        <p>${videos?html`Videos and GIFs can be selected, not just images. Currently, only the Wallpaper Engine client supports
          videos.`:html`Videos and GIFs cannot be selected, only images are selectable. (Default)`}</p>
      </div>
      <div class="abilities__ability__controls">${toggle(videos,'can_show_videos',videos?'Disable videos':'Enable videos')}</div>
    </div>
    <div class="abilities__ability">
      <div class="abilities__ability__title">
        <strong>${icon(bot?'thumbs-up':'hand-left')} PornBot™ is ${bot?'welcomed':'turned away'}</strong>
        <p>${bot?html`Your wallpaper will be changed by our resident horny robot: PornBot. They (a gender-defying icon) select
          a highly-rated post that matches your blacklist rules. PornBot has no preferences unlike the
          PornLizards.`:html`Your wallpaper will not changed by our resident horny robot: PornBot. You will only get wallpapers from
          fleshy human-beings.`}</p>
      </div>
      <div class="abilities__ability__controls">${toggle(bot,'can_be_set_by_porn_bot',bot?'Disallow PornBot':'Allow PornBot')}</div>
    </div>
    <div class="abilities__ability">
      <div class="abilities__ability__title">
        <strong>${lizardOn?html`<img src="${v.asset('images/mascot/'+name+'Head.png')}" class="mascot" height="25" width="25" alt="">`:icon('hand-left')}
          ${v.user?.pervert?'Perverted ':''}${name} is ${lizardOn?'welcomed':'turned away'}</strong>
        <p>${lizardOn?html`Your wallpaper will be changed by your selected PornLizard ${name}
          ! ${lizardDescriptions[lizard][v.user?.pervert?'true':'false']}`:html`Your wallpaper will not changed by any of the PornLizards. It's kind of their thing, you should let at
          least one mess with you! I'm sure ${name} is horny. If you'd like to pick another,
          choose one from the site header.`}</p>
      </div>
      <div class="abilities__ability__controls">${toggle(lizardOn,'can_be_set_by_lizard',(lizardOn?'Disallow ':'Allow ')+name)}</div>
    </div>
    <div class="abilities__ability">
      <div class="abilities__ability__title">
        <strong>${icon(aligned?'bookmark':'flame')} Profile Kinks are ${aligned?'enforced':'ignored'}</strong>
        <p>${aligned?html`At least 1 of your user profile kinks will be required to appear on posts sent to this link. Be careful!
          It's easy to make a configuration that no one can change easily! No one wants to skim massive tag lists
          just to find something for you.`:html`Your wallpaper configuration is unaffected by your user profile kinks. All the configuration relative to
          this link is shown on this page, nothing else affects it.`}</p>
        ${aligned?html`<turbo-frame id="kink_tools"><div class="kink_tools"><div class="kinks">
          ${kinkList(v,l,{editable:true})}
          <form method="post" action="/kinks" id="kink_form" class="kink_form">${csrf(v)}
            <input type="text" id="kink_name" name="kink[name]" placeholder="Enter a kink"><input type="submit" name="commit" value="+">
          </form>
        </div></div></turbo-frame>`:empty}
      </div>
      <div class="abilities__ability__controls">${toggle(aligned,'is_kink_aligned',aligned?'Be less strict':'Be strict')}</div>
    </div>
  </div></turbo-frame>`;
}
export function list(v) {
  return html`${tools(html`<a href="/">Back</a>`,html`<a href="/links/wizard" title="Return to wizard" class="no-underline">${icon('color-wand')} Link Wizard</a>${button('New link','/links/new',v.csrf,{method:'get'})}`)}
    <h2 class="owned-links-heading">${icon('document','big')} Your Links</h2>
    <div id="links" class="owned-links">${v.links.length?cards(v,v.links):html`<h4>No links?</h4><p>You'll need to create a link that others can use to push wallpapers to your device. Try the
      <span class="mock-link">${icon('color-wand')} Link Wizard</span>for a guided tutorial!</p>`}</div>`;
}
export function browse(v) {return html`${tools(html`<a href="/">Back</a>`,html`${button(html`${icon('bookmark')} By Kinks`,'/link_lists',v.csrf,{method:'get'})}${button(html`${icon('search-sharp')} By Search`,'/search',v.csrf,{method:'get'})}`)}<h2>${icon('documents','big')} Browse Links<small>All public online links ordered by who needs the most attention at the top.</small></h2>${v.new_user_links?.length?html`<section class="browse-links__subheading"><h3>New User's Links</h3><p>User's who created their account recently get featured here for a short amount of time.</p></section><div id="new-user-links" class="browse-links">${cards(v,v.new_user_links)}</div><section class="browse-links__subheading"><h3>The "Algorithm"</h3><p>My arbitrary algorithm that determines the order of this list.</p></section>`:empty}<div id="links" class="${v.links.length?'browse-links':''}">${v.links.length?cards(v,v.links):html`<h4>No one is online!</h4><p>No links are currently being used. Maybe you should use your own? Click <strong>Links</strong> in the navigation bar to get started.</p>`}</div>`;}
const queryURL=(url,input)=>url+'?'+new URLSearchParams(Object.entries(input).filter(([,v])=>v!=null)).toString();
const nav=(label,url,enabled=true)=>enabled?html`<a href="${url}">${label}</a>`:html`<a disabled aria-disabled="true" tabindex="-1">${label}</a>`;
export function search(v) {return html`${tools(html`<a href="/browse">Back to browse</a>`)}<h1 class="woogle">Woogle</h1><form method="get" action="/search/query" class="link-search" data-turbo-frame="link_search_results"><input type="text" id="q" name="q" value="${v.query}" aria-label="Search links"><input type="submit" value="Search Links"><label><strong class="online">Online</strong> Only ${hidden('only_online','0')}<input type="checkbox" name="only_online" value="1" ${checked(v.only_online)}></label></form><turbo-frame id="link_search_results" ${v.query?html`src="${queryURL('/search/query',{q:v.query,only_online:v.only_online?'1':'0'})}"`:empty}>${v.query?empty:html`<div class="accent-block spaced"><div class="accent-block__charm">${icon('sparkles-sharp')}Tip</div><p>Woogle searches for links, but will look at the user's bio and username as well. <strong>This means you may see links that don't seem to contain your search term.</strong> This just means the word appeared in their user profile.</p></div>`}</turbo-frame>`;}
export function searchResults(v) {return html`<turbo-frame id="link_search_results"><strong class="search-heading">Found ${plural(v.total,'result')}</strong>${cards(v,v.links)}<div class="linksearch_results__buttons">${nav('Prev',queryURL('/search/query',{q:v.query,page:v.page-1,only_online:v.only_online?'1':'0'}),v.page>1)}<span>${v.page}</span>${nav('Next',queryURL('/search/query',{q:v.query,page:v.page+1,only_online:v.only_online?'1':'0'}),v.has_next)}</div></turbo-frame>`;}
export function e621Input(v) {return html`<turbo-frame id="pornsearch_input"><form method="get" action="/porn_search/search" data-turbo-frame="pornsearch_results" data-porn-search-target="search"><input type="text" id="tags" name="tags" placeholder="E621 Tags" value="${v.tags}">${v.link?hidden('link',v.link.id):empty}${hidden('message_thread',v.thread_id || '')}<button type="submit">${icon('search-outline')} Search E621</button></form></turbo-frame>`;}
export function kinkTools(v) {return html`<turbo-frame id="kink_tools" class="kinks" target="pornsearch">${kinkList(v,v.link,{search:true})}</turbo-frame>`;}
export function e621Results(v) {
  const base={tags:v.tags,...(v.link?{link:v.link.id}:{message_thread:v.thread_id})};
  return html`<turbo-frame id="pornsearch_results">${v.unavailable?html`<p role="alert">Search is temporarily unavailable. Please try again shortly.</p>`:v.posts.length?html`<div class="pornsearch_results__buttons">${nav('back',queryURL('/porn_search/search',{...base,before:v.posts[0].id,page_number:v.pageNumber-1}),v.pageNumber>1)}<span>${v.pageNumber}</span>${nav('next',queryURL('/porn_search/search',{...base,after:v.posts.at(-1).id,page_number:v.pageNumber+1}))}</div><div class="results">${v.posts.map(post=>post.preview?.url?html`<form class="button_to" method="post" action="${v.link?linkPath(v.link):'/porn_search/send_message_and_return/'+v.thread_id}" data-turbo-frame="_top">${v.link?html`${patch(v)}${hidden('link[post_id]',post.id)}`:html`${csrf(v)}${hidden('message',post.file?.url || '')}`}<button type="submit" ${v.link?html`data-porn-search-target="thumbnail" data-action="click->porn-search#click_thumbnail"`:empty}><img src="${v.media(post.preview.url)}" alt="Select post ${post.id}"></button></form>`:html`<strong>Blacklisted</strong>`)}</div>`:html`<p><strong>Sorry</strong> ${v.link?(v.link.theme?html`that search may not have returned any results that match the theme tag (${v.link.theme}) that the link owner chose. Search with an empty tag list to see all theme-matching posts.`:html`that search returned nothing. This search obeys the e621 global blacklist, and also has some light filtering to prevent easy abuse.`):html`that search did not return any results.`}</p>`}</turbo-frame>`;
}
export function e621(v) {return html`<turbo-frame id="pornsearch">${e621Input(v)}${v.link&&kinks(v,v.link).length?html`<br><strong>Some of ${owner(v,v.link)?.username}'s kinks:</strong>${kinkTools(v)}`:empty}<turbo-frame id="pornsearch_results">${v.unavailable?html`<p>Search is temporarily unavailable. Please try again shortly.</p>`:empty}</turbo-frame></turbo-frame>`;}
export function comment(v,c) {
  const urls=[...String(c.content || '').matchAll(/https:\/\/static\d*\.e621\.net\/data\/[a-z0-9]{2}\/[a-z0-9]{2}\/[a-f0-9]{32}\.(?:jpg|png)/gi)].map(m=>m[0]);
  return html`<div id="comment_${c.id}" class="comment" data-comments-sidebar-target="comment"><strong>${v.users.get(String(c.user_id))?.username || 'Deleted user'}:</strong><p>${urls.reduce((t,url)=>t.replace(url,''),c.content || '')}${urls.map(url=>html`<a target="_blank" rel="noopener" href="https://e621.net/posts?md5=${/([a-f0-9]{32})\./i.exec(url)[1]}"><img src="${v.media(url)}" alt="Attached post"></a>`)}</p></div>`;
}
export function comments(v) {return html`<turbo-frame id="link_comments">${[...v.comments].reverse().map(c=>comment(v,c))}</turbo-frame>`;}
export function commentForm(v) {return html`<turbo-frame id="link_comments_new">${v.error?html`<p role="alert">${v.error}</p>`:empty}${v.user?html`<form method="post" action="${linkPath(v.link)}/comments" class="new_comment_form" data-controller="new-comment-form">${csrf(v)}<input type="text" id="comment_content" name="comment[content]" value="${v.comment}" aria-label="Comment" autocomplete="off" data-new-comment-form-target="input" data-action="input->new-comment-form#inputChange"><input type="submit" value="Send" disabled data-new-comment-form-target="send"></form>`:html`<p><a href="/login" target="_top">Log in to comment.</a></p>`}</turbo-frame>`;}
export function history(v) {
  const groups=new Map();
  for(const post of v.posts){const key=v.kind==='sent'?'sent':post.set_by_username || '';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(post);}
  return html`${tools(html`<a href="${userPath(v.targetUser)}">Back</a>`)}
    <p>${v.kind==='sent'?html`Below is a list of the last 50 wallpapers by ${v.targetUser.username} for others. Click any wallpaper to go to see the full size image.`:html`Below is a list of the last 50 wallpapers set by others for ${v.targetUser.username}. Click any wallpaper to go to see the full size image, or click the username on each row to go to the setter's profile.`}</p>
    ${[...groups].map(([name,posts])=>html`${v.kind==='received'?html`<h2>${icon(name?'person':'glasses','big')} ${name?html`<a href="${userPath({username:name})}">${name}</a>`:'Anon Users'}<small>Set ${plural(posts.length,'wallpaper')}</small></h2>`:empty}<div class="past-link-posts ${posts.length>5?'past-link-posts--grid':''}">${posts.filter(p=>p.post_thumbnail_url).map(p=>html`<a href="${safeUrl(p.post_url)}" target="_blank" rel="noopener"><img src="${v.media(p.post_thumbnail_url)}" alt="Wallpaper ${p.id}"></a>`)}</div>`)}`;
}
export function embed(v) {
  const l=v.link,type=['form','short','link','wallpaper'].includes(v.embed.type)?v.embed.type:'default';
  const fit=v.embed.fit==='contain'?'contain':'cover';
  const raw=v.embed.background || '212121',bg=/^#?[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(raw)?'#'+raw.replace('#',''):'#212121';
  const content=type==='wallpaper'?html`${v.stream('link_preview_'+l.id+'_image')}${v.embed.hide_text!=='true'?html`${v.stream('link_preview_'+l.id+'_text')}${v.stream('link_comments_'+l.id)}`:empty}<div class="embed__preview ${fit}" style="background-color:${bg}">${v.embed.hide_text!=='true'?html`<div class="embed__text"><turbo-frame id="preview_text" class="embed__text__content">Set by: ${v.users.get(String(l.set_by_id))?.username || 'anon'}</turbo-frame><turbo-frame id="link_comments" src="${linkPath(l)}/comments"></turbo-frame></div>`:empty}<turbo-frame id="preview_image">${l.post_thumbnail_url?html`<img src="${v.media(l.post_thumbnail_url)}" alt="Current wallpaper">`:'No image set! :('}</turbo-frame></div>`:html`${type==='form'?empty:card(v,l)}${type==='default'?details(v,l):empty}${type==='link'?empty:selector(v,l)}`;
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csrf-token" content="${v.csrf}"><meta name="action-cable-url" content="/cable"><meta name="walltaker-base-url" content="${v.baseUrl}"><title>Walltaker #${l.id}</title><link rel="stylesheet" href="${v.asset('application.css')}"><script type="module" src="${v.asset('application.js')}"></script></head><body><main>${content}</main><script type="module" src="https://unpkg.com/ionicons@5.5.2/dist/ionicons/ionicons.esm.js"></script></body></html>`;
}
export const wallpaperPages = {'wallpaper-show':show,'wallpaper-form':form,'wallpaper-list':list,'wallpaper-browse':browse,'wallpaper-search':search,'wallpaper-search-results':searchResults,'wallpaper-e621':e621,'wallpaper-e621-results':e621Results,'wallpaper-kinks':kinkTools,'wallpaper-comments':comments,'wallpaper-comment-form':commentForm,'wallpaper-history':history,'wallpaper-embed':embed};
