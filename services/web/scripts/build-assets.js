import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, readdir, rename, access, copyFile} from 'node:fs/promises';
import {watch,createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, join, dirname, relative, extname} from 'node:path';

const webRoot = fileURLToPath(new URL('..',import.meta.url));
export const sourceRoot = process.env.WALLTAKER_SOURCE_ROOT || fileURLToPath(new URL('../../..',import.meta.url));
export const outputRoot = process.env.NODE_WEB_ASSET_DIR || join(webRoot,'dist');
const digest = bytes => createHash('sha256').update(bytes).digest('hex').slice(0,20);
async function filesIn(directory) {
  const result = [];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const path = join(directory,entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}
export async function buildAssets() {
  const assets = {};
  await mkdir(outputRoot,{recursive:true});
  async function publish(name, bytes) {
    const extension = extname(name), filename = name.slice(0,-extension.length) + '.' + digest(bytes) + extension;
    const path = join(outputRoot,filename);
    await mkdir(dirname(path),{recursive:true});
    try { await access(path); } catch { await writeFile(path,bytes); }
    assets[name] = filename;
  }
  const javascript = await build({
    entryPoints:[join(webRoot,'frontend/application.js')], absWorkingDir:webRoot, bundle:true, format:'esm', platform:'browser', target:['es2022'], minify:true, write:false, legalComments:'inline',
    nodePaths:[join(webRoot,'node_modules')],
    plugins:[{name:'shared-frontend-source',setup(builder) {
      builder.onResolve({filter:/^(?:controllers|channels|modules)\//}, args => ({path:join(sourceRoot,'app/javascript',args.path+'.js')}));
    }}],
  });
  await publish('application.js',javascript.outputFiles[0].contents);
  const publicStyles = ['simple.min','base','link','dashboard','user-profile','member-editor','messages','news-room'];
  const css = await Promise.all(publicStyles.map(name => readFile(join(sourceRoot,'public',name+'.css'),'utf8')));
  for (const path of await filesIn(join(sourceRoot,'app/assets/stylesheets'))) if (path.endsWith('.css')) css.push(await readFile(path,'utf8'));
  css.push(await readFile(join(webRoot,'frontend/application.css'),'utf8'));
  await publish('application.css',css.join('\n'));
  const blazerRoot=join(webRoot,'frontend/vendor/blazer');
  await publish('blazer.css',(await Promise.all(['bootstrap.css','github.css','application.css'].map(name=>readFile(join(blazerRoot,name),'utf8')))).join('\n'));
  for(const name of ['ace.js','mode-sql.js','theme-twilight.js'])await publish('blazer/'+name,await readFile(join(blazerRoot,name)));
  const helpRoot=join(sourceRoot,'public/help');
  for(const path of await filesIn(helpRoot))if(/\.(png|jpg|gif)$/.test(path))await publish('images/help/'+relative(helpRoot,path),await readFile(path));
  for(const entry of await readdir(join(sourceRoot,'public'),{withFileTypes:true}))if(entry.isFile()&&/\.(?:css|txt|ico|svg|png|jpe?g|gif)$/.test(entry.name))await publish('public/'+entry.name,await readFile(join(sourceRoot,'public',entry.name)));
  await publish('wizard.css',(await readFile(join(sourceRoot,'public/wizard.css'),'utf8')).replace('main > blockquote > p, span','main > blockquote > p, main > blockquote > span'));
  await publish('images/e621postid.gif',await readFile(join(sourceRoot,'public/e621postid.gif')));
  const imagesRoot = join(sourceRoot,'app/assets/images');
  for (const path of await filesIn(imagesRoot)) if (/\.(?:png|jpe?g|gif|webp|svg|ico)$/.test(path)) await publish('images/'+relative(imagesRoot,path).split('\\').join('/'),await readFile(path));
  // Hash/copy the large newsroom media without loading it into the build heap.
  for(const name of ['audio/news.mp3','video/globe.mp4']){
    const path=join(sourceRoot,'app/assets',name),hash=createHash('sha256');
    for await(const chunk of createReadStream(path))hash.update(chunk);
    const extension=extname(name),filename=name.slice(0,-extension.length)+'.'+hash.digest('hex').slice(0,20)+extension;
    await mkdir(dirname(join(outputRoot,filename)),{recursive:true});
    try{await access(join(outputRoot,filename));}catch{await copyFile(path,join(outputRoot,filename));}
    assets[name]=filename;
  }
  const manifest = JSON.stringify({version:1,assets});
  const temporary = join(outputRoot,'manifest.json.tmp');
  await writeFile(temporary,manifest);
  await rename(temporary,join(outputRoot,'manifest.json'));
  console.log(`Node frontend built (${Object.keys(assets).length} assets).`);
  return assets;
}
export function watchAssets() {
  let timer, running = false, queued = false;
  async function rebuild() {
    if (running) { queued = true; return; }
    running = true;
    try { await buildAssets(); } catch (error) { console.error('Node frontend build failed:',error.message); }
    finally { running = false; if (queued) { queued = false; void rebuild(); } }
  }
  const watchers = ['app/javascript','app/assets/images','app/assets/stylesheets','app/assets/audio','app/assets/video','public'].map(folder => [join(sourceRoot,folder),folder]);
  watchers.push([join(webRoot,'frontend'),'frontend']);
  const handles = watchers.map(([path,folder]) => watch(path,{recursive:true},(_event,filename) => {
    if (folder === 'public' && (!filename || !/^(?:[^/]+\.(?:css|txt|ico|svg|png|jpe?g|gif)|help\/[^/]+\.(?:png|jpg|gif))$/.test(filename))) return;
    clearTimeout(timer);timer = setTimeout(() => void rebuild(),200);
  }));
  return () => { clearTimeout(timer); for (const handle of handles) handle.close(); };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildAssets();
  if (process.argv.includes('--watch')) watchAssets();
}
