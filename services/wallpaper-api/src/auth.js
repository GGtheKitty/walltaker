export function createSessionViewer({resolveSession}) {
  if(typeof resolveSession!=='function')throw Error('Native session resolver is required');
  return async headers=>headers.cookie?(await resolveSession(headers.cookie)).user?.id || null:null;
}

export function createKeyAuthenticator(pool) {
  return async (key) => {
    if (typeof key !== 'string' || !key.trim() || key.length > 256) return null;
    // The definer function exposes a matching active ID, never the stored key.
    return (await pool.query('SELECT public.walltaker_api_authenticate($1) AS id', [key])).rows[0].id;
  };
}
