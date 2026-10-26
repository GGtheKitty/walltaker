// Run against disposable accounts only; credentials are read from a local file
// and never included in output, screenshots, command arguments or error logs.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const fixture = JSON.parse(await readFile(process.env.WALLTAKER_BROWSER_FIXTURE,'utf8'));
const base = process.env.WALLTAKER_BROWSER_BASE || 'https://devenv.playctrl.me';
const user = fixture.users[0];
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-dev-shm-usage','--js-flags=--max-old-space-size=64']});
const context = await browser.newContext({viewport:{width:1280,height:900},userAgent:'Mozilla/5.0 NativeSliceCheck NodeBrowserCheck/'+fixture.suffix});
let errors = [], native = true, responses = [];
const page = await context.newPage();
page.on('pageerror',error => errors.push(error.message));
page.on('response',response => {
  if (!response.url().startsWith(base+'/')) return;
  const headers = response.headers();
  if (responses.length < 300) responses.push({path:new URL(response.url()).pathname,status:response.status(),web:headers['x-walltaker-web'],assets:headers['x-walltaker-assets']});
  if (native) assert.notEqual(headers['x-walltaker-web'],'node-proxy','Native flow requested a Rails route.');
});
async function ready() { await page.waitForFunction(() => document.documentElement.dataset.nodeFrontend === 'ready'); }
async function submit() { await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('form[action="/session"] input[type="submit"]').click()]); }
try {
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await ready();
  await page.getByRole('button',{name:'I am over the age of 18.',exact:true}).click();
  assert.equal(await page.locator('h2').filter({hasText:'What is it?'}).count(),1);
  await page.locator('header a[href="/login"]').click();await page.waitForURL(base+'/login');await ready();
  await page.locator('#email').fill(user.username);await page.locator('#password').fill('intentionally-wrong-password');
  const failure = page.waitForResponse(response => new URL(response.url()).pathname === '/session' && response.request().method() === 'POST');
  await submit();assert.equal((await failure).status(),422);
  await page.locator('.error_messages').waitFor();await ready();
  assert.equal(await page.locator('#email').inputValue(),user.username);assert.equal(await page.locator('#password').inputValue(),'');
  await page.locator('#password').fill(fixture.password);await page.locator('#keep_me_logged_in').check();
  await submit();await page.waitForURL(base+'/');await ready();
  await page.waitForFunction(() => !!document.querySelector('#dashboard-changes-chart canvas'));
  assert.equal(await page.title(),'Walltaker Dashboard');assert.match(await page.locator('#flashes').innerText(),/Logged in!/);
  await page.waitForFunction(() => document.querySelector('header .user-tools__nested turbo-cable-stream-source')?.hasAttribute('connected'));
  assert((await context.cookies()).some(cookie => cookie.name === 'walltaker_session' && cookie.expires > Date.now()/1000));
  await page.locator('.notification-bell').click();assert.equal(await page.locator('[data-notifications-target="popover"]').getAttribute('data-open'),'true');
  await page.locator('.notification-bell').click();
  console.log('Native age dialog, failed/successful login, dashboard chart and authenticated live stream passed.');
  const beforeMascot = (await page.locator('#mascot_picker em').innerText()).trim();
  const afterMascot = {Ki:'Warren',Warren:'Taylor',Taylor:'Ki'}[beforeMascot];
  const mascot = page.waitForResponse(response => new URL(response.url()).pathname === '/api/mascot/next' && response.request().method() === 'POST');
  await page.locator('#mascot_picker button[title="next mascot"]').click();assert.equal((await mascot).status(),200);
  await page.waitForFunction(expected => document.querySelector('#mascot_picker em')?.textContent === expected,afterMascot);
  await page.reload({waitUntil:'domcontentloaded'});await ready();assert.doesNotMatch(await page.locator('#flashes').innerText(),/Logged in!/);
  const csrf = await context.request.post(base+'/session',{form:{email:user.username,password:'not-used',authenticity_token:'invalid'},maxRedirects:0});assert.equal(csrf.status(),422);
  assert.equal(errors.length,0,'Native frontend raised an exception.');
  assert(responses.filter(response => response.path.startsWith('/node-assets/')).every(response => [200,304].includes(response.status) && response.assets === 'node'));
  console.log('Native homepage, age dialog, failed/successful login, remembered session, dashboard chart, protected stream, notification popover, mascot form and CSRF checks passed.');
  // Crossing the migration boundary must reload the appropriate frontend once.
  native = false;errors = [];
  console.log('Checking navigation to a remaining Rails page.');
  await page.goto(base+'/settings',{waitUntil:'domcontentloaded'});
  console.log('Rails page reached; returning to the native homepage.');
  await page.locator('header h1 a[href="/"]').click({noWaitAfter:true});await page.waitForURL(base+'/',{waitUntil:'commit'});await ready();
  assert.equal(await page.title(),'Walltaker Dashboard');
  console.log('Navigation from Node to a Rails page and back restored the correct frontend.');
  native = true;errors = [];
  await page.locator('header a[href="/logout"]').click();await page.waitForURL(base+'/');await ready();
  assert.equal(await page.title(),'Walltaker');assert.match(await page.locator('#flashes').innerText(),/Logged out!/);
  assert(!(await context.cookies()).some(cookie => cookie.name === 'walltaker_session'));
  await page.reload({waitUntil:'domcontentloaded'});await ready();assert.doesNotMatch(await page.locator('#flashes').innerText(),/Logged out!/);
  assert.equal(errors.length,0,'Native logout frontend raised an exception.');
  console.log('Logout revoked the session and delivered its flash exactly once.');
} finally { await browser.close(); }
