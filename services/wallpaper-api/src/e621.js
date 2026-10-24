import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { buildSearch, filterPosts, validPostId } from './e621-policy.js';
import { CommandError } from './updates.js';

export class E621Unavailable extends CommandError {
  constructor() { super(503, 'e621 search temporarily unavailable.'); }
}

export function createE621Service({ store, userAgent, fetchImpl = fetch, sleep = setTimeout, now = Date.now,
  maxWait = 8000, timeout = 8000, maxBytes = 16 * 1024 * 1024 }) {
  if (!userAgent || /[\r\n]/.test(userAgent)) throw new Error('A valid E621_USER_AGENT is required');
  const pending = new Map();
  const keyFor = (value) => 'e621:v1:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const slot = async () => {
    const started = now();
    for (;;) {
      const wait = await store.takeSlot();
      if (wait <= 0) return;
      if (now() - started + wait > maxWait) throw new E621Unavailable();
      await sleep(wait);
    }
  };
  const request = async (path, missingAllowed = false) => {
    await slot();
    // Callers supply IDs/tags only; the origin and endpoints are fixed here.
    const response = await fetchImpl('https://e621.net' + path, {
      headers: { 'user-agent': userAgent, accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404 && missingAllowed) return null;
      if ([429, 503].includes(response.status)) {
        const header = response.headers.get('retry-after');
        const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now();
        await store.pause(Math.min(300000, Math.max(1000, Number.isFinite(delay) ? delay : 30000)));
      }
      throw new E621Unavailable();
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel(); throw new E621Unavailable();
    }
    const chunks = [];
    let size = 0;
    if (!response.body) throw new E621Unavailable();
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new E621Unavailable();
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new E621Unavailable(); }
  };
  const cached = async (key, load) => {
    const hit = await store.get(key);
    if (hit !== null) return hit;
    if (pending.has(key)) return pending.get(key);
    const work = load();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
  const protect = async (work) => {
    try { return await work(); }
    catch (error) { if (error instanceof CommandError) throw error; throw new E621Unavailable(); }
  };
  const search = async (input) => {
    const query = buildSearch(input);
    const key = keyFor(['search', query.tags, query.page, query.limit, query.videos]);
    return protect(async () => {
      const posts = await cached(key, async () => {
        const params = new URLSearchParams({ tags: query.tags });
        if (query.page) params.set('page', query.page);
        params.set('limit', String(query.limit));
        const body = await request('/posts.json?' + params);
        if (!body || !Array.isArray(body.posts)) throw new E621Unavailable();
        const result = filterPosts(body.posts, query.videos);
        await store.set(key, result, !result.length || /order:random/i.test(query.tags) ? 60 : 2700);
        return result;
      });
      if (!Array.isArray(posts)) throw new E621Unavailable();
      return filterPosts(posts, query.videos);
    });
  };
  return {
    query: buildSearch,
    search,
    async select({ post_id, policy }) {
      if (!validPostId(post_id)) throw new CommandError(422, 'Invalid post ID.');
      const posts = await search({ tags: `id:${post_id}`, limit: 1, policy });
      return posts.find((post) => String(post.id) === String(post_id) && typeof post.file.url === 'string' && post.file.url) || null;
    },
    async post({ post_id }) {
      if (!validPostId(post_id)) throw new CommandError(422, 'Invalid post ID.');
      return protect(async () => cached(keyFor(['post', String(post_id)]), async () => {
        const body = await request(`/posts/${post_id}.json`, true);
        const post = body == null ? null : filterPosts([body.post], true)[0];
        if (body != null && (!post || String(post.id) !== String(post_id))) throw new E621Unavailable();
        await store.set(keyFor(['post', String(post_id)]), { post: post || null }, post ? 2700 : 60);
        return { post: post || null };
      }));
    },
  };
}
