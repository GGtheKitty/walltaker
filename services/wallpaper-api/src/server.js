import pg from 'pg';
import {createBrowserSessions,createBrowserLimiter} from './browser-sessions.js';
import {createBrowserData} from './browser-data.js';
import {createBrowserHandler} from './browser-handler.js';
import {createBrowserAccounts} from './browser-accounts.js';
import { createActivity } from './activity.js';
import { createActivityHandler } from './activity-handler.js';
import { writeActivityRecord } from './activity-common.js';
import { createAutomation } from './automation.js';
import { createAutomationHandler } from './automation-handler.js';
import { startAutomationWorker } from './automation-queue.js';
import { createLegacyAutomationImporter } from './automation-legacy.js';
import { enqueueWallpaperAutomation, verifyAutomationSelection } from './automation-wallpaper.js';
import { createModeration } from './moderation.js';
import { createModerationHandler } from './moderation-handler.js';
import {createBlazer} from './blazer.js';
import {createBlazerHandler} from './blazer-handler.js';
import {createCheckNotifier} from './blazer-mail.js';
import { createTracker } from './tracker.js';
import { createTrackerHandler } from './tracker-handler.js';
import { createDiscovery,createDiscoveryCache } from './discovery.js';
import { createDiscoveryHandler } from './discovery-handler.js';
import { createSocial } from './social.js';
import { createSocialHandler } from './social-handler.js';
import { createSocialStreamAuthorizer } from './social-streams.js';
import { createClient } from 'redis';
import { createApiServer } from './app.js';
import { createRepository } from './repository.js';
import { createRedisStore } from './redis.js';
import {createBroadcastClient} from './broadcasts.js';
import { createWallpaperWriter } from './updates.js';
import { createHistoryReader } from './history.js';
import { createReactionWriter } from './reactions.js';
import { createUserReader } from './users.js';
import { createKeyAuthenticator, createSessionViewer } from './auth.js';
import { createE621Service } from './e621.js';
import { createE621Store } from './e621-store.js';
import { createE621Handler } from './e621-handler.js';
import { createLinkManager } from './link-manager.js';
import { createLinkHandler } from './link-handler.js';
import { createInternalHandler } from './internal.js';
import { createRealtimeQueue, startRealtimeDelivery } from './realtime-queue.js';
import { createRealtimePublisher } from './realtime-publisher.js';
import { createRealtimePresence, startPresenceCleanup } from './realtime-presence.js';
import { createRealtimeHandler, createRealtimeRpc } from './realtime-rpc.js';

for (const name of ['DATABASE_URL', 'REDIS_URL', 'SECRET_KEY_BASE', 'WALLTAKER_BASE_URL']) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
pg.types.setTypeParser(1114, (value) => new Date(value + 'Z'));
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL, max: 4,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
  statement_timeout: 5000, options: '-c default_transaction_read_only=on',
});
pool.on('error', (error) => console.error(`Wallpaper database: ${error.code || error.name}`));
const redis = createClient({ url: process.env.REDIS_URL,
  disableOfflineQueue: true, socket: { connectTimeout: 3000 } });
