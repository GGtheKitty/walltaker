import { createHmac } from 'node:crypto';

export function createPresenceReporter({ secretKeyBase, railsUrl, fetchImpl = fetch }) {
  const token = createHmac('sha256', secretKeyBase).update('walltaker:wallpaper-api:presence:v1').digest('hex');
  return async (id, requestHeaders) => {
    const headers = { authorization: `Bearer ${token}` };
    for (const name of ['user-agent', 'joihow', 'user_agent', 'wallpaper-engine-client']) {
      if (requestHeaders[name]) headers[name] = requestHeaders[name];
    }
    const response = await fetchImpl(`${railsUrl}/_internal/wallpaper-presence/${id}.json`, {
      method: 'POST', headers, signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Presence adapter returned ${response.status}`);
    await response.arrayBuffer();
  };
}
