import {HttpError} from './errors.js';
const forbidden = new Set(['__proto__','prototype','constructor']);
const object = () => Object.create(null);

// Rails-style nested fields and hidden-checkbox last-value semantics. Reject
// conflicting shapes instead of allowing a scalar to become an object.
export function parseFields(entries) {
  const result = object(); let count = 0;
  for (const [name, value] of entries) {
    if (++count > 1000 || name.length > 256) throw new HttpError(413, 'Too many form fields.');
    const match = /^([^\[\]]+)((?:\[[^\[\]]*\])*)$/.exec(name);
    if (!match) throw new HttpError(400, 'Invalid form field.');
    const keys = [match[1], ...[...match[2].matchAll(/\[([^\]]*)\]/g)].map(m => m[1])];
    if (keys.length > 8 || keys.some(key => forbidden.has(key))) throw new HttpError(400, 'Invalid form field.');
    let node = result;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], last = i === keys.length - 1;
      if (key === '') {
        if (!Array.isArray(node)) throw new HttpError(400, 'Conflicting form fields.');
        if (last) { node.push(value); break; }
        if (keys[i + 1] === '') throw new HttpError(400, 'Invalid nested form array.');
        // Fields[][name], Fields[][value] describe one row until a key repeats.
        let child = node.at(-1);
        if (!child || Object.hasOwn(child, keys[i + 1])) { child = object(); node.push(child); }
        node = child;
      } else {
        if (Array.isArray(node)) throw new HttpError(400, 'Conflicting form fields.');
        if (last) {
          if (Object.hasOwn(node, key) && typeof node[key] === 'object') throw new HttpError(400, 'Conflicting form fields.');
          node[key] = value;
        } else {
          const array = keys[i + 1] === '';
          if (!Object.hasOwn(node, key)) node[key] = array ? [] : object();
          if (node[key] === null || typeof node[key] !== 'object' || Array.isArray(node[key]) !== array) throw new HttpError(400, 'Conflicting form fields.');
          node = node[key];
        }
      }
    }
  }
  return result;
}

function cleanJson(value, depth = 0, budget = {count:0}) {
  if (depth > 8 || ++budget.count > (budget.max || 5000)) throw new HttpError(413, 'Form is too complex.');
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => cleanJson(item, depth + 1, budget));
  const result = object();
  for (const [key, item] of Object.entries(value)) {
    if (forbidden.has(key)) throw new HttpError(400, 'Invalid form field.');
    result[key] = cleanJson(item, depth + 1, budget);
  }
  return result;
}

export async function readForm(req, {limit = 1048576, complexity = 5000} = {}) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return object();
  if (Number(req.headers['content-length']) > limit) { req.resume(); throw new HttpError(413, 'Form is too large.'); }
  const chunks = []; let size = 0;
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    size += chunk.length;
    if (size > limit) { req.resume(); throw new HttpError(413, 'Form is too large.'); }
    chunks.push(chunk);
  }
  if (!size) return object();
  const bytes = Buffer.concat(chunks), contentType = req.headers['content-type'] || '', type = contentType.split(';')[0].trim().toLowerCase();
  if (type === 'application/x-www-form-urlencoded') return parseFields(new URLSearchParams(bytes.toString('utf8')));
  if (type === 'application/json') {
    let value; try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON.'); }
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new HttpError(400, 'A JSON object is required.');
    return cleanJson(value,0,{count:0,max:complexity});
  }
  if (type === 'multipart/form-data') {
    let form;
    try { form = await new Response(bytes, {headers:{'content-type':contentType}}).formData(); } catch { throw new HttpError(400, 'Invalid multipart form.'); }
    return parseFields(form.entries());
  }
  throw new HttpError(415, 'Please submit a form or JSON object.');
}

export function formMethod(method, body) {
  if (method !== 'POST' || body._method == null) return method;
  if (typeof body._method !== 'string' || !['PUT','PATCH','DELETE'].includes(body._method.toUpperCase())) throw new HttpError(400, 'Invalid form method.');
  return body._method.toUpperCase();
}
