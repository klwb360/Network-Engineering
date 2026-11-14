import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import descriptor from '../app/src/courses/http-cache.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts/http-cache');
fs.mkdirSync(output, {recursive:true});
const origin = (process.env.PROTOCOL_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const lesson = descriptor.lesson;
const packets = lesson.steps.flatMap(step=>step.events).flatMap(event=>event.type==='packet'?[event]:event.type==='stream'?event.packets:[]);
const baselineCatalog = JSON.parse(fs.readFileSync(path.join(root, 'protocol-analysis/derived/course-catalog.json'), 'utf8'));
const evidence = {origin, recordedAt:new Date().toISOString(), course:lesson.id, checks:[], samples:[], errors:[], requests:[]};
function check(name, condition, detail) {
  evidence.checks.push({name,passed:Boolean(condition),detail});
  assert(condition,name);
}

// Independent validation of bytes read from the actual inspector UI. The fold
// includes the encoded checksum, so a valid header/segment sums to 0xffff.
function onesComplementSum(bytes) {
  let sum=0;
  for (let index=0;index<bytes.length;index+=2) {
    sum+=(bytes[index]<<8)|(bytes[index+1]??0);
    sum=(sum&0xffff)+(sum>>>16);
  }
  while (sum>>>16) sum=(sum&0xffff)+(sum>>>16);
  return sum;
}

const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1440,height:1000},locale:'en-US'});
page.on('pageerror',error=>evidence.errors.push(String(error)));
page.on('request',request=>evidence.requests.push({url:request.url(),type:request.resourceType()}));
const controls = () => page.locator('.packets');
const toggle = () => controls().locator('[data-action="toggle"]');
const reset = async () => {
  await controls().locator('[data-action="reset"]').click();
  await page.waitForFunction(()=>!document.querySelector('.packets .toggle').classList.contains('is-playing'));
  await page.waitForFunction(n=>document.querySelectorAll('.packet-table tr[data-packet][data-shown="1"]').length===n,packets.length);
  await page.waitForTimeout(300);
};
const state = () => page.evaluate(()=>({
  playing:document.querySelector('.packets .toggle').classList.contains('is-playing'),
  activeStep:document.querySelector('.proto.is-open .step.is-active')?.dataset.step??null,
  shown:[...document.querySelectorAll('.packet-table tr[data-packet][data-shown="1"]')].map(x=>x.dataset.packet),
  current:[...document.querySelectorAll('.packet-table tr.is-current')].map(x=>x.dataset.packet),
  transforms:[...document.querySelectorAll('.network .packet')].map(x=>x.getAttribute('transform')),
}));

