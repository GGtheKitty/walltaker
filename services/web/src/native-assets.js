import {readFile, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HttpError} from './errors.js';

export const defaultAssetDirectory = fileURLToPath(new URL('../dist',import.meta.url));
const caches = new Map();
export async function nativeAssets(config = {}) {
  const directory = resolve(config.assetsDirectory || defaultAssetDirectory), manifestPath = join(directory,'manifest.json');
  try {
    const info = await stat(manifestPath), cached = caches.get(directory);
    if (cached && cached.mtime === info.mtimeMs) return cached;
    if (info.size > 1048576) throw new Error('Invalid asset manifest');
    const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
    if (manifest.version !== 1 || !manifest.assets?.['application.js'] || !manifest.assets?.['application.css']) throw new Error('Invalid asset manifest');
    for (const file of Object.values(manifest.assets)) if (typeof file !== 'string' || !/^[A-Za-z0-9_./-]+\.[a-f0-9]{20}\.[a-z0-9]+$/.test(file) || !resolve(directory,file).startsWith(directory+sep)) throw new Error('Invalid asset path');
    const result = {directory,assets:manifest.assets,files:new Set(Object.values(manifest.assets)),mtime:info.mtimeMs};
    caches.set(directory,result);return result;
  } catch { throw new HttpError(503,'Page assets are temporarily unavailable. Please try again.'); }
}
export function assetUrl(assets, name) {
  if (!Object.hasOwn(assets,name)) throw new HttpError(503,'A required page asset is unavailable. Please try again.');
  return '/node-assets/' + assets[name];
}
const types = {js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',txt:'text/plain; charset=utf-8',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp',ico:'image/x-icon',mp3:'audio/mpeg',mp4:'video/mp4'};
export async function serveAsset(req,res,path,config) {
  const alias=/^\/[a-zA-Z0-9_.-]+\.(?:css|txt|ico|svg|png|jpe?g|gif)$/.test(path)?'public'+path:/^\/help\/[a-zA-Z0-9_.-]+\.(?:png|jpg|gif)$/.test(path)?'images'+path:null;
  if (!alias&&!path.startsWith('/node-assets/')) return false;
  if (!['GET','HEAD'].includes(req.method)) throw new HttpError(405,'GET or HEAD required.',{allow:'GET, HEAD'});
  const manifest = await nativeAssets(config),name=alias?manifest.assets[alias]:path.slice('/node-assets/'.length);
  if(!name)throw new HttpError(404,'Asset not found.');
  if (!manifest.files.has(name)) {
    // Keep already-open pages working across rebuilds. Only build-generated
    // content-addressed files in this dedicated directory can be requested.
    if (!/^[A-Za-z0-9_/-]+\.[a-f0-9]{20}\.(?:js|css|png|jpe?g|gif|svg|webp|ico|mp3|mp4)$/.test(name)) throw new HttpError(404,'Asset not found.');
  }
  const filename = resolve(manifest.directory,name);
  if (!filename.startsWith(manifest.directory+sep)) throw new HttpError(404,'Asset not found.');
  let info;try { info = await stat(filename); } catch { throw new HttpError(404,'Asset not found.'); }
  if (!info.isFile()) throw new HttpError(404,'Asset not found.');
  const etag = '"'+name+'"';
  res.setHeader('x-walltaker-assets','node');res.setHeader('cache-control',alias?'public, max-age=3600':'public, max-age=31536000, immutable');res.setHeader('etag',etag);
  if (req.headers['if-none-match'] === etag) { res.writeHead(304);res.end();return true; }
  const headers={'content-type':types[name.split('.').at(-1)] || 'application/octet-stream','content-length':info.size};
  let range;
  if(/\.(mp3|mp4)$/.test(name)){
    headers['accept-ranges']='bytes';
    if(req.headers.range&&(!req.headers['if-range']||req.headers['if-range']===etag)){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let start=match?.[1]?Number(match[1]):Math.max(0,info.size-Number(match?.[2])),end=match?.[1]&&match?.[2]?Number(match[2]):info.size-1;
      if(!match||!match[1]&&!match[2]||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=info.size||end<start){res.writeHead(416,{'content-range':`bytes */${info.size}`});res.end();return true;}
      end=Math.min(end,info.size-1);range={start,end};headers['content-range']=`bytes ${start}-${end}/${info.size}`;headers['content-length']=end-start+1;
    }
  }
  res.writeHead(range?206:200,headers);
  if (req.method === 'HEAD') res.end();
  else {
    const stream = createReadStream(filename,range);stream.on('error',() => res.destroy());res.on('close',() => stream.destroy());stream.pipe(res);
  }
  return true;
}
