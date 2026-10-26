import {randomUUID} from 'node:crypto';

const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,255}$/.test(value);
export async function startVisit(ctx) {
  if (ctx.req.method === 'HEAD' || ctx.prefetch || /bot|crawler|spider/i.test(ctx.req.headers['user-agent'] || '')) return null;
  let visitToken = ctx.cookies.values.ahoy_visit, visitorToken = ctx.cookies.values.ahoy_visitor;
  const proof = () => ({visit_token:visitToken, visitor_token:visitorToken, ip:ctx.ip});
  if (validToken(visitToken) && validToken(visitorToken)) {
    const found = await ctx.call('activity', 'visit', proof());
    if (found.ban) return null;
    if (found.visit) return {...proof(),id:found.visit.id};
  }
  visitToken = randomUUID();
  if (!validToken(visitorToken)) visitorToken = randomUUID();
  const ua = (ctx.req.headers['user-agent'] || '').slice(0, 8192);
  const browser = /Edg\//.test(ua) ? 'Microsoft Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'GNU/Linux' : null;
  let referringDomain = null;
  try { referringDomain = new URL(ctx.req.headers.referer).hostname; } catch {}
  const result = await ctx.call('activity', 'visit-create', {data:{...proof(), user_id:ctx.auth.user?.id || null, started_at:new Date().toISOString(), user_agent:ua, browser, os, device_type:/Mobile|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop', landing_page:ctx.originalUrl, referrer:ctx.req.headers.referer || null, referring_domain:referringDomain}});
  if (result.ban) return null;
  ctx.cookies.set('ahoy_visit', visitToken, {maxAge:4*3600, httpOnly:false});
  ctx.cookies.set('ahoy_visitor', visitorToken, {maxAge:2*365*86400, httpOnly:false});
  return {...proof(),id:result.visit?.id};
}

export async function track(ctx, name, properties) {
  if (!ctx.visit) return;
  await ctx.call('activity', 'event-create', {...ctx.visit, user_id:ctx.auth.user?.id || null, name, properties, time:new Date().toISOString(), request_key:'event:' + randomUUID()});
}
