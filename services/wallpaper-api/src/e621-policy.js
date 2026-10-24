import { CommandError } from './updates.js';

export const validPostId = (id) => (typeof id === 'string' || Number.isSafeInteger(id)) &&
  /^[1-9]\d{0,18}$/.test(String(id)) && BigInt(id) <= 9223372036854775807n;

export function buildSearch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CommandError(422, 'Invalid search.');
  const tags = input.tags ?? '';
  const limit = input.limit ?? 15;
  if (typeof tags !== 'string' || tags.length > 8192 || !Number.isInteger(limit) || limit < 1 || limit > 150) {
    throw new CommandError(422, 'Invalid search tags or limit.');
  }
  for (const cursor of [input.after, input.before]) {
    if (cursor != null && cursor !== '' && !validPostId(cursor)) throw new CommandError(422, 'Invalid search cursor.');
  }
  // The previous Rails request appended before last when both were supplied.
  const page = input.before ? `a${input.before}` : input.after ? `b${input.after}` : null;
  if (input.policy == null) return { tags, limit, page, suffix: '', blacklist: '', videos: true };
  const policy = input.policy;
  if (typeof policy !== 'object' || Array.isArray(policy) ||
      (policy.blacklist != null && (typeof policy.blacklist !== 'string' || policy.blacklist.length > 8192)) ||
      (policy.theme != null && (typeof policy.theme !== 'string' || policy.theme.length > 255)) ||
      (policy.min_score != null && (!Number.isInteger(policy.min_score) || policy.min_score < 0 || policy.min_score > 300)) ||
      typeof policy.can_show_videos !== 'boolean' || typeof policy.is_kink_aligned !== 'boolean' ||
      !Array.isArray(policy.kinks) || policy.kinks.length > 1000 ||
      policy.kinks.some((tag) => typeof tag !== 'string' || tag.length > 100)) {
    throw new CommandError(422, 'Invalid search policy.');
  }
  const blacklist = (policy.blacklist || '').toLowerCase().replace(/[^a-z_()\d: ]/g, '');
  const denied = new Set(blacklist.split(/\s+/).filter(Boolean));
  const query = [...new Set(tags.split(/\s+/).filter((tag) => tag && !denied.has(tag)))].join(' ');
  let suffix = '-flash ' + (policy.theme || '');
  if (blacklist) suffix += ' ' + blacklist.split(/\s+/).filter(Boolean).map((tag) => '-' + tag).join(' ');
  if (policy.min_score) suffix += ' score:>' + policy.min_score;
  if (!policy.can_show_videos) suffix += ' -animated';
  if (policy.is_kink_aligned && !query.split(' ').some((tag) => policy.kinks.includes(tag))) {
    suffix += ' ' + policy.kinks.map((tag) => '~' + tag).join(' ');
  }
  return { tags: query + ' ' + suffix, limit, page, suffix, blacklist, videos: policy.can_show_videos };
}

// Cache hits must pass the same media policy as fresh upstream responses.
export function filterPosts(posts, videos) {
  return posts.filter((post) => post && typeof post === 'object' && validPostId(post.id) &&
    post.file && typeof post.file.ext === 'string' &&
    (videos || ['png', 'jpg', 'bmp', 'webp'].includes(post.file.ext))).map((post) => ({
    ...post, preview: post.preview || { url: null }, sample: post.sample || { url: null },
  }));
}
