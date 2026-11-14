import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {startServer} from './serve.mjs';
import descriptor from '../app/src/courses/http-cache.mjs';
const root=path.resolve(import.meta.dirname,'..');
const externalUrl=process.env.PROTOCOL_BASE_URL?.replace(/\/$/,'');
const output=path.join(root,externalUrl?'artifacts/docker/languages':'artifacts/build');
fs.mkdirSync(output,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'app/vendor-asset-manifest.json'),'utf8'));
const evidence={recordedAt:new Date().toISOString(),errors:[],failedResponses:[],languages:[],checks:[]};
const check=(name,value)=>{evidence.checks.push({name,passed:Boolean(value)});assert(value,name);};
const plainText=text=>text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
const running=externalUrl?{url:externalUrl,close:async()=>{}}:await startServer({port:0,dist:true});
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'en-US'});
  const settle=async()=>{
    await page.waitForFunction(()=>!document.documentElement.classList.contains('is-retexting')&&!document.getAnimations().some(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime)));
    await page.evaluate(()=>document.fonts.ready);
  };
  page.on('pageerror',e=>evidence.errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=400)evidence.failedResponses.push({url:r.url(),status:r.status()});});
  await page.goto(running.url,{waitUntil:'networkidle'});
  check('Static build preserves 40 registered courses',await page.locator('.proto[data-lesson]').count()===40);
  const cssResponse=await page.request.get(running.url+'/assets/index-CwjpA-vk.css');
  check('Served production stylesheet is byte-identical to the original',createHash('sha256').update(await cssResponse.body()).digest('hex')==='330dfe72889cf6fc9b048e50bca6a40f2a5858dfcc24fb76f32f67971e88cd3d');
  await page.locator('.proto[data-lesson="http-cache"] > .proto-row').click();
  for(const code of manifest.languageCodes) {
    await page.locator('.lang > .menu-btn').click();
    await page.locator(`[data-lang="${code}"]`).click();
    await page.waitForFunction(language=>document.querySelector(`[data-lang="${language}"]`)?.getAttribute('aria-checked')==='true',code);
    await page.waitForFunction(()=>!document.querySelector('.lang').classList.contains('is-loading'));
    await settle();
    const full=await page.locator('.overview-full').innerText();
    // Upstream RTL locales legitimately isolate fallback Latin text.
    assert.equal(plainText(full),code==='zh'?descriptor.translations.zh.strings[descriptor.lesson.overview.full]:descriptor.lesson.overview.full);
    const asset=manifest.files.find(file=>file.publicPath.startsWith(`/assets/${code}-`)&&file.publicPath.endsWith('.js'));
    const expectedPlay=code==='en'?'PLAY':await page.evaluate(async assetPath=>(await import(assetPath)).default.strings.PLAY??'PLAY',asset.publicPath);
    const renderedPlay=await page.locator('.packets .toggle-label').textContent();
    assert.equal(plainText(renderedPlay),plainText(expectedPlay),`Visible player control must finish retexting to ${code}`);
    evidence.languages.push({code,htmlLang:await page.locator('html').getAttribute('lang'),direction:await page.locator('html').getAttribute('dir'),renderedPlay,passed:true});
  }
  check('All 21 original language choices load from the static build',evidence.languages.length===21);
  await page.locator('.lang > .menu-btn').click();
  await page.locator('[data-lang="zh"]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  await settle();
  await page.screenshot({path:path.join(output,'http-cache-zh.png'),fullPage:true});
  check('Built application has no failed resources or JavaScript errors',evidence.errors.length===0&&evidence.failedResponses.length===0);
} finally {
  if(browser)await browser.close();
  await running.close();
  fs.writeFileSync(path.join(output,'build-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
}
console.log(JSON.stringify(evidence));
