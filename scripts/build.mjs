import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './prepare-runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist');
// Only this generated build directory is replaced.
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});
for (const name of ['index.html','src']) await fs.cp(path.join(root,'app',name),path.join(out,name),{recursive:true});
await fs.cp(path.join(root,'app/public'),out,{recursive:true});
await fs.copyFile(path.join(root,'app/runtime-provenance.json'),path.join(out,'runtime-provenance.json'));
console.log('Built dist/: native ES modules and original same-origin assets, ready for static hosting.');
