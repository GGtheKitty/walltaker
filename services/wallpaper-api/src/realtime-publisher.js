import { createSerializer } from './payload.js';

export function createRealtimePublisher({ redis, repository, store, readUser, secretKeyBase, baseUrl, nativeRender }) {
  const serialize = createSerializer({ secretKeyBase, baseUrl });
  const publish = (stream, message) => redis.publish('__anycable__', JSON.stringify({ stream, data: JSON.stringify(message) }));
  const linkPayload = async (row) => {
    const connected = await store.connected([String(row.id)]);
    const result = serialize(row, { connected: connected.has(String(row.id)) });
    return { ...result, success: true, set_by: row.set_by_username ?? null, post_description: row.post_description };
  };
  if(typeof nativeRender!=='function')throw Error('Native broadcast renderer is required');
  const render=nativeRender;
  return {
    linkPayload,
    async deliver(job) {
      const split = job.indexOf(':');
      const kind = job.slice(0, split), id = job.slice(split + 1);
      if (kind === 'link' || kind === 'presence-link') {
        const row = await repository.find(id);
        await publish(`Link::${id}`, row ? await linkPayload(row) : { success: false, why: `Link ${id} does not exist.` });
        if (kind === 'presence-link') await render('link', id);
      } else if (kind === 'user') {
        const publicUser = await readUser({ username: id, audience: 'anonymous' });
        const friendUser = publicUser ? await readUser({ username: id, audience: 'friend' }) : null;
        for (const audience of ['anonymous', 'authenticated', 'friend', 'self']) {
          const user = audience === 'friend' ? friendUser : publicUser && { ...publicUser };
          if (user && audience !== 'anonymous') Object.assign(user, { authenticated: true, friend: audience === 'friend', self: audience === 'self' });
          await publish(`User::${id}::${audience}`, user ? { type: 'user', success: true, watching: true, user }
            : { type: 'user', success: false, why: `User ${id} does not exist.` });
        }
      } else if (kind === 'viewers') await render('viewers', id);
      else if (kind === 'dashboard-viewers') await render('dashboard-viewers', null);
      else throw new Error('Invalid realtime job');
    },
  };
}
