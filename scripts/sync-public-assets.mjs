import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Public vendor assets only. Never execute a downloaded module, crawl guessed
// paths, refresh the main JS/CSS, or mutate protocol-analysis/raw.
const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'app/public');
const MANIFEST = path.join(ROOT, 'app/vendor-asset-manifest.json');
const ORIGIN = 'https://protocol-explorer-alpha.vercel.app';
const MAIN = '/assets/index-CNPseYOQ.js';
const CSS = '/assets/index-CwjpA-vk.css';
const require = createRequire(path.join(ROOT, 'protocol-analysis/package.json'));
const { parse } = require('@babel/parser');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshots = {
  'raw/index.html': '70603dbf7192ff889e4f5230229bc5d73e4c26c4056b010d3b39a52089b08d72',
  'raw/index-CNPseYOQ.js': '19e285d11f5fa0b1411ec94aaea6cd04531872e8322bb8a46c80e4f92e262834',
  'raw/index-CwjpA-vk.css': '330dfe72889cf6fc9b048e50bca6a40f2a5858dfcc24fb76f32f67971e88cd3d',
};
for (const [file, expected] of Object.entries(snapshots)) {
  const actual = sha(fs.readFileSync(path.join(ROOT, 'protocol-analysis', file)));
  if (actual !== expected) throw Error(`Reviewed original snapshot changed: ${file}`);
}
fs.mkdirSync(PUBLIC, { recursive: true });
const previous = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : null;
if (previous && JSON.stringify(previous.snapshot) !== JSON.stringify(snapshots)) throw Error('Vendor manifest belongs to another snapshot');
const pinned = new Map((previous?.files ?? []).map(file => [file.url, file]));
const queue = [];
const records = new Map();
let languageCodes = [];
let fetched = 0;
let reused = 0;

function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc','start','end','extra','comments','leadingComments','trailingComments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(item => visit(item, fn));
    else if (value && typeof value === 'object') visit(value, fn);
  }
}

function add(reference, parent, kind) {
  if (!reference || /^(?:data:|blob:|#)/.test(reference)) return;
  const url = new URL(reference, parent);
  if (url.protocol !== 'https:' || url.origin !== ORIGIN) return;
  if (url.pathname === MAIN) return;
  url.hash = '';
  const key = url.href;
  const provenance = { from: parent, kind, reference };
  if (records.has(key)) {
    const list = records.get(key).discoveredFrom;
    if (!list.some(item => JSON.stringify(item) === JSON.stringify(provenance))) list.push(provenance);
    return;
  }
  const publicPath = decodeURIComponent(url.pathname);
  const destination = path.resolve(PUBLIC, '.' + publicPath);
  if (!destination.startsWith(PUBLIC + path.sep)) throw Error(`Asset path escapes public root: ${publicPath}`);
  records.set(key, { url: key, publicPath, file: path.relative(ROOT, destination), discoveredFrom: [provenance] });
  queue.push(key);
}

function discoverJavaScript(bytes, parent) {
  const ast = parse(bytes.toString('utf8'), { sourceType: 'module' });
  visit(ast.program, node => {
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source?.type === 'StringLiteral') add(node.source.value, parent, 'static-module-import');
    if (node.type === 'ImportExpression' && node.source?.type === 'StringLiteral') add(node.source.value, parent, 'dynamic-module-import');
    if (node.type === 'CallExpression' && node.callee.type === 'Import' && node.arguments[0]?.type === 'StringLiteral') add(node.arguments[0].value, parent, 'dynamic-module-import');
    if (node.type === 'VariableDeclarator' && node.id.name === '__vite__mapDeps') visit(node.init, child => {
      if (child.type === 'StringLiteral' && /^assets\/.+\.js$/.test(child.value)) add('/' + child.value, parent, 'vite-explicit-preload-dependency');
    });
    if (node.type === 'VariableDeclarator' && node.id.name === 'qt' && node.init?.type === 'ArrayExpression') {
      languageCodes = node.init.elements.map(element => element.properties.find(property => property.key?.name === 'code')?.value?.value).filter(Boolean);
    }
  });
}

function discoverCss(bytes, parent) {
  for (const match of bytes.toString('utf8').matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g)) add(match[2], parent, 'css-url');
}

