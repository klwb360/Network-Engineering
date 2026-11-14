const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    const types = {'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json','.css':'text/css','.js':'text/plain'};
    res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
    const page = await browser.newPage({viewport:{width:1440,height:1050}});
    await page.goto(`http://127.0.0.1:${server.address().port}/report.html`);
    // Lazy images in collapsed details are still checked directly from disk.
    const desktop = await page.evaluate(() => ({title:document.title,scrollWidth:document.documentElement.scrollWidth,innerWidth,images:[...document.images].map(i=>i.getAttribute('src'))}));
    for (const src of desktop.images) if (!fs.existsSync(path.resolve(root,src))) throw Error('Missing report image: '+src);
    await page.screenshot({path:path.join(root,'screenshots/report-preview.png')});
    await page.setViewportSize({width:390,height:844});
    const mobile=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth}));
    if (desktop.scrollWidth>desktop.innerWidth || mobile.scrollWidth>mobile.innerWidth) {
      console.log(JSON.stringify({desktop,mobile,overflow:await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>!e.closest('.scroll,pre')).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,100)})).filter(x=>x.right>innerWidth+2).slice(0,15))}));
      throw Error('Report horizontal overflow');
    }
    const evidence={recordedAt:new Date().toISOString(),desktop,mobile,passed:true};
    fs.writeFileSync(path.join(root,'research/report-validation.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
