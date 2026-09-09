import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createCipheriv, createHash, randomBytes} from 'node:crypto';

const [keyFile, destination] = process.argv.slice(2);
const hex = (await readFile(keyFile, 'utf8')).trim();
if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error('Invalid data key');
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const files = JSON.parse(Buffer.concat(chunks).toString());
await mkdir(destination, {recursive:true});
const manifest = {version:2, encryption:'AES-256-GCM', files:{}};
for (const [name, data] of Object.entries(files)) {
  if (!/^(?:library\.json|(?:R(?:[1-9]|1[0-9]|2[0-2])(?:_Fresh)?|audit_[a-f0-9]{32})\.(?:json|canonical\.md|evidence\.json)|visual-[a-f0-9]{64}\.(?:png|jpg))$/.test(name)) throw new Error('Invalid export filename');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
  cipher.setAAD(Buffer.from(name));
  const encrypted = Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]);
  const envelope = JSON.stringify({iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), ciphertext:encrypted.toString('base64')});
  await writeFile(`${destination}/${name}.enc`, envelope + '\n');
  manifest.files[name + '.enc'] = createHash('sha256').update(envelope + '\n').digest('hex');
}
await writeFile(`${destination}/manifest.json`, JSON.stringify(manifest,null,2) + '\n');
console.log(`Encrypted ${Object.keys(files).length} allowlisted product files; no plaintext written.`);
