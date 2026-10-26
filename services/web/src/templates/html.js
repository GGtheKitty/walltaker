import {sanitizeProfileHTML} from '../profile-content.js';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
let sanitizer;
// JavaScript templates escape every interpolated value. Only fragments created
// by this tag can contain markup; backend hashes can never declare safe HTML.
class Fragment { constructor(value) { this.value = value; } toString() { return this.value; } }
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const interpolate = value => value instanceof Fragment ? value.value : Array.isArray(value) ? value.map(interpolate).join('') : value == null || value === false ? '' : escape(value);
export function html(strings, ...values) { return new Fragment(strings.reduce((output, part, i) => output + part + (i < values.length ? interpolate(values[i]) : ''), '')); }
export const empty = html``;
export const json = value => JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
export const userPath = user => '/users/' + encodeURIComponent(user?.username || '');
export function safeUrl(value, fallback = '#') {
  if (typeof value !== 'string' || /[\\\x00-\x20\x7f]/.test(value) || value.startsWith('//')) return fallback;
  if (value.startsWith('/')) return value;
  try { const url = new URL(value); if (['http:','https:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch {}
  return fallback;
}
export const icon = (name, className = '') => html`<ion-icon role="presentation" name="${name}" class="${className}"></ion-icon>`;
export function timeAgo(value, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'less than a minute';
  if (seconds < 3600) return Math.round(seconds / 60) + ' minutes';
  if (seconds < 86400) return Math.round(seconds / 3600) + ' hours';
  return Math.round(seconds / 86400) + ' days';
}
export const plural = (count, word) => `${Number(count) || 0} ${word}${Number(count) === 1 ? '' : 's'}`;
export const richText = value => {
  sanitizer ||= require('sanitize-html');
  return new Fragment(sanitizer(String(value ?? ''),{allowedTags:['p','br','strong','b','em','i','u','s','a','blockquote','ul','ol','li','code','pre','small','span'],allowedAttributes:{a:['href','title','target','rel']},allowedSchemes:['http','https','mailto'],allowProtocolRelative:false,transformTags:{a:sanitizer.simpleTransform('a',{rel:'noopener noreferrer'})}}));
};
export const paragraphs = value => richText(String(value ?? '').replace(/\r\n/g,'\n').split(/\n{2,}/).map(text => '<p>'+text.replaceAll('\n','<br>')+'</p>').join(''));
export const hidden = (name,value) => html`<input type="hidden" name="${name}" value="${value}" autocomplete="off">`;
export const checked = value => value === true || value === 1 || value === '1' || value === 'true' ? html`checked` : empty;
export function button(label, action, csrf, {method = 'post', className = '', frame = '', confirm = '', disabled = false, title = '', turbo} = {}) {
  return html`<form class="button_to" method="${method === 'get' ? 'get' : 'post'}" action="${safeUrl(action)}" ${frame ? html`data-turbo-frame="${frame}"` : empty} ${confirm ? html`data-turbo-confirm="${confirm}"` : empty} ${typeof turbo==='boolean'?html`data-turbo="${turbo?'true':'false'}"`:empty}>
    ${method === 'get' ? empty : html`<input type="hidden" name="authenticity_token" value="${csrf}" autocomplete="off">`}
    ${['get','post'].includes(method) ? empty : html`<input type="hidden" name="_method" value="${method}">`}
    <button type="submit" class="${className}" title="${title}" ${disabled ? html`disabled` : empty}>${label}</button></form>`;
}

// Only the dedicated profile sanitizer can produce this HTML fragment.
export const profileMarkup = value => new Fragment(sanitizeProfileHTML(value));
