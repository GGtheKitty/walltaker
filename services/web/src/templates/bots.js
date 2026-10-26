import {html,empty,hidden,icon,timeAgo} from './html.js';

const csrf=v=>hidden('authenticity_token',v.csrf);
function control(v,bot,action,label){return html`<form method="post" action="/mod_tools/bots/${bot.name}/${action}">${csrf(v)}${hidden('bot[revision]',bot.revision)}<button type="submit" class="${action==='stop'?'danger-button':'secondary'}">${label}</button></form>`;}
function number(bot,key,label,min,max){const id='bot_'+bot.name+'_'+key;return html`<label for="${id}">${label}<input type="number" id="${id}" name="bot[${key}]" value="${bot[key]}" min="${min}" max="${max}" step="1" required></label>`;}
export function botTools(v){const d=v.botData;return html`
<div class="task-tools"><div class="left"><a href="/mod_tools">Back to Mod Tools</a></div><div class="right"><a href="/mod_tools/bots">Refresh status</a></div></div>
<h2>${icon('sparkles','big')} PornBot &amp; PornLizards<small>Manage their searches, timing, and start/stop state.</small></h2>
<p class="bot-tools__worker" role="status"><strong>${d.worker.healthy?'Worker active':'Worker not responding'}</strong>${d.worker.last_seen_at?html` · Last checked <time datetime="${d.worker.last_seen_at}">${timeAgo(d.worker.last_seen_at)} ago</time>`:html` · No worker check recorded yet.`}</p>
${!d.worker.healthy?html`<p>Enabled bots will resume when the worker is available. Starting a bot schedules its next check immediately.</p>`:empty}
<p>Settings are saved across restarts. Tags are combined with each link’s existing theme, blacklist, score, and media rules. Bots only update links that allow them. A check can finish without changing a wallpaper if no eligible links or matching posts are found.</p>
<div class="bot-tools">${d.bots.map(bot=>html`<section class="accent-block bot-tools__bot" id="bot-${bot.name}">
<div class="bot-tools__heading"><h3>${bot.username}</h3><strong class="${bot.enabled?'online':''}">${bot.enabled?'Enabled':'Stopped'}</strong></div>
${!bot.account_available?html`<p class="error">The system account is missing or inactive. It must be restored before this bot can run.</p>`:empty}
<p>${bot.enabled?html`Next check: ${bot.next_run_at?html`<relative-time datetime="${bot.next_run_at}"></relative-time>`:'waiting for the scheduler'}.`:'Automatic checks and queued wallpaper changes are stopped.'} ${bot.jobs.queued} queued · ${bot.jobs.running} running · ${bot.jobs.failed} failed</p>
<form method="post" action="/mod_tools/bots/${bot.name}" class="bot-tools__form">${csrf(v)}${hidden('_method','patch')}${hidden('bot[revision]',bot.revision)}
<label for="bot_${bot.name}_normal_tags">Tags — not perverted</label><textarea name="bot[normal_tags]" id="bot_${bot.name}_normal_tags" maxlength="2000" rows="3">${bot.normal_tags}</textarea>
<label for="bot_${bot.name}_perverted_tags">Tags — perverted</label><textarea name="bot[perverted_tags]" id="bot_${bot.name}_perverted_tags" maxlength="2000" rows="3">${bot.perverted_tags}</textarea>
<small>The tag set follows the link owner’s perverted preference. Use space-separated e621 tags; leave blank to omit this tag set.</small>
<div class="bot-tools__timing">${number(bot,'interval_seconds','Check every (seconds)',60,86400)}${number(bot,'cooldown_seconds','Wallpaper cooldown (seconds)',0,604800)}${number(bot,'round_limit','Maximum links per check',1,60)}</div>
<small>The cooldown is the minimum time since a link’s last wallpaper change, including changes made by people or other bots.</small>
<div><button type="submit">Save settings</button></div></form>
<div class="bot-tools__actions">${control(v,bot,'start',bot.enabled?'Check now':'Start')}${bot.enabled?control(v,bot,'stop','Stop'):empty}</div><small>Start, stop, and check now use the last saved settings.</small>
</section>`)}</div>`;}