redis.on('error', (error) => console.error(`Wallpaper Redis: ${error.code || error.name}`));
await redis.connect();
const repository = createRepository(pool);
const store = createRedisStore(redis);
await Promise.all([repository.health(), store.health()]);
const discoveryPool = process.env.DISCOVERY_DATABASE_URL ? new pg.Pool({
  connectionString: process.env.DISCOVERY_DATABASE_URL, max: 2,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 5000,
  options: '-c default_transaction_read_only=on',
}) : null;
discoveryPool?.on('error', error => console.error(`Discovery database: ${error.code || error.name}`));
if (discoveryPool) await discoveryPool.query('SELECT 1');
const readDiscovery = discoveryPool ? createDiscovery({ pool: discoveryPool,store,cache: createDiscoveryCache(redis) }) : null;
const writerPool = process.env.WALLPAPER_WRITER_DATABASE_URL ? new pg.Pool({
  connectionString: process.env.WALLPAPER_WRITER_DATABASE_URL, max: 3,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 10000,
}) : null;
writerPool?.on('error', (error) => console.error(`Wallpaper writer: ${error.code || error.name}`));
const writeReaction = writerPool ? createReactionWriter(writerPool) : undefined;
const managerPool = process.env.LINK_MANAGER_DATABASE_URL ? new pg.Pool({
  connectionString: process.env.LINK_MANAGER_DATABASE_URL, max: 2,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 10000,
}) : null;
managerPool?.on('error', (error) => console.error(`Link manager database: ${error.code || error.name}`));
const realtimePool = process.env.REALTIME_DATABASE_URL ? new pg.Pool({
  connectionString: process.env.REALTIME_DATABASE_URL, max: 2,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 5000,
}) : null;
realtimePool?.on('error', (error) => console.error(`Realtime database: ${error.code || error.name}`));
if (realtimePool) await realtimePool.query('SELECT 1');
const socialPool = process.env.SOCIAL_DATABASE_URL ? new pg.Pool({
  connectionString: process.env.SOCIAL_DATABASE_URL, max: 2,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 10000,
}) : null;
socialPool?.on('error', error => console.error(`Social database: ${error.code || error.name}`));
if (socialPool) await socialPool.query('SELECT 1');
const trackerPool = process.env.TRACKER_DATABASE_URL ? new pg.Pool({
  connectionString: process.env.TRACKER_DATABASE_URL, max: 2,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 10000,
}) : null;
trackerPool?.on('error', error => console.error(`Tracker database: ${error.code || error.name}`));
if (trackerPool) await trackerPool.query('SELECT 1');
const moderationPool = process.env.MODERATION_DATABASE_URL ? new pg.Pool({
  connectionString: process.env.MODERATION_DATABASE_URL, max: 2,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 15000,
}) : null;
moderationPool?.on('error', error => console.error(`Moderation database: ${error.code || error.name}`));
if (moderationPool) await moderationPool.query('SELECT 1');
const activityPool = process.env.ACTIVITY_DATABASE_URL ? new pg.Pool({
  connectionString:process.env.ACTIVITY_DATABASE_URL,max:2,
  connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:10000,
}) : null;
activityPool?.on('error',error=>console.error(`Activity database: ${error.code || error.name}`));
if(activityPool)await activityPool.query('SELECT id FROM node_activity_receipts LIMIT 0');
const manageActivity = activityPool ? createActivity({pool:activityPool,store,redis}) : null;
const automationPool = process.env.AUTOMATION_DATABASE_URL ? new pg.Pool({
  connectionString: process.env.AUTOMATION_DATABASE_URL, max: 2,
  connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, statement_timeout: 10000,
}) : null;
automationPool?.on('error', error => console.error(`Automation database: ${error.code || error.name}`));
if (automationPool) await automationPool.query('SELECT id FROM node_newsroom_states WHERE id=1');
const e621Service = process.env.E621_USER_AGENT ? createE621Service({ store:createE621Store(redis),userAgent:process.env.E621_USER_AGENT }) : undefined;
const writeWallpaper = writerPool ? createWallpaperWriter(writerPool, { automation:!!automationPool,
  verifySelection:verifyAutomationSelection, enqueueAutomation:enqueueWallpaperAutomation,
  activity:!!activityPool,recordActivity:writeActivityRecord }) : undefined;
if (automationPool && (!e621Service || !writeWallpaper)) throw new Error('Automation requires e621 and wallpaper persistence');
const automation = automationPool ? createAutomation({ pool:automationPool,store,e621:e621Service,writeWallpaper,
  pornbotInterval:process.env.PORNBOT_INTERVAL_SECONDS }) : null;
const stopAutomation = automation ? startAutomationWorker({ queue:automation.queue,run:automation.run,
  schedule:automation.schedule,importLegacy:createLegacyAutomationImporter(automationPool) }) : async () => {};
