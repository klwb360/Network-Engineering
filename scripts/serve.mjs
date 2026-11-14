import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function startServer({port=4173,host='127.0.0.1',dist=false}={}) {
  const base=path.join(root,dist?'dist':'app');
  const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
  const server=http.createServer((req,res)=>{
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
    let pathname;
    try {pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400);res.end();return;}
    if (pathname==='/') pathname='/index.html';
    const roots=dist?[base]:[base,path.join(base,'public')];
    const candidates=roots.map(dir=>({dir,file:path.resolve(dir,'.'+pathname)}));
    const candidate=candidates.find(({dir,file})=>file.startsWith(dir+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile());
    if (!candidate) {res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return;}
    res.setHeader('Content-Type',types[path.extname(candidate.file)]??'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if (req.method==='HEAD') {res.end();return;}
    fs.createReadStream(candidate.file).pipe(res);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return {server,url:`http://${host}:${server.address().port}`,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}

if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),pos=args.lastIndexOf('--port');
  const running=await startServer({port:pos===-1?4173:Number(args[pos+1]),dist:args.includes('--dist')});
  console.log(`Course Studio: ${running.url} (${args.includes('--dist')?'built static files':'development modules'})`);
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await running.close();process.exit(0);});
}