function discoverHtml(bytes, parent) {
  for (const match of bytes.toString('utf8').matchAll(/<(link|script|img|source|meta)\b([^>]+)>/gi)) {
    const tag = match[1].toLowerCase();
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(item => [item[1].toLowerCase(), item[3]]));
    if (tag === 'link' && /^(?:stylesheet|icon|apple-touch-icon|manifest|modulepreload|preload)$/.test(attrs.rel ?? '')) add(attrs.href, parent, 'html-' + attrs.rel);
    if (['script', 'img', 'source'].includes(tag)) add(attrs.src, parent, 'html-' + tag);
    if (tag === 'meta' && ['og:image', 'twitter:image'].includes(attrs.property ?? attrs.name)) add(attrs.content, parent, 'html-social-image');
  }
}

function writeManifest(complete) {
  const files = [...records.values()].filter(record => record.sha256).sort((a,b) => a.publicPath.localeCompare(b.publicPath));
  const manifest = {
    origin: ORIGIN,
    snapshot: snapshots,
    scope: 'Only URLs explicitly referenced by reviewed original HTML, JS imports, Vite preload dependencies, CSS URLs and webmanifest icons. Main JS is excluded; main CSS is copied unchanged from the preserved snapshot.',
    complete,
    languageCodes,
    localeModuleCount: files.filter(file => file.discoveredFrom.some(item => item.kind === 'dynamic-module-import')).length,
    fontCount: files.filter(file => /\.(?:woff2?|ttf|otf)$/.test(file.publicPath)).length,
    fileCount: files.length,
    files,
  };
  fs.writeFileSync(MANIFEST + '.tmp', JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(MANIFEST + '.tmp', MANIFEST);
  return manifest;
}

const raw = path.join(ROOT, 'protocol-analysis/raw');
discoverHtml(fs.readFileSync(path.join(raw, 'index.html')), ORIGIN + '/');
discoverJavaScript(fs.readFileSync(path.join(raw, 'index-CNPseYOQ.js')), ORIGIN + MAIN);
discoverCss(fs.readFileSync(path.join(raw, 'index-CwjpA-vk.css')), ORIGIN + CSS);

for (let index = 0; index < queue.length; index++) {
  const url = queue[index];
  const record = records.get(url);
  const destination = path.join(ROOT, record.file);
  const pin = pinned.get(url);
  let bytes;
  if (pin && fs.existsSync(destination)) {
    bytes = fs.readFileSync(destination);
    if (sha(bytes) !== pin.sha256) throw Error(`Existing vendor asset changed: ${record.file}; restore it before syncing`);
    reused++;
    record.acquiredFrom = pin.acquiredFrom;
  } else {
    const preserved = record.publicPath === CSS ? path.join(raw, 'index-CwjpA-vk.css') : path.join(raw, 'browser-assets', path.basename(record.publicPath));
    if (fs.existsSync(preserved)) {
      bytes = fs.readFileSync(preserved);
      record.acquiredFrom = path.relative(ROOT, preserved);
      reused++;
    } else {
      const temp = destination + '.download-' + process.pid;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      try {
        // curl inherits proxy variables and system CA trust; no TLS bypass or
        // cross-origin redirect is permitted. A failed asset is a failed sync.
        const status = execFileSync('curl', ['--fail', '--silent', '--show-error', '--max-time', '45', '--proto', '=https', '--output', temp, '--write-out', '%{http_code}', url], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
        if (status !== '200') throw Error(`Unexpected HTTP ${status} for ${url}`);
        bytes = fs.readFileSync(temp);
      } finally {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
      }
      record.acquiredFrom = 'original-public-https';
      fetched++;
    }
    if (pin && sha(bytes) !== pin.sha256) throw Error(`Pinned public asset hash changed: ${url}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
  record.bytes = bytes.length;
  record.sha256 = sha(bytes);
  if (record.publicPath.endsWith('.js')) discoverJavaScript(bytes, url);
  else if (record.publicPath.endsWith('.css')) discoverCss(bytes, url);
  else if (record.publicPath.endsWith('.webmanifest')) {
    const manifest = JSON.parse(bytes.toString('utf8'));
    for (const icon of manifest.icons ?? []) add(icon.src, url, 'webmanifest-icon');
  }
  writeManifest(false);
}
const manifest = writeManifest(true);
console.log(JSON.stringify({ status: 'complete', resources: manifest.fileCount, languages: languageCodes.length, localeModules: manifest.localeModuleCount, fonts: manifest.fontCount, fetched, reused }, null, 2));