const realtimeOptions = { secretKeyBase: process.env.SECRET_KEY_BASE,
  baseUrl: process.env.WALLTAKER_BASE_URL };
const manageSocial=socialPool ? createSocial(socialPool,{activity:!!activityPool}) : null;
const browserPool=process.env.BROWSER_DATABASE_URL ? new pg.Pool({
  connectionString:process.env.BROWSER_DATABASE_URL,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:10000,
}) : null;
browserPool?.on('error',error=>console.error(`Browser database: ${error.code || error.name}`));
if(browserPool)await browserPool.query('SELECT id FROM node_browser_sessions LIMIT 0');
const browserAccounts=createBrowserAccounts({secretKeyBase:process.env.SECRET_KEY_BASE,url:process.env.ACCOUNTS_INTERNAL_URL || 'http://accounts:3003'});
const browserSessions=browserPool ? createBrowserSessions({pool:browserPool,accounts:browserAccounts,social:manageSocial,
  limiter:createBrowserLimiter(redis,process.env.SECRET_KEY_BASE),...realtimeOptions}) : null;
const readBrowserData=browserSessions ? createBrowserData({pool:browserPool,sessions:browserSessions,store,accounts:browserAccounts}) : null;
const browserHandler=browserSessions ? createBrowserHandler({secretKeyBase:process.env.SECRET_KEY_BASE,sessions:browserSessions,
  data:readBrowserData}) : undefined;
