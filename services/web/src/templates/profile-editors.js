import {html,profileMarkup,userPath,hidden} from './html.js';
import {markdownSource} from '../profile-content.js';
export function markdownEditor(v){return html`<div class="details__container markdown-editor" data-controller="markdown-editor">
<form method="post" action="/users/${v.targetUser.id}" data-action="submit->markdown-editor#confirmSave formdata->markdown-editor#prepareFormData">
${hidden('authenticity_token',v.csrf)}${hidden('_method','patch')}
<div class="task-tools small"><div class="left"><a href="${userPath(v.targetUser)}" title="Cancel editing" class="no-underline">Cancel</a></div>
<div class="right"><a href="${userPath(v.targetUser)}/toggle_details_mode" data-turbo="false">HTML Mode</a><input type="submit" name="commit" value="Save"></div></div>
    <div class="markdown-editor__surface">
      <div class="markdown-editor__toolbar" role="toolbar" aria-label="Markdown formatting">
        <button type="button" title="Bold" aria-label="Bold" data-action="markdown-editor#bold"><strong>B</strong></button>
        <button type="button" title="Italic" aria-label="Italic" data-action="markdown-editor#italic"><em>I</em></button>
        <button type="button" class="markdown-editor__underline" title="Underline" aria-label="Underline" data-action="markdown-editor#underline">U</button>
        <button type="button" title="Strikethrough" aria-label="Strikethrough" data-action="markdown-editor#strikethrough"><s>S</s></button>
        <span class="markdown-editor__divider" aria-hidden="true"></span>
        <button type="button" title="Heading" aria-label="Heading" data-action="markdown-editor#heading">H</button>
        <button type="button" title="Link" aria-label="Link" data-action="markdown-editor#link"><ion-icon role="presentation" name="link-outline"></ion-icon></button>
        <button type="button" title="Inline code" aria-label="Inline code" data-action="markdown-editor#inlineCode"><ion-icon role="presentation" name="code-slash-outline"></ion-icon></button>
        <button type="button" title="Quote" aria-label="Quote" data-action="markdown-editor#quote"><ion-icon role="presentation" name="chevron-forward-outline"></ion-icon></button>
        <button type="button" title="Bulleted list" aria-label="Bulleted list" data-action="markdown-editor#bulletedList"><ion-icon role="presentation" name="list-outline"></ion-icon></button>
        <span class="markdown-editor__divider" aria-hidden="true"></span>
        <label class="markdown-editor__color-control" title="Selected text color">
          <ion-icon role="presentation" name="text-outline"></ion-icon>
          <input type="color" value="#ffb300" aria-label="Selected text color" data-action="change->markdown-editor#selectedTextColor">
        </label>
        <label class="markdown-editor__color-control" title="Profile accent color">
          <ion-icon role="presentation" name="color-palette-outline"></ion-icon>
          <input type="color" value="#ffb300" aria-label="Profile accent color" data-markdown-editor-target="themeColor" data-theme-variable="accent" data-action="input->markdown-editor#themeColor">
        </label>
        <label class="markdown-editor__color-control" title="Profile page background">
          <ion-icon role="presentation" name="browsers-outline"></ion-icon>
          <input type="color" value="#212121" aria-label="Profile page background" data-markdown-editor-target="themeColor" data-theme-variable="bg" data-action="input->markdown-editor#themeColor">
        </label>
        <label class="markdown-editor__color-control" title="Profile header and panel background">
          <ion-icon role="presentation" name="albums-outline"></ion-icon>
          <input type="color" value="#2b2b2b" aria-label="Profile header and panel background" data-markdown-editor-target="themeColor" data-theme-variable="accent-bg" data-action="input->markdown-editor#themeColor">
        </label>
        <label class="markdown-editor__color-control" title="Profile text color">
          <ion-icon role="presentation" name="document-text-outline"></ion-icon>
          <input type="color" value="#dcdcdc" aria-label="Profile text color" data-markdown-editor-target="themeColor" data-theme-variable="text" data-action="input->markdown-editor#themeColor">
        </label>
      </div>

      <textarea name="user[details]" id="user_details" maxlength="50000" data-markdown-editor-target="input" data-action="input->markdown-editor#updateCount" spellcheck="true" aria-label="Profile description in Markdown">${markdownSource(v.details)}</textarea>

      <div class="markdown-editor__footer">
        <span>Markdown formatting supported.</span>
        <span><span data-markdown-editor-target="count">0</span> / 50000</span>
      </div>
    </div>
</form></div>`;}
export function advancedEditor(v){return html`<div data-controller="hotkeys wall-editor"
     data-hotkeys-bindings-value='{"ctrl+s, command+s": "wall-editor#save:prevent"}'
     data-wall-editor-source-value="${v.details}"
     data-wall-editor-save-url-value="${'/users/'+v.targetUser.id}"
     class="wall_editor"
>
  <template data-wall-editor-target="template">${profileMarkup(v.editorHTML)}</template>

  <div class="task-tools small">
    <div class="left">
      <a href="${userPath(v.targetUser)}" title="Cancel editing" class="no-underline" data-turbo="false">
        Back
      </a>
    </div>
    <div class="right">
      <a href="${userPath(v.targetUser)}/toggle_details_mode" data-turbo="false">Simple Mode</a>
      <a href="#" data-action="click->wall-editor#save:prevent" class="no-underline button-like">
        <span data-wall-editor-target="saveBtnText">Save</span>
      </a>
    </div>
  </div>

  <turbo-frame id="wall" src="/users/${v.targetUser.id}/details" class="preview" data-wall-editor-target="preview"></turbo-frame>

  <div class="full-width editors">
    <div class="accent-block tight-top">
      <div class="accent-block__charm inline">
        <ion-icon role="presentation" name="information-circle"></ion-icon>
        <div class="split">
          <span>${v.targetUser.username}.html</span>
          <a href="https://www.htmldog.com/guides/html/beginner/tags/" target="_blank" rel="noopener">Learn HTML</a>
        </div>
      </div>
      <hey-monaco-editor class="editor" data-wall-editor-target="editor" language="html"></hey-monaco-editor>
      <details class="editor-hints">
        <summary>Hints</summary>
        <ul>
          <li>
            Live updating time: <br/>
            <code>&lt;relative-time datetime="2024-08-01T05:07:19Z">&lt;/relative-time></code>
          </li>
          <li>
            Two columns: <br/>
            <code>&lt;div class="split">...content...&lt;/div></code>
          </li>
          <li>
            <sparkly-text style="--sparkly-text-color: var(--accent);">Sparkles:</sparkly-text> <br/>
            <code>&lt;sparkly-text style="--sparkly-text-color: orange">Hello sparkles&lt;/sparkly-text></code>
          </li>
        </ul>
      </details>
    </div>

    <div class="accent-block">
      <div class="accent-block__charm inline">
        <ion-icon role="presentation" name="information-circle"></ion-icon>
        <div class="split">
          <span>${v.targetUser.username}.css</span>
          <a href="https://developer.mozilla.org/en-US/docs/Learn/CSS/First_steps/Getting_started" target="_blank" rel="noopener">Learn CSS</a>
        </div>
      </div>
      <hey-monaco-editor class="editor" data-wall-editor-target="csseditor" language="css"></hey-monaco-editor>
      <details class="editor-hints">
        <summary>Hints</summary>
        <ul>
          <li>
            Accent colour: <br/>
            <code>body { --accent: #ff0000; }</code>
          </li>
          <li>
            Text colour: <br/>
            <code>body { --text: #ff0000; }</code>
          </li>
          <li>
            Background colour: <br/>
            <code>body { --bg: #ff0000; --accent-bg: #ff0000; }</code>
          </li>
          <li>
            Change heading: <br/>
            <code>.header__age-warning { font-size: 0; }<br/>
              .header__age-warning::after { content: 'Your Text'; font-size: 0.9rem; }</code>
          </li>
        </ul>
      </details>
    </div>
  </div>
</div>`;}
