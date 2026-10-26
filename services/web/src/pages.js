import {nativeAssets, assetUrl} from './native-assets.js';
import {safeUrl} from './templates/html.js';
import {createTokenIssuer} from '../../e621-media/src/token.js';

export function mergeGraphs(...graphs) {
  const result = {};
  for (const graph of graphs) for (const [key, rows] of Object.entries(graph || {})) {
    if (!Array.isArray(rows)) continue;
    const merged = new Map((result[key] || []).map(row => [typeof row === 'object' ? String(row.id ?? row.link_id) : String(row), row]));
    for (const row of rows) { const id = typeof row === 'object' ? String(row.id ?? row.link_id) : String(row); merged.set(id, typeof row === 'object' ? {...merged.get(id), ...row} : row); }
    result[key] = [...merged.values()];
  }
  return result;
}
const mediaIssuers = new Map();
export async function viewModel(ctx, {graph = {}, ...values} = {}) {
  const assets = await nativeAssets(ctx.config), merged = mergeGraphs(ctx.auth.graph,graph);
  const users = new Map((merged.users || []).map(user => [String(user.id),user]));
  const input = {actor_id:ctx.auth.user?.id,surrender_id:ctx.auth.surrender?.id || null};
  const [friends, notes] = ctx.auth.user ? await Promise.all([
    ctx.call('social','friend-requests-count',input),ctx.call('social','notifications',{...input,header:true}),
  ]) : [{count:0},{notifications:[]}];
  let issue = mediaIssuers.get(ctx.config.secretKeyBase);
  if (!issue) { issue = createTokenIssuer(ctx.config.secretKeyBase);mediaIssuers.set(ctx.config.secretKeyBase,issue); }
  return {user:ctx.auth.user,surrender:ctx.auth.surrender,flags:ctx.auth.flags || {},csrf:ctx.auth.csrf_token,flash:ctx.flash.values,baseUrl:ctx.config.baseUrl.replace(/\/$/,''),originalUrl:ctx.originalUrl,
    env:ctx.config.publicEnv || {},asset:name => assetUrl(assets.assets,name),users,graph:merged,frameRequest:ctx.req.headers['turbo-frame'] || null,pastLinks:new Map((merged.past_links || []).map(post => [String(post.id),post])),
    ownedSurrender:(merged.surrenders || []).find(s => String(s.user_id) === String(ctx.auth.user?.id) && new Date(s.expires_at) > new Date()),
    notifications:notes.notifications || [],friendRequests:friends.count || 0,
    media:source => { const token = issue(source);return token ? '/e621-media?token='+encodeURIComponent(token) : safeUrl(source); },...values};
}
export async function renderPage(ctx, {template, assigns = {}, graph = {}, status = 200, parameters = {}, ...values}) {
  const page = template === 'dashboard/index' ? 'home' : template === 'session/new' ? 'login' : template;
  const view = await viewModel(ctx,{...values,graph,error:assigns.error ?? values.error,email:parameters.email ?? values.email ?? ''});
  const body = ctx.templates(page,view);
  if (ctx.req.method !== 'HEAD' && !ctx.prefetch) ctx.flash.consume();
  ctx.send(status,body,{'content-type':page === 'mascot' || values.fullRerender ? 'text/vnd.turbo-stream.html; charset=utf-8' : 'text/html; charset=utf-8','x-walltaker-renderer':'node-native','x-walltaker-rails-reads':'0',...(values.headers || {})});
}
export async function dashboard(ctx) {
  const actor = {actor_id:ctx.auth.user?.id,surrender_id:ctx.auth.surrender?.id || null};
  const [data, leaderboard, tracker] = await Promise.all([
    ctx.call('discovery','dashboard',{viewer_id:ctx.auth.user?.id || null}),
    ctx.auth.user ? ctx.call('social','leaderboard',{}) : {users:[]},
    ctx.auth.user ? ctx.call('tracker','pledge-status',{...actor,username:ctx.auth.user.username}) : null,
  ]);
  const pledgeGraph = tracker?.current?.past_link_id ? await ctx.call('browser','hydrate',{ids:{past_links:[tracker.current.past_link_id]}}) : {};
  await renderPage(ctx,{template:'dashboard/index',dashboard:data,leaderboard:leaderboard.users || [],tracker,graph:mergeGraphs(data.graph,pledgeGraph.graph)});
}