try {
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.locator('.proto[data-lesson="http-cache"]').waitFor();
  const ids=await page.locator('.proto[data-lesson]').evaluateAll(elements=>elements.map(x=>x.dataset.lesson));
  check('All 39 original courses remain registered',baselineCatalog.courses.every(x=>ids.includes(x.id)),{count:ids.length});
  check('New independent course raises navigation total to 40',ids.length===40 && (await page.locator('.tab[data-group="all"] .tab-count').innerText())==='40');
  await page.locator('.proto[data-lesson="http-cache"] > .proto-row').click();
  await page.locator('.packet-rows[data-lesson="http-cache"]').waitFor();
  await page.waitForTimeout(400);
  check('New course renders its expected packet list',await page.locator('.packet-table tr[data-packet]:visible').count()===packets.length,{expected:packets.length});
  check('New course overview renders its own explanation',(await page.locator('.overview-desc').innerText())===lesson.overview.description);
  const deviceCounts=await Promise.all(lesson.nodes.map(id=>page.locator(`svg.network .node[data-node="${id}"]`).count()));
  check('New course reuses original SVG devices',await page.locator('svg.network').count()===1 && deviceCounts.every(count=>count===1));
  await page.screenshot({path:path.join(output,'network-overview.png'),fullPage:true});

  // Pause while a network packet is visibly in flight, then compare DOM-derived
  // playback and particle positions. No runtime objects or timing state is edited.
  await toggle().click();
  await page.locator('.network .packet').first().waitFor({state:'visible',timeout:20000});
  check('Play starts the shared lesson player',await toggle().evaluate(e=>e.classList.contains('is-playing')));
  await toggle().click();
  await page.waitForTimeout(100);
  const paused=await state();
  await page.waitForTimeout(500);
  const pausedLater=await state();
  check('Pause stops playback progression and network particle motion',!paused.playing && JSON.stringify(paused)===JSON.stringify(pausedLater),{paused,pausedLater});
  await toggle().click();
  await page.waitForTimeout(250);
  const resumed=await state();
  check('Resume advances the paused packet',resumed.playing && JSON.stringify(resumed)!==JSON.stringify(paused),{resumed});
  await reset();
  check('Reset restores the full new-course overview',await page.locator('.packet-table tr[data-packet]:visible').count()===packets.length && await controls().locator('[data-action="prev"]').isDisabled());

  await page.locator('[role="tab"][data-view="sequence"]').click();
  await page.locator('.seq-arrow').first().waitFor({state:'visible'});
  check('Sequence mode renders one arrow per new-course packet',await page.locator('.seq-arrow').count()===packets.length);
  await page.screenshot({path:path.join(output,'sequence-overview.png'),fullPage:true});
  // Single-event stepping in sequence view has deterministic short durations.
  await controls().locator('[data-action="step"]').click();
  await page.waitForTimeout(700);
  const stepped=await state();
  await page.waitForTimeout(500);
  const steppedLater=await state();
  check('Step advances exactly one event without autoplay',!stepped.playing && !await controls().locator('[data-action="prev"]').isDisabled() && JSON.stringify(stepped)===JSON.stringify(steppedLater));
  await reset();

  await controls().locator('.speed').click();
  await controls().locator('[data-speed="2"]').click();
  check('Playback speed menu selects 2x',await controls().locator('[data-speed="2"]').getAttribute('aria-checked')==='true' && (await controls().locator('.speed-label').innerText())==='2×');
  await toggle().click();
  await page.locator('.packets .toggle.is-done').waitFor({timeout:60000});
  check('New course completes at selected playback speed',await controls().locator('[data-action="step"]').isDisabled());
  check('Completion exposes Replay',(await toggle().innerText()).includes('REPLAY'));
  await toggle().click();
  await page.waitForTimeout(150);
  check('Replay restarts the course instead of remaining completed',await toggle().evaluate(e=>e.classList.contains('is-playing')&&!e.classList.contains('is-done')));
  await reset();

  const frames=[];
  for (const [index,packet] of packets.entries()) {
    await page.locator(`.packet-table tr[data-packet="${index}"]`).click();
    await page.locator('.inspector').waitFor({state:'visible'});
    const hex=await page.locator('.inspector .hx[data-i]').evaluateAll(elements=>elements.map(element=>({offset:Number(element.dataset.i),value:element.textContent.trim()})).sort((a,b)=>a.offset-b.offset));
    const known=hex.every((byte,offset)=>byte.offset===offset && /^[0-9a-f]{2}$/i.test(byte.value));
    frames.push({index,packet,hex,known});
    await page.keyboard.press('Escape');
    await page.locator('.inspector').waitFor({state:'hidden'});
  }
  check('All nine UI inspector frames contain known bytes matching row lengths',frames.length===9 && frames.every(frame=>frame.known && frame.hex.length===Number.parseInt(frame.packet.row.len,10)),frames.map(frame=>({index:frame.index,known:frame.known,bytes:frame.hex.length,rowLength:frame.packet.row.len})));
  const byteAudits=frames.map(({index,packet,hex})=>{
    const bytes=Buffer.from(hex.map(byte=>Number.parseInt(byte.value,16)));
    const ipStart=14;
    const version=bytes[ipStart]>>>4;
    const ipHeaderBytes=(bytes[ipStart]&15)*4;
    const ipTotalBytes=bytes.readUInt16BE(ipStart+2);
    const ipEnd=ipStart+ipTotalBytes;
    const protocol=bytes[ipStart+9];
    const tcpStart=ipStart+ipHeaderBytes;
    const tcpHeaderBytes=(bytes[tcpStart+12]>>>4)*4;
    const tcpSegment=bytes.subarray(tcpStart,ipEnd);
    const payload=bytes.subarray(tcpStart+tcpHeaderBytes,ipEnd);
    const pseudo=Buffer.alloc(12);
    bytes.copy(pseudo,0,ipStart+12,ipStart+20);
    pseudo[9]=protocol;
    pseudo.writeUInt16BE(tcpSegment.length,10);
    const data=packet.row.wire.tcp.data;
    const expected=Buffer.from((data?.text??[]).map(line=>line+'\r\n').join('')+(data?.body??''),'ascii');
    const notModified=packet.row.info.startsWith('HTTP/1.1 304');
    const headersEnd=payload.indexOf(Buffer.from('\r\n\r\n'))+4;
    return {
      index,protocol:packet.row.proto,frameBytes:bytes.length,paddingBytes:bytes.length-ipEnd,
      ipVersion:version,ipHeaderBytes,ipTotalBytes,tcpHeaderBytes,tcpSegmentBytes:tcpSegment.length,
      validStructure:bytes.readUInt16BE(12)===0x0800 && version===4 && protocol===6 && ipHeaderBytes>=20 && ipTotalBytes>=ipHeaderBytes+20 && ipEnd<=bytes.length && tcpHeaderBytes>=20 && tcpStart+tcpHeaderBytes<=ipEnd,
      ipv4ChecksumSum:onesComplementSum(bytes.subarray(ipStart,tcpStart)),
      tcpChecksumSum:onesComplementSum(Buffer.concat([pseudo,tcpSegment])),
      payloadBytes:payload.length,expectedPayloadBytes:expected.length,payloadMatches:payload.equals(expected),
      ...(packet.row.proto==='HTTP'?{httpPayload:payload.toString('ascii')}:{}),
      notModified,headerOnly304:!notModified||(headersEnd>=4 && payload.length===headersEnd),
    };
  });
  evidence.samples.push({view:'Independent audit of all nine inspector UI frames',frames:byteAudits});
  check('Inspector Ethernet IPv4 TCP structures exclude frame padding correctly',byteAudits.every(frame=>frame.validStructure),byteAudits.map(({httpPayload,...frame})=>frame));
  check('UI-derived IPv4 and TCP checksums independently sum to 0xffff',byteAudits.every(frame=>frame.ipv4ChecksumSum===0xffff && frame.tcpChecksumSum===0xffff));
  const httpAudits=byteAudits.filter(frame=>frame.protocol==='HTTP');
  check('All six UI HTTP payloads exactly match CRLF headers and body with header-only 304',httpAudits.length===6 && httpAudits.every(frame=>frame.payloadMatches && frame.headerOnly304) && httpAudits.filter(frame=>frame.notModified).length===1,httpAudits.map(({httpPayload,...frame})=>frame));

  const conditionalIndex=packets.findIndex(packet=>JSON.stringify(packet.row.wire).includes('If-None-Match'));
  assert(conditionalIndex>=0,'Course must contain a conditional request');
  await page.locator(`.packet-table tr[data-packet="${conditionalIndex}"]`).click();
  await page.locator('.inspector').waitFor({state:'visible'});
  check('Conditional-request inspector exposes If-None-Match',(await page.locator('.ins-tree').innerText()).includes('If-None-Match'));
  const field=page.locator('.inspector .ins-field[data-from]').first();
  const from=Number(await field.getAttribute('data-from'));
  const to=Number(await field.getAttribute('data-to'));
  await field.hover();
  check('New-course field hover highlights hex and ASCII ranges',await page.locator('.inspector [data-i].is-lit').count()===(to-from)*2,{from,to});
  await page.locator(`.inspector .hx[data-i="${from}"]`).hover();
  const lit=page.locator('.inspector .ins-field.is-lit[data-from]');
  check('Hex hover highlights its covering field',await lit.count()===1 && Number(await lit.getAttribute('data-from'))<=from && Number(await lit.getAttribute('data-to'))>from);
  await page.screenshot({path:path.join(output,'conditional-request-inspector.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await page.locator('.inspector').waitFor({state:'hidden'});

  const notModifiedIndex=packets.findIndex(packet=>packet.row.info.includes('304'));
  assert(notModifiedIndex>=0,'Course must contain a 304 response');
  await page.locator(`.packet-table tr[data-packet="${notModifiedIndex}"]`).click();
  await page.locator('.inspector').waitFor({state:'visible'});
  check('304 response inspector exposes ETag',(await page.locator('.ins-tree').innerText()).includes('ETag'));
  check('Header-only 304 has no unknown body bytes',await page.locator('.inspector .hx.is-unknown').count()===0);
  evidence.samples.push({view:'304 inspector',text:await page.locator('.inspector').innerText(),hexBytes:await page.locator('.hx[data-i]').count()});
  await page.keyboard.press('Escape');
  await page.locator('.inspector').waitFor({state:'hidden'});
  await page.locator(`.seq-arrow[data-packet="${conditionalIndex}"] .seq-label-text`).click();
  check('New-course sequence arrow opens the same packet inspector',await page.locator('.inspector').getAttribute('data-index')===String(conditionalIndex));
  await page.keyboard.press('Escape');
  await page.locator('.inspector').waitFor({state:'hidden'});

  await page.getByRole('button',{name:'Language',exact:true}).click();
  await page.locator('[data-lang="zh"]').click();
  const translatedFull=descriptor.translations.zh.strings[lesson.overview.full];
  assert(translatedFull,'New course must provide Simplified Chinese overview');
  await page.waitForFunction(text=>document.querySelector('.overview-full')?.textContent===text,translatedFull);
  check('New-course Chinese translation joins original language switch',(await page.locator('.overview-full').innerText())===translatedFull && await page.locator('html').getAttribute('lang')==='zh-CN');
  await page.screenshot({path:path.join(output,'chinese-overview.png'),fullPage:true});

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(400);
  check('New course retains original phone layout',await page.locator('html').getAttribute('data-layout')==='phone');
  check('New course has no document horizontal overflow on phone',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(output,'phone.png'),fullPage:true});
  check('New-course flow has no browser JavaScript errors',evidence.errors.length===0,evidence.errors);
} catch(error) {
  evidence.failure=String(error);
  await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally {
  fs.writeFileSync(path.join(output,'browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  await browser.close();
}
console.log(JSON.stringify({course:lesson.id,checks:evidence.checks.map(x=>({name:x.name,passed:x.passed})),errors:evidence.errors}));
