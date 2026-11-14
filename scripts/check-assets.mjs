import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'app/vendor-asset-manifest.json'),'utf8'));
if(!manifest.complete)throw Error('Public assets are incomplete; run npm run assets:sync');
for(const entry of manifest.files) {
  const file=path.resolve(root,entry.file);
  if(!file.startsWith(path.join(root,'app/public')+path.sep))throw Error('Unexpected vendor asset location');
  const digest=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(digest!==entry.sha256)throw Error(`Original public asset changed: ${entry.file}`);
}
console.log(`Verified ${manifest.files.length} original public assets and ${manifest.languageCodes.length} language choices offline.`);
