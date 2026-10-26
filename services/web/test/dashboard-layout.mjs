// Visual regression: exercise the real homepage template and shipped CSS with
// multiple data sizes. No database, test account or running site is required.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {createTemplates} from '../src/templates/index.js';
import {nativeAssets} from '../src/native-assets.js';

const assets = await nativeAssets();
const css = await readFile(join(assets.directory,assets.assets['application.css']),'utf8');
const render = createTemplates('dashboard-layout-fixture-secret');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-dev-shm-usage','--js-flags=--max-old-space-size=64']});
const context = await browser.newContext({colorScheme:'dark'});
const page = await context.newPage();
await page.route('**/*',route => route.abort());
await page.addInitScript(() => localStorage.setItem('age','true'));
try {
  for (const width of [1280,640,390]) for (const count of [1,4,20]) {
    const user = {id:1,username:'LayoutReview',mascot:'ki',colour_preference:'dark'};
    const today = Array.from({length:count},(_,i) => ({username:i%2 ? 'LongerReviewUsername'+i : 'ReviewUser'+i,total:i+1}));
    const view = {user,surrender:null,ownedSurrender:null,users:new Map([['1',user]]),pastLinks:new Map(),asset:name => '/node-assets/'+name,csrf:'fixture',flash:{},flags:{},env:{},notifications:[],friendRequests:0,tracker:null,leaderboard:[],media:()=>'#',baseUrl:'http://layout.invalid',originalUrl:'http://layout.invalid/',
      dashboard:{clients:[],today,recent_posts:[],viewers:[],days:[],total:200,your_total:5,online:0,newest_user:null}};
    const document = render('home',view).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'').replace('</head>','<style>'+css+'</style></head>');
    await page.setViewportSize({width,height:1000});
    await page.setContent(document,{waitUntil:'domcontentloaded'});
    const metrics = await page.locator('.dashboard__updates').evaluate(section => {
      const box = element => {const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const rows = [...section.querySelectorAll('table tr')];
      return {heading:box(section.querySelector('h2')),chart:box(section.querySelector('.chart')),table:box(section.querySelector('table')),rows:rows.map(row => [...row.children].map(box)),padding:rows.map(row => [...row.children].map(cell => getComputedStyle(cell).padding))};
    });
    assert(metrics.chart.top >= metrics.heading.bottom - 1,`Chart overlapped heading at ${width}px`);
    assert.equal(metrics.rows.length,count+1);
    const header = metrics.rows[0];
    for (const row of metrics.rows.slice(1)) for (let col=0;col<2;col++) {
      assert(Math.abs(header[col].left-row[col].left)<1 && Math.abs(header[col].right-row[col].right)<1,`Header/data column ${col+1} misaligned at ${width}px with ${count} rows`);
      assert(row[col].height>=30,`Table row lost spacing at ${width}px`);
    }
    console.log(`Aligned Changes table: ${width}px, ${count} row(s).`);
    if (process.env.LAYOUT_SCREENSHOTS && count===4) {
      await mkdir(process.env.LAYOUT_SCREENSHOTS,{recursive:true});
      await page.locator('.dashboard__updates').screenshot({path:join(process.env.LAYOUT_SCREENSHOTS,`changes-${width}.png`)});
    }
  }
} finally { await browser.close(); }
