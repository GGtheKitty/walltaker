import {Router} from './router.js';
import {addWallpaperRoutes} from './wallpaper-routes.js';
import {addProfileRoutes} from './profile-routes.js';
import {addAccountRoutes} from './account-routes.js';
import {addSocialRoutes} from './social-routes.js';
import {addTrackerRoutes} from './tracker-routes.js';
import {addModerationRoutes} from './moderation-routes.js';
import {addBlazerRoutes} from './blazer-routes.js';
import {HttpError} from './errors.js';
import {dashboard, renderPage} from './pages.js';
import {startVisit, track} from './activity.js';

const string = (value, limit) => typeof value === 'string' && value.length <= limit ? value : '';
async function withVisit(ctx) { ctx.visit = await startVisit(ctx); }
async function loginPage(ctx) {
  await withVisit(ctx);
  await renderPage(ctx, {template:'session/new', controller:'session', action:'new', parameters:{email:string(ctx.query.email, 320)}});
  await track(ctx, 'visit:' + ctx.path, {_url:ctx.originalUrl});
}
async function login(ctx) {
  await withVisit(ctx);
  const identifier = string(ctx.body.email, 320), password = string(ctx.body.password, 4096);
  const result = await ctx.call('browser', 'login', {identifier, password, remember:typeof ctx.body.keep_me_logged_in === 'string' && ctx.body.keep_me_logged_in !== '', ip:ctx.ip});
  if (result.user) {
    ctx.transition(result);
    if (ctx.visit) await ctx.call('activity', 'visit-authenticate', {...ctx.visit, user_id:result.user.id});
    await track(ctx, 'regular:logged_in', {_action:'session#create'});
    ctx.flash.set('notice', 'Logged in!');
    return ctx.redirect('/');
  }
  await track(ctx, 'nefarious:failed_to_log_in', {_action:'session#create', identifier});
  return renderPage(ctx, {template:'session/new', controller:'session', action:'create', status:422, assigns:{error:'Wrong email, username, or password.'}, parameters:{email:identifier}});
}
async function logout(ctx) {
  // Preserve the existing GET logout link while excluding cross-site and
  // speculative navigations. Unsafe forms always use the normal CSRF service.
  if (ctx.req.method === 'HEAD' || ctx.prefetch) return ctx.redirect('/');
  if (ctx.req.method === 'GET') {
    let foreign = false;
    if (ctx.req.headers.referer) { try { foreign = new URL(ctx.req.headers.referer).origin !== new URL(ctx.config.baseUrl).origin; } catch { foreign = true; } }
    if (ctx.req.headers['sec-fetch-site'] === 'cross-site' || foreign || ctx.req.headers.origin && ctx.req.headers.origin !== new URL(ctx.config.baseUrl).origin) throw new HttpError(403, 'Please log out from Walltaker.');
  }
  await withVisit(ctx);
  await track(ctx, 'regular:logged_out', {_action:'session#destroy'});
  ctx.transition(await ctx.call('browser', 'logout', {ip:ctx.ip}));
  ctx.flash.set('notice', 'Logged out!');
  return ctx.redirect('/');
}
async function evilLogin(ctx) {
  if (ctx.req.method === 'HEAD' || ctx.prefetch) return ctx.redirect('/login');
  let foreign = ctx.req.headers['sec-fetch-site'] === 'cross-site';
  for (const value of [ctx.req.headers.origin,ctx.req.headers.referer]) if (value) {
    try { foreign ||= new URL(value).origin !== new URL(ctx.config.baseUrl).origin; } catch { foreign = true; }
  }
  if (foreign) throw new HttpError(403,'Please log in from Walltaker.');
  await withVisit(ctx);
  try { ctx.transition(await ctx.call('browser','evil',{ip:ctx.ip})); }
  catch (error) {
    if (!(error instanceof HttpError) || ![403,404].includes(error.status)) throw error;
    ctx.flash.set('alert',error.message);return ctx.redirect('/login');
  }
  ctx.flash.set('notice',"You're logged into a shared account... be evil");
  return ctx.redirect('/');
}

export function createRoutes() {
  const router = new Router();
  router.add('GET', '/up', ctx => ctx.send(200, JSON.stringify({status:'ok', service:'node-web'}), {'content-type':'application/json'}), {public:true});
  router.add('GET', '/', async ctx => { await withVisit(ctx); await dashboard(ctx); await track(ctx, 'visit:' + ctx.path, {_url:ctx.originalUrl}); });
  for (const path of ['/login','/session/new']) router.add('GET', path, loginPage);
  router.add('POST', '/session', login);
  for (const method of ['GET','POST']) router.add(method,'/login/evilly',evilLogin);
  for (const method of ['GET','POST','DELETE']) router.add(method, '/logout', logout);
  router.add('DELETE', '/session/:id', logout);
  for (const [path, operation] of [['/api/mascot/next','mascot'],['/api/pervert/toggle','pervert']]) router.add('POST',path,async ctx => {
    if (!await ctx.authorize('surrendered')) return;
    await ctx.call('accounts',operation,{actor_id:ctx.auth.user.id,surrender_id:ctx.auth.surrender?.id || null,request_key:`web:${ctx.requestId}:${operation}`});
    ctx.auth = await ctx.call('browser','context',{path:ctx.path,ip:ctx.ip});
    ctx.applyCookies(ctx.auth);
    return renderPage(ctx,{template:'mascot'});
  });
  for (const status of [404,422,500]) router.add('GET', '/' + status, () => { throw new HttpError(status, status === 404 ? 'This page could not be found.' : status === 422 ? 'Your request could not be completed. Please try again.' : 'Please try again in a moment.'); }, {public:true});
  router.add('GET','/errors/not_found',()=>{throw new HttpError(404,'This page could not be found.');},{public:true});
  router.add('GET','/errors/server_error',()=>{throw new HttpError(500,'Please try again in a moment.');},{public:true});
  addWallpaperRoutes(router);
  addAccountRoutes(router);
  addProfileRoutes(router);
  addSocialRoutes(router);
  addTrackerRoutes(router);
  addModerationRoutes(router);
  addBlazerRoutes(router);
  return router;
}
