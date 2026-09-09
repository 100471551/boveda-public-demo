import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function validateBundle(root = fileURLToPath(new URL('../', import.meta.url))) {
  const directory = join(root, 'data'), manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 2 || manifest.encryption !== 'AES-256-GCM') throw new Error('Invalid export manifest');
  const names = await readdir(directory);
  if (names.length !== Object.keys(manifest.files).length + 1) throw new Error('Unexpected data files');
  for (const name of names) {
    if (name === 'manifest.json') continue;
    if (!/^(?:library\.json|(?:R(?:[1-9]|1[0-9]|2[0-2])(?:_Fresh)?|audit_[a-f0-9]{32})\.(?:json|canonical\.md|evidence\.json)|visual-[a-f0-9]{64}\.(?:png|jpg))\.enc$/.test(name)) throw new Error('Unexpected export name');
    const raw = await readFile(join(directory, name));
    if (createHash('sha256').update(raw).digest('hex') !== manifest.files[name]) throw new Error('Ciphertext digest differs: ' + name);
    const value = JSON.parse(raw);
    if (Object.keys(value).sort().join(',') !== 'ciphertext,iv,tag' || Buffer.from(value.iv,'base64').length !== 12 || Buffer.from(value.tag,'base64').length !== 16) throw new Error('Invalid envelope');
  }
  for (const blocked of ['R10', 'R20']) {
    if (names.includes(blocked + '.canonical.md.enc') || names.includes(blocked + '.evidence.json.enc')) throw new Error('Non-publishable content in bundle');
  }
  if (!names.includes('library.json.enc')) throw new Error('Missing library');
  return Object.keys(manifest.files).length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`Validated ${await validateBundle()} encrypted files.`);
