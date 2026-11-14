const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, request } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://protocol-explorer-alpha.vercel.app';

(async () => {
  // API transport honors the environment proxy and NODE_EXTRA_CA_CERTS.
  // Fulfill unchanged HTTPS responses so Chromium needs no TLS bypass.
  const api = await request.newContext({
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  });
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const evidence = { origin, recordedAt: new Date().toISOString(), browser: browser.version(), transport: 'Unchanged original HTTPS responses via Playwright APIRequestContext; proxy CA verification enabled.', requests: [], checks: [], samples: [], errors: [] };
  const check = (name, value, detail) => {
    evidence.checks.push({ name, passed: Boolean(value), detail });
    assert(value, name);
  };
  page.on('pageerror', e => evidence.errors.push(String(e)));
  await page.route(`${origin}/**`, async route => {
    const response = await api.get(route.request().url());
    const body = await response.body();
    const url = route.request().url();
    evidence.requests.push({ url, status: response.status(), type: route.request().resourceType(), bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') });
    if (/\/assets\//.test(url)) {
      fs.mkdirSync(path.join(root, 'raw', 'browser-assets'), { recursive: true });
      fs.writeFileSync(path.join(root, 'raw', 'browser-assets', path.basename(new URL(url).pathname)), body);
    }
    await route.fulfill({ response });
  });
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.locator('.packet-table tr[data-packet="6"]').waitFor({ state: 'visible' });
    check('HTTP overview exposes seven packet rows', await page.locator('.packet-table tr[data-packet]:visible').count() === 7);
    await page.screenshot({ path: path.join(root, 'screenshots', 'original-http-initial.png'), fullPage: true });

    await page.locator('.packet-table tr[data-packet="0"]').click();
    await page.locator('.inspector').waitFor({ state: 'visible' });
    const inspect = await page.locator('.inspector').innerText();
    check('Packet inspector contains Ethernet IPv4 UDP DNS', ['Ethernet', 'IPv4', 'UDP', 'DNS'].every(x => inspect.includes(x)));
    const field = page.locator('.inspector .ins-field[data-from]').first();
    const from = Number(await field.getAttribute('data-from'));
    const to = Number(await field.getAttribute('data-to'));
    await field.hover();
    check('Hover field highlights matching hex and ASCII byte range', await page.locator('.inspector [data-i].is-lit').count() === (to - from) * 2, { from, to });
    await page.screenshot({ path: path.join(root, 'screenshots', 'original-http-inspector.png'), fullPage: true });
    evidence.samples.push({ view: 'HTTP packet 1 inspector', text: inspect, fields: await page.locator('.ins-field').count(), hexBytes: await page.locator('.hx[data-i]').count() });
    await page.keyboard.press('ArrowRight');
    check('Inspector next packet updates shared selection', await page.locator('.inspector').getAttribute('data-index') === '1');
    await page.keyboard.press('Escape');
    await page.locator('.inspector').waitFor({ state: 'hidden' });

    await page.locator('[role="tab"][data-view="sequence"]').click();
    await page.locator('.seq-arrow[data-packet="0"]').waitFor({ state: 'visible' });
    check('Sequence overview has one arrow per HTTP packet row', await page.locator('.seq-arrow').count() === 7);
    await page.locator('.seq-arrow[data-packet="0"] .seq-label-text').click();
    check('Sequence arrow opens same packet inspector', await page.locator('.inspector').getAttribute('data-index') === '0');
    await page.keyboard.press('Escape');
    await page.locator('.inspector').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(root, 'screenshots', 'original-http-sequence.png'), fullPage: true });

    await page.locator('.packets [data-action="step"]').click();
    await page.waitForTimeout(1000);
    check('Step enters lesson playback', !(await page.locator('.packets [data-action="prev"]').isDisabled()));
    evidence.samples.push({ view: 'HTTP first event', text: await page.locator('.overview').innerText(), visibleRows: await page.locator('.packet-table tr[data-packet]:visible').count() });
    await page.locator('.packets [data-action="reset"]').click();
    await page.waitForTimeout(500);
    check('Reset restores all HTTP packet rows', await page.locator('.packet-table tr[data-packet]:visible').count() === 7);

    for (const id of ['https', 'tcp', 'dnssec', 'quic', 'ipv6', 'wifi']) {
      await page.locator(`.proto[data-lesson="${id}"] > .proto-row`).click();
      await page.waitForTimeout(500);
      const rows = page.locator('.packet-table tr[data-packet]:visible');
      const count = await rows.count();
      check(`${id} course renders packet rows`, count > 0, {count});
      await rows.last().click();
      await page.locator('.inspector').waitFor({state:'visible'});
      const hexBytes = await page.locator('.inspector .hx[data-i]').count();
      check(`${id} last packet serializes into inspector bytes`, hexBytes > 0, {hexBytes});
      evidence.samples.push({view:`${id} last packet`, packetRows:count, hexBytes, unknownBytes:await page.locator('.inspector .hx.is-unknown').count(), layers:await page.locator('.ins-layer h4').allTextContents()});
      await page.keyboard.press('Escape');
      await page.locator('.inspector').waitFor({state:'hidden'});
    }
    await page.locator('.proto[data-lesson="http"] > .proto-row').click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await page.locator('[data-lang="zh"]').click();
    await page.waitForTimeout(700);
    check('Simplified Chinese loads on demand', evidence.requests.some(r => /zh-AH-lIMHP\.js/.test(r.url)));
    evidence.samples.push({ view: 'Chinese localization', text: (await page.locator('.overview').innerText()).slice(0, 2000) });
    await page.screenshot({ path: path.join(root, 'screenshots', 'original-zh.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    check('Mobile uses phone layout', await page.locator('html').getAttribute('data-layout') === 'phone');
    await page.screenshot({ path: path.join(root, 'screenshots', 'original-phone.png'), fullPage: true });
    check('Observed traffic contains no fetch/XHR course API', !evidence.requests.some(r => ['xhr', 'fetch'].includes(r.type)), evidence.requests.map(x => ({type:x.type,url:x.url})));
    check('No browser JavaScript errors', evidence.errors.length === 0);
  } finally {
    fs.writeFileSync(path.join(root, 'research', 'browser-evidence.json'), JSON.stringify(evidence, null, 2));
    await browser.close();
    await api.dispose();
  }
  console.log(JSON.stringify({ checks: evidence.checks.map(x => ({name:x.name,passed:x.passed})), requests: evidence.requests.length, errors: evidence.errors }));
})().catch(error => { console.error(error); process.exitCode = 1; });
