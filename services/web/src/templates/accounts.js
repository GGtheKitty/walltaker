import {html,empty,icon,hidden,checked} from './html.js';

const csrf=v=>hidden('authenticity_token',v.csrf);
const field=(label,name,value='',{password=false,autocomplete='',required=false}={})=>{
  const id=name.replaceAll('[','_').replaceAll(']','');
  return html`<div class="field"><label for="${id}">${label}</label><br><input type="${password?'password':'text'}" name="${name}" id="${id}" ${password?empty:html`value="${value}"`} ${autocomplete?html`autocomplete="${autocomplete}"`:empty} ${required?html`required`:empty}></div>`;
};
export function signup(v){const values=v.signup || {};return html`<h2>${icon('person')} Sign Up</h2>
<form method="post" action="/users" data-turbo="false">${csrf(v)}${v.errors?.length?html`<div class="error"><ul>${v.errors.map(message=>html`<li>${message}</li>`)}</ul></div>`:empty}
${field('Email','user[email]',values.email)}${field('Username','user[username]',values.username)}${field('Password','user[password]','',{password:true})}${field('Password confirmation','user[password_confirmation]','',{password:true})}
${v.flags.invite_only?field('Invite code','invite_code',values.invite_code,{autocomplete:'one-time-code',required:true}):empty}<input type="submit" name="commit" value="Sign up"></form>`;}
export function resetRequest(v){return html`<h2><ion-icon name="skull"></ion-icon> I Forgor</h2>
<p>This is an automated password reset system. You'll receive an email with a link to reset your password. If it never arrives, contact
<a href="${v.baseUrl}/users/gray">Gray</a>.</p>
<form method="post" action="/i-forgor">${csrf(v)}${field('Email','email')}<input type="submit" name="commit" value="Reset Password"></form>`;}
export function resetComplete(v){return html`<form method="post" action="${v.resetPath}" data-turbo="false">${csrf(v)}${field('Password','password','',{password:true})}${field('Password confirmation','password_confirmation','',{password:true})}<input type="submit" name="commit" value="Save new password"></form>`;}
const settingsField=(label,name,autocomplete,password=false,required=false,value='')=>html`<div class="form__row"><label for="${name.replaceAll('[','_').replaceAll(']','')}">${label}</label><input type="${password?'password':'text'}" name="${name}" id="${name.replaceAll('[','_').replaceAll(']','')}" autocomplete="${autocomplete}" ${password?empty:html`value="${value}"`} ${required?html`required`:empty}></div>`;
export function settings(v){
  const u=v.targetUser,system=u.system_account || u.username==='evil',colour=typeof u.colour_preference==='number'?['auto','light','dark'][u.colour_preference]:u.colour_preference || 'auto';
  const next=u.username_changed_at?new Date(new Date(u.username_changed_at).getTime()+7*86400000):null,canChange=!next || next<=new Date();
  const pad=value=>String(value).padStart(2,'0');
  const date=next?`${next.toLocaleString('en-US',{month:'long',timeZone:'UTC'})} ${pad(next.getUTCDate())}, ${next.getUTCFullYear()} ${pad(next.getUTCHours())}:${pad(next.getUTCMinutes())}`:'';
  return html`<h2>${icon('person')} ${u.username}${u.username.toLowerCase().endsWith('s')?"'":"'s"} settings</h2>
<div class="accent-block"><div class="accent-block__charm"><ion-icon role="img" name="color-palette"></ion-icon> Theme Mode</div>
<form method="post" action="/settings" data-turbo="false">${csrf(v)}<div class="form__group">${[['light','sunny','Light mode'],['dark','moon','Dark mode'],['auto','sparkles','Automatic']].map(([value,name,label])=>html`<label for="user_colour_preference_${value}" class="form__row">${icon(name)} ${label}<input type="radio" name="user[colour_preference]" id="user_colour_preference_${value}" value="${value}" ${checked(colour===value)}></label>`)}</div><input type="submit" name="commit" value="Save" class="accent-block__button"></form></div>
${system?empty:html`<div class="accent-block"><div class="accent-block__charm"><ion-icon role="img" name="person-circle"></ion-icon> Username</div>
<small class="settings__username-note">You can only change your username once a week</small><br>
${canChange?html`<form method="post" action="/settings" data-turbo="false">${csrf(v)}${hidden('settings_action','username')}<div class="form__group"><div class="settings__field-grid settings__username-fields">${settingsField('Username','user[username]','username',false,false,u.username)}</div></div><input type="submit" name="commit" value="Change username" class="accent-block__button"></form>`:html`<p>Username changes are available once a week. You can change yours again <time datetime="${next.toISOString()}">${date}</time>.</p>`}</div>
<div class="accent-block"><div class="accent-block__charm"><ion-icon role="img" name="key"></ion-icon> Password</div>
<form method="post" action="/settings" data-turbo="false">${csrf(v)}${hidden('settings_action','password')}<div class="form__group"><div class="settings__field-grid settings__password-fields">${settingsField('Current password','user[current_password]','current-password',true)}${settingsField('New password','user[password]','new-password',true)}${settingsField('Confirm new password','user[password_confirmation]','new-password',true)}</div></div><input type="submit" name="commit" value="Change password" class="accent-block__button"></form></div>
<div class="accent-block danger spaced"><div class="accent-block__charm"><ion-icon role="img" name="warning"></ion-icon> Danger Zone</div>
<p>This action will delete your account forever. Enter your current password to continue.</p>
<form method="post" action="/settings" data-turbo="false" data-controller="account-deletion" data-action="submit->account-deletion#confirm" data-turbo-confirm="Delete your account? You will be signed out immediately.">${csrf(v)}${hidden('_method','delete')}<div class="form__group"><div class="settings__field-grid settings__delete-account-fields">${settingsField('Current password','account[password]','current-password',true,true)}</div></div><input type="submit" name="commit" value="Delete Account" class="danger-button accent-block__button"></form></div>`}`;
}
export const accountPages={'account-signup':signup,'account-reset-request':resetRequest,'account-reset-complete':resetComplete,'account-settings':settings};
