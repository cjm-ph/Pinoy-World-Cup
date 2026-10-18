import { publicFiles } from './public-files.mjs';
import { cp, mkdir, copyFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'staging-deploy/public');
try { await access(output); throw Error('Public artifact already exists; choose a fresh reviewed output before rebuilding.'); }
catch(error) { if(error.code!=='ENOENT') throw error; }
await mkdir(output,{recursive:true});
for(const dir of ['scripts/modules','data','image']) await mkdir(resolve(output,dir),{recursive:true});
await copyFile(resolve(root,'index_staging_integrated.html'),resolve(output,'index.html'));
for(const file of publicFiles) {
  await mkdir(resolve(output,file,'..'),{recursive:true});
  await copyFile(resolve(root,file),resolve(output,file));
}
await cp(resolve(root,'image'),resolve(output,'image'),{recursive:true});
// Deliberate allowlist: no server code, credentials, SQL, tests or legacy admin.js.
