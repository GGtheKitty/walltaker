// Isolated fixture only. This creates a draft and records its ID for cleanup.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const fixturePath=process.env.WALLTAKER_BROWSER_FIXTURE, fixture=JSON.parse(await readFile(fixturePath,'utf8'));
const base=process.env.WALLTAKER_BROWSER_BASE || 'https://devenv.playctrl.me';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-dev-shm-usage','--js-flags=--max-old-space-size=64']});
const context=await browser.newContext({viewport:{width:1280,height:900},userAgent:'Mozilla/5.0 NativeWallpaperCheck NodeBrowserCheck/'+fixture.suffix});
await context.addInitScript(()=>localStorage.setItem('age','true'));
// Avoid downloading/decoding remote media on the small test VPS.
await context.route('**/*',route=>['image','font','media'].includes(route.request().resourceType())?route.abort():route.continue());
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',message=>{if(message.type()==='error' && /Error (connecting controller|invoking action)/.test(message.text()))errors.push(message.text());});
page.setDefaultTimeout(20000);
try {
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
  await page.locator('#email').fill(fixture.users[0].username);await page.locator('#password').fill(fixture.password);
  await page.locator('form[action="/session"] input[type="submit"]').click();await page.waitForURL(base+'/');
  await page.goto(base+'/links/'+fixture.links[0],{waitUntil:'domcontentloaded'});
  await page.locator('.tabs__labels button').filter({hasText:'Post ID'}).click();await page.locator('#link_post_id').waitFor({state:'visible'});
  await page.locator('.tabs__labels button').filter({hasText:/^Search$/}).click();await page.locator('#pornsearch_input input[name="tags"]').waitFor({state:'visible'});
  await page.locator('[data-comments-sidebar-target="toggle"]').click();assert.equal(await page.locator('aside.comments-sidebar').getAttribute('data-hidden'),'false');
  await page.locator('input[name="comment[content]"]').fill('Native UI comment '+fixture.suffix);
  await page.locator('.new_comment_form input[type="submit"]').click();await page.locator('#link_comments_new input[name="comment[content]"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('#link_comments')?.textContent.includes('Native UI comment'));
  await page.locator('[data-comments-sidebar-target="toggle"]').click();
  await page.locator('[data-action="click->link#confirm"]').click();assert.equal(await page.locator('[data-link-target="modal"]').getAttribute('open'),'');await page.locator('[data-link-target="cancel"]').click();
  await page.goto(base+'/links/'+fixture.links[0]+'/edit',{waitUntil:'domcontentloaded'});
  await page.locator('#link_terms').fill('Native UI settings '+fixture.suffix);await page.getByRole('button',{name:'Update Link',exact:true}).click();await page.waitForURL(base+'/links/'+fixture.links[0]);
  assert.match(await page.locator('.link--terms').innerText(),/Native UI settings/);
  await page.goto(base+'/search',{waitUntil:'domcontentloaded'});await page.locator('input[name="q"]').fill('Native');await page.getByRole('button',{name:'Search Links'}).click();await page.locator('#link_search_results .search-heading').waitFor();
  await page.goto(base+'/links/wizard',{waitUntil:'domcontentloaded'});await page.waitForURL(/\/wizard\/intro$/);
  const draft=Number(/\/links\/(\d+)\//.exec(page.url())[1]);
  // Read again so another verification process cannot lose its cleanup IDs.
  const current=JSON.parse(await readFile(fixturePath,'utf8'));current.links=[...new Set([...current.links,draft])];await writeFile(fixturePath,JSON.stringify(current),{mode:0o600});
  const steps=[['intro',()=>page.getByRole('button',{name:'No shut up',exact:true}).click()],['summon',()=>page.getByRole('button',{name:'Thanks cuties!',exact:true}).click()],['control',()=>page.getByRole('button',{name:'Normal. I know how the internet works.',exact:true}).click()],['kinks',async()=>{await page.locator('textarea[name="terms"]').fill('Native UI wizard');await page.getByRole('button',{name:"I'm done!",exact:true}).click();}],['gender',async()=>{await page.locator('input[value="cloaca"]').check();await page.getByRole('button',{name:"I'm done!",exact:true}).click();}],['surprise',()=>page.getByRole('button',{name:'I prefer to be surprised or will decide later.',exact:true}).click()],['no_fun',()=>page.getByRole('button',{name:'Anons on the internet for me, please!',exact:true}).click()]];
  for(let i=0;i<steps.length;i++) {await page.waitForURL(base+'/links/'+draft+'/wizard/'+steps[i][0]);await steps[i][1]();}
  await page.waitForURL(base+'/links/'+draft+'/wizard/orgasmic_conclusion');await page.getByRole('button',{name:'Let me use my link!',exact:true}).click();await page.waitForURL(base+'/links/'+draft);
  assert.equal(await page.locator('link[href*="wizard."]').count(),0,'Wizard stylesheet leaked into normal pages');
  for(const width of [1280,390]){await page.setViewportSize({width,height:900});const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='fixed').slice(0,6).map(e=>({tag:e.tagName,classes:e.className,width:Math.round(e.getBoundingClientRect().width)}))}));assert(metrics.scroll<=width+2,'Wallpaper viewport '+JSON.stringify(metrics));}
  assert.deepEqual(errors,[],'Native frontend errors');
  console.log('Native wallpaper UI: tabs, comments with live broadcast, delete dialog, settings, site search, all wizard steps, stylesheet cleanup and desktop/mobile width checks passed.');
} finally {await browser.close();}
