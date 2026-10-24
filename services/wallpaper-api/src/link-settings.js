import { CommandError } from './updates.js';

export class LinkValidationError extends CommandError {
  constructor(errors) { super(422, 'Link settings are invalid.'); this.errors = errors; }
}
export const validId = (id) => (typeof id === 'string' || Number.isSafeInteger(id)) &&
  /^\d{1,19}$/.test(String(id)) && BigInt(id) > 0n && BigInt(id) <= 9223372036854775807n;
export const settingFields = ['expires', 'terms', 'blacklist', 'friends_only', 'never_expires', 'theme', 'min_score', 'custom_url'];
export const abilities = ['can_show_videos', 'can_be_set_by_porn_bot', 'can_be_set_by_lizard', 'is_kink_aligned', 'is_master_only'];
const falseValues = [false, 0, '0', 'f', 'F', 'false', 'FALSE', 'off', 'OFF'];
export const boolean = (value) => value == null || value === '' ? null : !falseValues.includes(value);

export function normalizeSettings(attributes, previous, setCount) {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes) ||
      Object.keys(attributes).some((key) => !settingFields.includes(key))) {
    throw new LinkValidationError({ base: ['Unknown link settings.'] });
  }
  const result = { expires: null, terms: null, blacklist: null, friends_only: null,
    never_expires: false, theme: null, min_score: null, custom_url: null, ...previous };
  const errors = {};
  const add = (key, message) => { (errors[key] ||= []).push(message); };
  for (const key of settingFields) {
    if (!(key in attributes)) continue;
    const value = attributes[key];
    if (['friends_only', 'never_expires'].includes(key)) {
      if (value != null && !['string', 'boolean', 'number'].includes(typeof value)) add(key, 'is invalid');
      else result[key] = boolean(value);
    } else if (key === 'min_score') {
      result[key] = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : null;
    } else if (key === 'expires') {
      if (value == null || value === '') result.expires = null;
      else if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d(?:T| )/.test(value) || !Number.isFinite(Date.parse(value))) add(key, 'is invalid');
      else result.expires = new Date(value).toISOString();
    } else if (value == null || typeof value === 'string') result[key] = value;
    else add(key, 'is invalid');
  }
  if (setCount < 300 || result.custom_url === '') result.custom_url = null;
  if (!result.never_expires && !result.expires) add('expires', "can't be blank");
  if (!Number.isInteger(result.min_score)) add('min_score', 'is not a number');
  else if (result.min_score < 0) add('min_score', 'must be greater than -1');
  else if (result.min_score > 300) add('min_score', 'must be less than 301');
  if (/\s/.test(result.theme || '')) add('theme', 'must be only 1 tag.');
  if (result.theme?.includes(':')) add('theme', 'must not contain filter or sort tags. (like score:>30) Use the Minimum Score setting instead.');
  if (result.custom_url != null && !/^[a-zA-Z_-]*$/.test(result.custom_url)) add('custom_url', 'must be a valid in a url, with no spaces or special characters');
  for (const key of ['terms', 'blacklist', 'theme', 'custom_url']) {
    if (result[key] != null && Array.from(result[key]).length > 255) add(key, 'is too long (maximum is 255 characters)');
  }
  if (Object.keys(errors).length) throw new LinkValidationError(errors);
  return Object.fromEntries(settingFields.map((key) => [key, result[key]]));
}