const sessionViewer = createSessionViewer({...realtimeOptions,resolveSession:browserSessions?.resolve});
const authenticateKey = createKeyAuthenticator(pool);
const readUser = createUserReader({ pool, repository, store, ...realtimeOptions });
const queue = createRealtimeQueue(redis);
const manageTracker=trackerPool ? createTracker(trackerPool) : null;
const manageModeration=moderationPool ? createModeration({pool:moderationPool,store,redis,secretKeyBase:process.env.SECRET_KEY_BASE,baseUrl:process.env.WALLTAKER_BASE_URL,pornbotInterval:process.env.PORNBOT_INTERVAL_SECONDS}) : null;
const blazerPool=process.env.BLAZER_DATABASE_URL ? new pg.Pool({connectionString:process.env.MODERATION_DATABASE_URL,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:10000}):null;
const blazerQueryPool=process.env.BLAZER_DATABASE_URL ? new pg.Pool({connectionString:process.env.BLAZER_DATABASE_URL,max:3,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:10000}):null;
for(const p of [blazerPool,blazerQueryPool])p?.on('error',error=>console.error(`Blazer database: ${error.code || error.name}`));
const blazer=blazerPool&&manageModeration?createBlazer({pool:blazerPool,queryPool:blazerQueryPool,authorize:input=>manageModeration('admin-session',input),notify:createCheckNotifier({baseUrl:process.env.WALLTAKER_BASE_URL})}):null;
let blazerTick;
const blazerTimer=blazer?setInterval(()=>{if(blazerTick)return;blazerTick=blazer.tick().catch(error=>console.error(`Blazer checks: ${error.code || error.name}`)).finally(()=>{blazerTick=null;});},30000):null;
blazerTimer?.unref();
const renderer=createBroadcastClient({secretKeyBase:process.env.SECRET_KEY_BASE,url:process.env.NODE_WEB_INTERNAL_URL || 'http://node_web:3004'});
let nativeDelivery,deliveryPool,stopNativeDelivery;
{
  if(!process.env.DELIVERY_DATABASE_URL || !browserPool || !manageModeration || !manageSocial || !automation)throw Error('Native delivery dependencies are missing');
  const {createNativeDelivery}=await import('./delivery.js');
  const {createResetMailer}=await import('./mail.js');
  deliveryPool=new pg.Pool({connectionString:process.env.DELIVERY_DATABASE_URL,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:10000});
  deliveryPool.on('error',error=>console.error('Native delivery database: '+(error.code || error.name)));
  await deliveryPool.query('SELECT delivered_at FROM node_wallpaper_events LIMIT 0');
  nativeDelivery=createNativeDelivery({pool:deliveryPool,browserPool,renderer,redis,queue,store,
    discovery:readDiscovery,automation:automation.request,moderation:manageModeration,accounts:browserAccounts,
    sendReset:createResetMailer({baseUrl:process.env.WALLTAKER_BASE_URL})});
  stopNativeDelivery=nativeDelivery.start();
}
const publisher = createRealtimePublisher({ redis, repository, store, readUser, nativeRender:nativeDelivery?.renderRealtime, ...realtimeOptions });
const presence = realtimePool ? createRealtimePresence({ pool: realtimePool, redis, queue }) : null;
const stopPresenceCleanup = presence ? startPresenceCleanup(presence) : async()=>{};
const stopRealtimeDelivery = presence ? startRealtimeDelivery({ queue, deliver: publisher.deliver }) : async () => {};
const realtimeHandler = presence ? createRealtimeHandler({
  rpc: createRealtimeRpc({ repository, presence, publisher, readUser, sessionViewer, authenticateKey,
    authorizeStream: socialPool ? createSocialStreamAuthorizer(socialPool) : undefined, ...realtimeOptions }),
  poll: presence.poll, ...realtimeOptions,
}) : undefined;
const server = createApiServer({
  repository, store, browserHandler,
  blazerHandler:blazer?createBlazerHandler({secretKeyBase:process.env.SECRET_KEY_BASE,manage:blazer}):undefined,
  activityHandler:manageActivity ? createActivityHandler({secretKeyBase:process.env.SECRET_KEY_BASE,manage:manageActivity}) : undefined,
  automationHandler: automation ? createAutomationHandler({secretKeyBase:process.env.SECRET_KEY_BASE,manage:automation.request}) : undefined,
  moderationHandler: moderationPool ? createModerationHandler({ secretKeyBase: process.env.SECRET_KEY_BASE,
    manage: manageModeration }) : undefined,
  trackerHandler: trackerPool ? createTrackerHandler({ secretKeyBase: process.env.SECRET_KEY_BASE, manage: manageTracker }) : undefined,
  discoveryHandler: readDiscovery ? createDiscoveryHandler({ secretKeyBase: process.env.SECRET_KEY_BASE, read: readDiscovery }) : undefined,
  socialHandler: socialPool ? createSocialHandler({ secretKeyBase: process.env.SECRET_KEY_BASE, manage: manageSocial }) : undefined,
  realtimeHandler,
  linkHandler: managerPool ? createLinkHandler({ secretKeyBase: process.env.SECRET_KEY_BASE,
    manage: createLinkManager(managerPool, { baseUrl: process.env.WALLTAKER_BASE_URL }) }) : undefined,
  e621Handler: e621Service ? createE621Handler({ secretKeyBase: process.env.SECRET_KEY_BASE, service:e621Service }) : undefined,
  writeReaction,
  authenticateKey, sessionViewer, readUser,
  internalHandler: createInternalHandler({ secretKeyBase: process.env.SECRET_KEY_BASE,
    writeWallpaper, readHistory: createHistoryReader(pool), writeReaction }),
  reportPresence: presence.poll,
  secretKeyBase: process.env.SECRET_KEY_BASE, baseUrl: process.env.WALLTAKER_BASE_URL,
});
server.listen(Number(process.env.PORT || 3002), '0.0.0.0', () => console.log('Wallpaper API listening on 3002'));
const shutdown = () => {
  server.close(async () => { clearInterval(blazerTimer); await blazerTick; await stopAutomation(); await stopNativeDelivery(); await Promise.all([stopRealtimeDelivery(), stopPresenceCleanup()]); await Promise.all([pool.end(), writerPool?.end(), managerPool?.end(), realtimePool?.end(), socialPool?.end(), discoveryPool?.end(), trackerPool?.end(), moderationPool?.end(), automationPool?.end(), activityPool?.end(), browserPool?.end(), deliveryPool?.end(), blazerPool?.end(), blazerQueryPool?.end(), redis.close()]); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
