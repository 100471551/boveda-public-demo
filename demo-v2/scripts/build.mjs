import {cp, mkdir, readdir, rm} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateBundle} from './validate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = new Set(['.js', '.css', '.svg', '.otf', '.mp4', '.md']);

export async function build(destination = resolve(root, '../dist')) {
  await validateBundle(root);
  await rm(destination, {recursive:true, force:true});
  await mkdir(destination, {recursive:true});
  async function copy(dir, rel = '') {
    for (const entry of await readdir(dir, {withFileTypes:true})) {
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not deployment assets');
      const name = join(rel, entry.name), target = join(destination, name);
      if (entry.isDirectory()) { await copy(join(dir, entry.name), name); continue; }
      if (name === 'index.html') continue; // HTML is served by the access function.
      if (!allowed.has(extname(name))) throw new Error('Unexpected public asset: ' + name);
      await mkdir(resolve(target, '..'), {recursive:true});
      await cp(join(dir, entry.name), target);
    }
  }
  await copy(join(root, 'web'));
  console.log('Built v2 public assets. Audit payloads and HTML remain function-only.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
