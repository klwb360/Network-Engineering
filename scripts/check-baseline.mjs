import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/development-baseline.json'), 'utf8'));
for (const entry of manifest.files) {
  const current = createHash('sha256').update(fs.readFileSync(path.join(root, entry.path))).digest('hex');
  if (current !== entry.sha256) throw Error(`Original analysis baseline changed: ${entry.path}`);
}
console.log(`Preserved ${manifest.files.length} original analysis files, including the 39-course snapshot and 24 browser assertions.`);
