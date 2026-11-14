import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const origin=(process.env.PROTOCOL_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const output=path.join(root,'artifacts/docker');
fs.mkdirSync(output,{recursive:true});
const evidence={recordedAt:new Date().toISOString(),origin,checks:[],suites:[]};
function check(name,passed) {
  evidence.checks.push({name,passed:Boolean(passed)});
  assert(passed,name);
}
function run(file) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[file],{cwd:root,stdio:'inherit',env:{...process.env,PROTOCOL_BASE_URL:origin}});
    child.once('error',reject);
    child.once('exit',code=>{
      evidence.suites.push({file,passed:code===0});
      code===0?resolve():reject(Error(`${file} exited ${code}`));
    });
  });
}
try {
  const home=await fetch(origin+'/');
  check('Container serves the Course Studio homepage',home.ok&&(await home.text()).includes('Protocol Explorer · Course Studio'));
  const resources=[
    ['/src/main.mjs','application/javascript'],
    ['/src/vendor/original-runtime.mjs','application/javascript'],
    ['/assets/zh-AH-lIMHP.js','application/javascript'],
    ['/assets/index-CwjpA-vk.css','text/css'],
    ['/assets/iosevka-400-DnzhOSIo.woff2','font/woff2'],
  ];
  const results=await Promise.all(resources.map(async([resource,type])=>{
    const response=await fetch(origin+resource);
    return {resource,passed:response.ok&&response.headers.get('content-type')?.startsWith(type)&&response.headers.get('x-content-type-options')==='nosniff'};
  }));
  check('ES modules, locale, CSS and fonts have correct MIME types',results.every(x=>x.passed));
  const missing=await Promise.all(['/missing-module.mjs','/assets/missing-script.js'].map(async file=>(await fetch(origin+file)).status));
  check('Missing JavaScript resources return 404 rather than HTML fallback',missing.every(code=>code===404));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'app/vendor-asset-manifest.json'),'utf8'));
  const hashes=await Promise.all(manifest.files.map(async file=>{
    const response=await fetch(origin+file.publicPath);
    return response.ok&&createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')===file.sha256;
  }));
  check('All 54 vendor assets are served with their recorded SHA-256 bytes',hashes.length===54&&hashes.every(Boolean));
  const suites=await Promise.allSettled([
    run('tests/legacy-baseline.cjs'),
    run('tests/course.browser.mjs'),
    run('scripts/verify-build.mjs'),
  ]);
  const failed=suites.filter(x=>x.status==='rejected');
  if(failed.length)throw new AggregateError(failed.map(x=>x.reason),'Container browser verification failed');
} catch(error) {
  evidence.failure=String(error);throw error;
} finally {
  fs.writeFileSync(path.join(output,'docker-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
}
console.log(JSON.stringify(evidence));
