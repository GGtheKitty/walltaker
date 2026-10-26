import {createServer} from './app.js';

const config = {
  baseUrl:process.env.WALLTAKER_BASE_URL,
  backendUrl:process.env.BROWSER_BACKEND_URL || 'http://wallpaper_api:3002',
  accountsUrl:process.env.ACCOUNTS_BACKEND_URL || 'http://accounts:3003',
  secretKeyBase:process.env.SECRET_KEY_BASE,
  trustProxyHops:Number(process.env.NODE_WEB_TRUST_PROXY_HOPS || 0),
  liveReload:process.env.WALLTAKER_LIVE_RELOAD === 'true',
  assetsDirectory:process.env.NODE_WEB_ASSET_DIR,
  publicEnv:Object.fromEntries(['COMMIT_HASH','COMMIT_LINK','RELEASE_CREATED_AT'].filter(key => process.env[key]).map(key => [key, process.env[key]])),
};
const server = createServer(config);
server.listen(Number(process.env.PORT || 3004), '0.0.0.0', () => console.log('Node web service listening on port ' + server.address().port));
let stopping = false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => {
  if (stopping) return; stopping = true;
  server.close(() => process.exit(0));
  setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000).unref();
});
