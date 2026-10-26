import {spawn} from 'node:child_process';
import {buildAssets, watchAssets} from './build-assets.js';

await buildAssets();
const stopAssets = watchAssets();
const server = spawn(process.execPath,['--watch','--watch-preserve-output','src/server.js'],{stdio:'inherit'});
let stopping = false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => {
  if (stopping) return; stopping = true; stopAssets(); server.kill(signal);
});
server.on('exit',(code,signal) => { stopAssets();process.exit(stopping || signal === 'SIGTERM' ? 0 : code || 1); });
