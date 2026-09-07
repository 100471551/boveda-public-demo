import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from '../scripts/build.mjs';

test('the deployable static directory contains assets, never audit data or the legacy application', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'boveda-build-'));
  try {
    await build(temp);
    const files = [];
    async function walk(path, rel='') { for (const e of await readdir(path,{withFileTypes:true})) { const name=join(rel,e.name); if(e.isDirectory()) await walk(join(path,e.name),name); else files.push(name); } }
    await walk(temp);
    assert.ok(files.includes('product_v2_0_1/product.js'));
    assert.ok(files.includes('intro.mp4'));
    assert.ok(files.includes('product/assets/close.svg'));
    assert.ok(files.every(name => !/\.html$|\.json(?:\.enc)?$|canonical\.md$|demo-data|engine|\.env/.test(name)));
    assert.ok(!(await readFile(join(temp,'product_v2_0_1/product.js'),'utf8')).includes('password_hash'));
  } finally { await rm(temp,{recursive:true,force:true}); }
});
