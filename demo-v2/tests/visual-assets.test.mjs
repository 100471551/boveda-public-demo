import assert from 'node:assert/strict';
import { createCipheriv, createHash } from 'node:crypto';
import test from 'node:test';

import { createDataStore } from '../server/data.mjs';
import { DataNotFoundError, ServiceUnavailableError } from '../server/errors.mjs';
import { createDemoHandler } from '../server/handler.mjs';

const KEY = Buffer.from('44'.repeat(32), 'hex');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
const SHA = createHash('sha256').update(PNG).digest('hex');

function encrypt(logicalName, value) {
  const iv = Buffer.alloc(12, 8);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  cipher.setAAD(Buffer.from(logicalName, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.from(JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }));
}

function audit(id, sha = SHA, urlAudit = id, { galleryOnly = false } = {}) {
  return {
    id,
    visual_assets: {
      [sha]: { name: `visual-${sha}.png`, mime: 'image/png' },
    },
    visual_evidence: {
      status: 'READY',
      items: galleryOnly ? [] : [{ images: [{ url: `/api/visual-asset?audit=${urlAudit}&asset=${sha}`, alt: 'Fixture chart' }] }],
      ...(galleryOnly ? {
        additional_images: [{
          id: 'source-plot-1',
          kind: 'source_image',
          title: 'Unlinked source plot',
          sources: [{ path: 'graphs/plot.png', locator: 'graphs/plot.png' }],
          images: [{ url: `/api/visual-asset?audit=${urlAudit}&asset=${sha}`, alt: 'Fixture chart' }],
        }],
      } : {}),
    },
  };
}

function fixtureStore() {
  const files = new Map([
    ['R1.json.enc', encrypt('R1.json', Buffer.from(JSON.stringify(audit('R1'))))],
    ['R2.json.enc', encrypt('R2.json', Buffer.from(JSON.stringify(audit('R2', SHA, 'R1'))))],
    ['R3.json.enc', encrypt('R3.json', Buffer.from(JSON.stringify(audit('R3', SHA, 'R3', { galleryOnly: true }))))],
    ['R4.json.enc', encrypt('R4.json', Buffer.from(JSON.stringify(audit('R4', SHA, 'R3', { galleryOnly: true }))))],
    [`visual-${SHA}.png.enc`, encrypt(`visual-${SHA}.png`, PNG)],
  ]);
  const reads = [];
  const store = createDataStore({
    dataKey: KEY,
    read: async (url) => {
      const name = decodeURIComponent(url.pathname).split('/').at(-1);
      reads.push(name);
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return files.get(name);
    },
  });
  return { files, reads, store };
}

test('visual assets are audit-bound, binary-verified, and hidden from public audit metadata', async () => {
  const { store } = fixtureStore();
  const publicAudit = await store.audit('R1');
  assert.equal(publicAudit.visual_assets, undefined);

  const asset = await store.visualAsset('R1', SHA);
  assert.equal(asset.mime, 'image/png');
  assert.deepEqual(asset.bytes, PNG);
});

test('visual asset lookup rejects unknown audits, invalid hashes, and cross-audit references before reading an image', async () => {
  const { reads, store } = fixtureStore();
  await assert.rejects(store.visualAsset('R5', SHA), DataNotFoundError);
  await assert.rejects(store.visualAsset('R1', 'A'.repeat(64)), DataNotFoundError);
  await assert.rejects(store.visualAsset('R1', '0'.repeat(64)), DataNotFoundError);

  const beforeCrossAudit = reads.length;
  await assert.rejects(store.visualAsset('R2', SHA), DataNotFoundError);
  assert.equal(reads.length, beforeCrossAudit + 1);
  assert.equal(reads.at(-1), 'R2.json.enc');
});

test('gallery-only source images are served when audit-bound and denied across audits', async () => {
  const { reads, store } = fixtureStore();
  const asset = await store.visualAsset('R3', SHA);
  assert.equal(asset.mime, 'image/png');
  assert.deepEqual(asset.bytes, PNG);

  const beforeCrossAudit = reads.length;
  await assert.rejects(store.visualAsset('R4', SHA), DataNotFoundError);
  assert.equal(reads.length, beforeCrossAudit + 1);
  assert.equal(reads.at(-1), 'R4.json.enc');
});

test('visual asset corruption fails closed after authenticated decryption', async () => {
  const { files, store } = fixtureStore();
  const name = `visual-${SHA}.png.enc`;
  const envelope = JSON.parse(files.get(name).toString('utf8'));
  envelope.tag = Buffer.alloc(16, 9).toString('base64');
  files.set(name, Buffer.from(JSON.stringify(envelope)));
  await assert.rejects(store.visualAsset('R1', SHA), ServiceUnavailableError);
});

class FakeResponse {
  constructor() {
    this.headers = new Map();
    this.statusCode = 0;
    this.body = Buffer.alloc(0);
  }

  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); }
  end(body = Buffer.alloc(0)) { this.body = Buffer.from(body); }
  json() { return JSON.parse(this.body.toString('utf8')); }
}

async function call(handler, route, query = {}) {
  const req = {
    method: 'GET',
    url: `/api/demo?route=${encodeURIComponent(route)}`,
    query: { route, ...query },
    headers: {},
  };
  const res = new FakeResponse();
  await handler(req, res);
  return res;
}

test('handler authenticates visual assets before reading and returns verified binary data', async () => {
  let authenticated = false;
  let assetReads = 0;
  const handler = createDemoHandler({
    config: { dataKey: KEY },
    redis: {},
    access: { authenticated: async () => authenticated },
    data: {
      visualAsset: async () => {
        assetReads += 1;
        return { bytes: PNG, mime: 'image/png' };
      },
    },
  });

  const denied = await call(handler, 'visual-asset', { audit: 'R1', asset: SHA });
  assert.equal(denied.statusCode, 401);
  assert.equal(assetReads, 0);

  authenticated = true;
  const success = await call(handler, 'visual-asset', { audit: 'R1', asset: SHA });
  assert.equal(success.statusCode, 200);
  assert.equal(success.headers.get('content-type'), 'image/png');
  assert.deepEqual(success.body, PNG);
  assert.equal(assetReads, 1);
});

test('images at the four MiB limit decode without regex stack overflow and reject larger bytes', async()=>{
 const {files,store}=fixtureStore();
 for(const size of [4*1024*1024,4*1024*1024+1]){
  const blob=Buffer.alloc(size,37);PNG.copy(blob);const sha=createHash('sha256').update(blob).digest('hex');
  files.set('R1.json.enc',encrypt('R1.json',Buffer.from(JSON.stringify(audit('R1',sha)))));
  files.set(`visual-${sha}.png.enc`,encrypt(`visual-${sha}.png`,blob));
  if(size===4*1024*1024)assert.deepEqual((await store.visualAsset('R1',sha)).bytes,blob);
  else await assert.rejects(store.visualAsset('R1',sha),ServiceUnavailableError);
 }
});

test('noncanonical base64 is rejected rather than silently normalized',async()=>{
 const {files,store}=fixtureStore();const name=`visual-${SHA}.png.enc`;
 const env=JSON.parse(files.get(name));env.ciphertext='===='+env.ciphertext;
 files.set(name,Buffer.from(JSON.stringify(env)));
 await assert.rejects(store.visualAsset('R1',SHA),ServiceUnavailableError);
});
