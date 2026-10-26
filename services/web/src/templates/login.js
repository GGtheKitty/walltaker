import {html, empty, icon} from './html.js';

export function login(view) {
  return html`${view.flags.invite_only ? empty : html`<div data-turbo-prefetch="false" class="task-tools"><div class="right"><a href="/login/evilly" class="no-underline" data-turbo="false">${icon('nuclear')} Do something evil</a></div></div>`}
    <h2>${icon('person')} Log In</h2>${view.error ? html`<div class="error_messages" role="alert">${view.error}</div>` : empty}
    <form method="post" action="/session" data-turbo="false"><input type="hidden" name="authenticity_token" value="${view.csrf}" autocomplete="off">
      <div class="field"><label for="email">Email or username</label><br><input type="text" name="email" id="email" value="${view.email || ''}" autocomplete="username"></div>
      <div class="field"><label for="password">Password</label><br><input type="password" name="password" id="password" autocomplete="current-password"></div>
      <div class="field checkbox"><input type="checkbox" name="keep_me_logged_in" id="keep_me_logged_in" value="1"><label for="keep_me_logged_in">Keep me logged in for 2 weeks</label></div>
      <input type="submit" name="commit" value="Log In"><br><br><small><a href="/i-forgor">I forgot my password, please save me ever benevolent walltaker god.</a></small></form><br>`;
}
