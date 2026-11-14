import {spawn} from 'node:child_process';
import {startServer} from './serve.mjs';
import './prepare-runtime.mjs';

const running=await startServer({port:0});
function run(file) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[file],{stdio:'inherit',env:{...process.env,PROTOCOL_BASE_URL:running.url}});
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(Error(`${file} exited ${code}`)));
  });
}
try {
  const results=await Promise.allSettled([run('tests/legacy-baseline.cjs'),run('tests/course.browser.mjs')]);
  const errors=results.filter(x=>x.status==='rejected');
  if (errors.length) throw new AggregateError(errors.map(x=>x.reason),'Browser verification failed');
} finally {await running.close();}
