import { createTokenIssuer } from '../../e621-media/src/token.js';

const TYPES = ['horny', 'came', 'disgust', 'ok'];

export function online(row, connected, now = Date.now()) {
  const window = row.last_ping_user_agent?.includes('widgetExtension') ? 1200000 : 60000;
  return connected || (row.last_ping_user_agent != null && row.last_ping != null &&
    new Date(row.last_ping).getTime() > now - window);
}

export function createSerializer({ secretKeyBase, baseUrl }) {
  const issue = createTokenIssuer(secretKeyBase);
  const base = baseUrl.replace(/\/$/, '');
  return (row, { connected = false, detail = false, now = Date.now() } = {}) => {
    const token = issue(row.post_url);
    const result = {};
    for (const name of ['id', 'expires', 'terms', 'blacklist', 'post_url', 'post_thumbnail_url', 'created_at', 'updated_at', 'response_text']) {
      result[name] = name === 'id' ? Number(row[name]) : row[name];
    }
    result.response_type = row.response_type == null ? null : (TYPES[row.response_type] ?? null);
    result.post_url_backup = token ? `${base}/e621-media?token=${encodeURIComponent(token)}` : null;
    result.username = row.username;
    if (detail && row.set_by_username != null) result.set_by = row.set_by_username;
    result.online = online(row, connected, now);
    if (row.post_description?.trim()) {
      const chars = Array.from(row.post_description);
      result.post_description = chars.length > 100 ? chars.slice(0, 97).join('') + '...' : row.post_description;
    }
    if (detail) result.url = `${base}/links/${row.id}.json`;
    return result;
  };
}

export function widget(row, baseUrl) {
  const layout = (size) => ({
    size,
    styles: { colours: { background_colour: { color: '#00000066' } } },
    layers: [{ rows: [{ height: 12, cells: [{ width: 12, image: { data_ref: 'wallpaper' } }] }] }],
  });
  const large = layout('large');
  if (row.set_by_username != null) large.layers.push({ rows: [
    { height: 10 },
    { height: 2, cells: [{ width: 12, background_color_style: 'background_colour', padding: 0.5,
      text: { string: `From: ${row.set_by_username}` } }] },
  ] });
  return {
    name: `Walltaker Link ${row.id}`,
    description: `Shows the current wallpaper for ${row.username}'s link.`,
    version: 1,
    data: { content_url: `${baseUrl.replace(/\/$/, '')}/links/${row.id}`, wallpaper: row.post_thumbnail_url || '' },
    layouts: { small_layout: layout('small'), large_layout: large },
  };
}
