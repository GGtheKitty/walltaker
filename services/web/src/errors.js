export class HttpError extends Error {
  constructor(status, message, headers = {}) { super(message); this.status = status; this.headers = headers; }
}
const titles = {400:'Bad request',403:'Access denied',404:'Page not found',405:'Method not allowed',413:'Request too large',415:'Unsupported form',422:'Unable to submit form',429:'Too many requests',500:'Something went wrong',502:'Service unavailable',503:'Service unavailable',504:'Service unavailable'};
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function errorResponse(error, requestId, accept = '') {
  const status = error instanceof HttpError ? error.status : 500;
  const title = titles[status] || 'Unable to complete request';
  const message = error instanceof HttpError ? error.message : 'Please try again in a moment.';
  if (accept.includes('application/json') && !accept.includes('text/html')) return {status, type:'application/json; charset=utf-8', body:JSON.stringify({error:title,message,request_id:requestId})};
  return {status, type:'text/html; charset=utf-8', body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Walltaker</title><style>body{font:18px system-ui;max-width:42rem;margin:12vh auto;padding:1.5rem;line-height:1.6;color:#eee;background:#252830}a{color:#adc8ff}small{color:#bbb}</style></head><body><main><h1>${status} · ${escape(title)}</h1><p>${escape(message)}</p><p><a href="/">Return to Walltaker</a></p><small>Request ${escape(requestId)}</small></main></body></html>`};
}
