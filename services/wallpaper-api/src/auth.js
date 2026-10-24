import { createHmac } from 'node:crypto';

export const viewerToken = (secret) => createHmac('sha256', secret).update('walltaker:wallpaper-api:viewer:v1').digest('hex');

// Native sessions include legacy cookie verification. The callback remains
// available for deployments that have not enabled the browser migration.
export function createSessionViewer({ secretKeyBase, railsUrl, resolveSession, fetchImpl = fetch }) {
  return async (headers) => {
    if (!headers.cookie) return null;
    if (resolveSession) return (await resolveSession(headers.cookie)).user?.id || null;
    const response = await fetchImpl(`${railsUrl}/_internal/api-viewer.json`, {
      headers: { authorization: `Bearer ${viewerToken(secretKeyBase)}`, cookie: headers.cookie },
      signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Session viewer unavailable');
    return (await response.json()).user_id;
  };
}

export function createKeyAuthenticator(pool) {
  return async (key) => {
    if (typeof key !== 'string' || !key.trim() || key.length > 256) return null;
    // The definer function exposes a matching active ID, never the stored key.
    return (await pool.query('SELECT public.walltaker_api_authenticate($1) AS id', [key])).rows[0].id;
  };
}
