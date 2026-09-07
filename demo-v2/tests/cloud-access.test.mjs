import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import test from 'node:test';

import {
  COOKIE_NAME,
  RATE_LIMIT_SCRIPT,
  REMEMBER_SECONDS,
  ROTATE_SESSION_SCRIPT,
  SESSION_SECONDS,
  createAccessService,
} from '../server/access.mjs';
import { createConfig } from '../server/config.mjs';
import { createDataStore } from '../server/data.mjs';
import { DataNotFoundError, ServiceUnavailableError } from '../server/errors.mjs';
import { createDemoHandler } from '../server/handler.mjs';
import { createRedisClient } from '../server/redis.mjs';

const CREDENTIAL = JSON.stringify({
  username: 'demo',
  algorithm: 'pbkdf2_sha256',
  iterations: 600_000,
  salt: '11'.repeat(32),
  password_hash: '22'.repeat(32),
});

function environment(overrides = {}) {
  return {
    BOVEDA_DEMO_CREDENTIAL: CREDENTIAL,
    BOVEDA_DATA_KEY: '33'.repeat(32),
    BOVEDA_PUBLIC_ORIGIN: 'https://boveda.dev',
    UPSTASH_REDIS_REST_URL: 'https://synthetic-redis.invalid',
    UPSTASH_REDIS_REST_TOKEN: 'synthetic-token',
    ...overrides,
  };
}

class FakeRedis {
  constructor(clock) {
    this.clock = clock;
    this.values = new Map();
    this.sorted = new Map();
    this.outage = false;
  }

  failIfNeeded() {
    if (this.outage) throw new ServiceUnavailableError('Synthetic Redis outage.');
  }

  pruneValue(key) {
    const entry = this.values.get(key);
    if (entry && entry.expiresAt <= this.clock()) this.values.delete(key);
  }

  async command(command, ...args) {
    this.failIfNeeded();
    const name = String(command).toUpperCase();
    if (name === 'PING') return 'PONG';
    if (name === 'GET') {
      this.pruneValue(args[0]);
      return this.values.get(args[0])?.value ?? null;
    }
    if (name === 'DEL') return this.values.delete(args[0]) ? 1 : 0;
    if (name === 'SET') {
      const [key, value, modifier, seconds] = args;
      assert.equal(String(modifier).toUpperCase(), 'EX');
      this.values.set(key, { value: String(value), expiresAt: this.clock() + Number(seconds) * 1000 });
      return 'OK';
    }
    throw new Error(`Unsupported fake command: ${name}`);
  }

  async eval(script, keys, args) {
    this.failIfNeeded();
    if (script === RATE_LIMIT_SCRIPT) {
      const [nowValue, windowValue, limitValue, member] = args;
      const now = Number(nowValue);
      const window = Number(windowValue);
      const limit = Number(limitValue);
      const entries = this.sorted.get(keys[0]) || new Map();
      for (const [id, score] of entries) if (score <= now - window) entries.delete(id);
      if (entries.size >= limit) {
        const oldest = Math.min(...entries.values());
        this.sorted.set(keys[0], entries);
        return [0, Math.max(1, oldest + window - now)];
      }
      entries.set(String(member), now);
      this.sorted.set(keys[0], entries);
      return [1, 0];
    }
    if (script === ROTATE_SESSION_SCRIPT) {
      await this.command('DEL', keys[0]);
      await this.command('SET', keys[1], args[0], 'EX', args[1]);
      return 1;
    }
    throw new Error('Unsupported fake script.');
  }
}

function deterministicRandom() {
  let value = 0;
  return (size) => Buffer.alloc(size, ++value);
}

function verifier({ username, password }) {
  return username === 'demo' && password === 'synthetic-correct-password';
}

function cookiePair(setCookie) {
  return setCookie.split(';', 1)[0];
}

function makeAccess(redis, config, clock, randomBytes = deterministicRandom()) {
  return createAccessService({ config, redis, clock, randomBytes, verifyCredential: verifier });
}

test('opaque sessions work across instances, rotate, and revoke a captured cookie on logout', async () => {
  let now = 1_000_000;
  const clock = () => now;
  const config = createConfig(environment());
  const redis = new FakeRedis(clock);
  const randomBytes = deterministicRandom();
  const firstInstance = makeAccess(redis, config, clock, randomBytes);
  const secondInstance = makeAccess(redis, config, clock, randomBytes);

  const first = await firstInstance.login('demo', 'synthetic-correct-password');
  assert.equal(first.status, 200);
  assert.match(first.cookie, new RegExp(`^${COOKIE_NAME}=[A-Za-z0-9_-]{43};`));
  assert.match(first.cookie, /; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  assert.doesNotMatch(first.cookie, /Max-Age/);
  const captured = cookiePair(first.cookie);
  assert.equal(await secondInstance.authenticated(captured), true);

  const rotated = await secondInstance.login('demo', 'synthetic-correct-password', true, captured);
  const current = cookiePair(rotated.cookie);
  assert.notEqual(current, captured);
  assert.match(rotated.cookie, new RegExp(`Max-Age=${REMEMBER_SECONDS}`));
  assert.equal(await firstInstance.authenticated(captured), false);
  assert.equal(await firstInstance.authenticated(current), true);

  const expiredCookie = await firstInstance.logout(current);
  assert.match(expiredCookie, /Max-Age=0/);
  assert.equal(await secondInstance.authenticated(current), false);
});

test('server-side TTL enforces eight-hour and fourteen-day absolute lifetimes', async () => {
  let now = 2_000_000;
  const clock = () => now;
  const config = createConfig(environment());
  const redis = new FakeRedis(clock);
  const access = makeAccess(redis, config, clock);

  const ordinary = cookiePair((await access.login('demo', 'synthetic-correct-password')).cookie);
  now += SESSION_SECONDS * 1000 - 1;
  assert.equal(await access.authenticated(ordinary), true);
  now += 1;
  assert.equal(await access.authenticated(ordinary), false);

  now += 61_000;
  const remembered = cookiePair((await access.login('demo', 'synthetic-correct-password', true)).cookie);
  now += REMEMBER_SECONDS * 1000 - 1;
  assert.equal(await access.authenticated(remembered), true);
  now += 1;
  assert.equal(await access.authenticated(remembered), false);
});

test('the global rolling limiter is atomic across instances and recovers after sixty seconds', async () => {
  let now = 3_000_000;
  const clock = () => now;
  const config = createConfig(environment());
  const redis = new FakeRedis(clock);
  const randomBytes = deterministicRandom();
  const instances = [makeAccess(redis, config, clock, randomBytes), makeAccess(redis, config, clock, randomBytes)];
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await instances[index % 2].login('demo', 'wrong-password')).status, 401);
  }
  const limited = await instances[1].login('demo', 'synthetic-correct-password');
  assert.equal(limited.status, 429);
  assert.equal(limited.retryAfter, 60);
  now += 60_001;
  assert.equal((await instances[0].login('demo', 'synthetic-correct-password')).status, 200);
});

function encrypt(key, logicalName, value) {
  const iv = Buffer.alloc(12, 7);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(logicalName, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.from(JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }));
}

test('encrypted data uses authenticated filenames and rejects path and stub payload access', async () => {
  const key = Buffer.from('33'.repeat(32), 'hex');
  const files = new Map([
    ['R1.json.enc', encrypt(key, 'R1.json', Buffer.from(JSON.stringify({ id: 'R1', available: true })))],
    ['R1.canonical.md.enc', encrypt(key, 'R1.canonical.md', Buffer.from('# Canonical'))],
    ['R1.evidence.json.enc', encrypt(key, 'R1.evidence.json', Buffer.from(JSON.stringify({ 'S1:E0001': { evidence_id: 'E0001' } })))],
    ['R10.json.enc', encrypt(key, 'R10.json', Buffer.from(JSON.stringify({ id: 'R10', available: false })))],
  ]);
  const reads = [];
  const store = createDataStore({
    dataKey: key,
    read: async (url) => {
      const name = decodeURIComponent(url.pathname).split('/').at(-1);
      reads.push(name);
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return files.get(name);
    },
  });

  assert.deepEqual(await store.audit('R1'), { id: 'R1', available: true });
  assert.equal((await store.canonical('R1')).toString(), '# Canonical');
  assert.deepEqual(await store.evidence('R1', 'S1', 'E0001'), { evidence_id: 'E0001' });
  await assert.rejects(store.audit('../R1'), DataNotFoundError);
  await assert.rejects(store.evidence('R1', '../S1', 'E0001'), DataNotFoundError);
  const beforeStub = reads.length;
  assert.equal((await store.audit('R10')).available, false);
  assert.equal(reads.length, beforeStub + 1);
  await assert.rejects(store.canonical('R10'), DataNotFoundError);
  assert.equal(reads.length, beforeStub + 1);

  const tampered = Buffer.from(files.get('R1.json.enc'));
  const envelope = JSON.parse(tampered.toString());
  envelope.tag = Buffer.alloc(16, 9).toString('base64');
  files.set('R1.json.enc', Buffer.from(JSON.stringify(envelope)));
  await assert.rejects(store.audit('R1'), ServiceUnavailableError);
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

async function call(handler, { route, method = 'GET', query = {}, headers = {}, body } = {}) {
  const req = {
    method,
    url: `/api/demo?route=${encodeURIComponent(route || '')}`,
    query: { route, ...query },
    headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])),
    body,
  };
  const res = new FakeResponse();
  await handler(req, res);
  return res;
}

function makeHandler({ redis, config, clock, env = environment() }) {
  return createDemoHandler({
    env,
    config,
    redis,
    clock,
    randomBytes: deterministicRandom(),
    verifyCredential: verifier,
    data: {
      library: async () => [{ id: 'R1' }],
      audit: async (id) => ({ id }),
      evidence: async (id, stage, evidence) => ({ id, stage, evidence }),
      canonical: async () => Buffer.from('# Canonical'),
    },
    indexLoader: async () => '<meta name="probe-token" content="__PROBE_TOKEN__">',
  });
}

const VALID_POST_HEADERS = {
  host: 'boveda.dev',
  origin: 'https://boveda.dev',
  'x-probe-token': 'boveda-demo-ui',
  'content-type': 'application/json',
};

test('real PBKDF2 verification accepts the Python credential format and rejects incorrect credentials', async () => {
  // Produced independently with Python hashlib.pbkdf2_hmac; fixture only.
  const credential = { ...JSON.parse(CREDENTIAL), password_hash: '5838690e60e3d2a964926585b798c2a0f684c8d177362704b11a418d12ece888' };
  const config = createConfig(environment({ BOVEDA_DEMO_CREDENTIAL: JSON.stringify(credential) }));
  const clock = () => 10_000_000;
  const redis = new FakeRedis(clock);
  const access = createAccessService({config, redis, clock});
  assert.equal((await access.login('demo', 'fixture-only-password')).status, 200);
  assert.equal((await access.login('someone-else', 'fixture-only-password')).status, 401);
  assert.equal((await access.login('demo', 'incorrect-password')).status, 401);
  const changedConfig = createConfig(environment({ BOVEDA_DEMO_CREDENTIAL: JSON.stringify({...credential, username:'new-demo'}) }));
  const session = cookiePair((await access.login('demo', 'fixture-only-password')).cookie);
  assert.equal(await createAccessService({config:changedConfig,redis,clock}).authenticated(session), false);
});

test('Redis REST uses the integration environment names and fails closed on transport errors', async () => {
  let captured;
  const redis = createRedisClient({env:{KV_REST_API_URL:'https://synthetic-redis.invalid/',KV_REST_API_TOKEN:'fixture-token'},fetchImpl:async(url,options)=>{
    captured={url,options}; return {ok:true,json:async()=>({result:[1,0]})};
  }});
  assert.deepEqual(await redis.eval(RATE_LIMIT_SCRIPT,['fixture-key'],[123,60_000,5,'fixture-member']),[1,0]);
  assert.equal(captured.url,'https://synthetic-redis.invalid');
  assert.equal(captured.options.headers.Authorization,'Bearer fixture-token');
  assert.deepEqual(JSON.parse(captured.options.body),['EVAL',RATE_LIMIT_SCRIPT,'1','fixture-key','123','60000','5','fixture-member']);
  const unavailable=createRedisClient({env:environment(),fetchImpl:async()=>({ok:true,json:async()=>({error:'unavailable'})})});
  await assert.rejects(unavailable.command('GET','fixture-key'),ServiceUnavailableError);
});

test('handler keeps index public, gates data, and enforces exact origin, host, token, and JSON size', async () => {
  let now = 4_000_000;
  const clock = () => now;
  const config = createConfig(environment());
  const redis = new FakeRedis(clock);
  const handler = makeHandler({ redis, config, clock });

  const index = await call(handler, { route: 'index' });
  assert.equal(index.statusCode, 200);
  assert.match(index.body.toString(), /content="boveda-demo-ui"/);
  assert.equal(index.headers.get('cache-control'), 'private, no-store');
  assert.equal((await call(handler, { route: 'library' })).statusCode, 401);

  for (const headers of [
    { ...VALID_POST_HEADERS, origin: 'https://attacker.example' },
    { ...VALID_POST_HEADERS, host: 'attacker.example' },
    { ...VALID_POST_HEADERS, 'x-probe-token': 'wrong' },
  ]) {
    assert.equal((await call(handler, { route: 'auth/login', method: 'POST', headers, body: {} })).statusCode, 403);
  }
  const oversized = await call(handler, {
    route: 'auth/login', method: 'POST', headers: VALID_POST_HEADERS, body: { password: 'x'.repeat(4097) },
  });
  assert.equal(oversized.statusCode, 413);

  const login = await call(handler, {
    route: 'auth/login', method: 'POST', headers: VALID_POST_HEADERS,
    body: { username: 'demo', password: 'synthetic-correct-password' },
  });
  assert.equal(login.statusCode, 200);
  const cookie = cookiePair(login.headers.get('set-cookie'));
  const library = await call(handler, { route: 'library', headers: { cookie } });
  assert.equal(library.statusCode, 200);
  assert.deepEqual(library.json(), [{ id: 'R1' }]);
});

test('handler fails closed on Redis outage and accepts only a valid same-host Vercel preview origin', async () => {
  let now = 5_000_000;
  const clock = () => now;
  const env = environment({ BOVEDA_PUBLIC_ORIGIN: undefined, VERCEL_URL: 'boveda-demo-git-preview.vercel.app' });
  const config = createConfig(env);
  const redis = new FakeRedis(clock);
  const handler = makeHandler({ redis, config, clock, env });
  const previewHeaders = {
    host: env.VERCEL_URL,
    origin: `https://${env.VERCEL_URL}`,
    'x-probe-token': 'boveda-demo-ui',
    'content-type': 'application/json',
  };
  const login = await call(handler, {
    route: 'auth/login', method: 'POST', headers: previewHeaders,
    body: { username: 'demo', password: 'synthetic-correct-password' },
  });
  assert.equal(login.statusCode, 200);
  const cookie = cookiePair(login.headers.get('set-cookie'));

  redis.outage = true;
  const session = await call(handler, { route: 'auth/session', headers: { cookie } });
  assert.equal(session.statusCode, 503);
  assert.deepEqual(session.json(), { error: 'Demo access is temporarily unavailable.', code: 'SERVICE_UNAVAILABLE' });
  assert.equal((await call(handler, { route: 'library', headers: { cookie } })).statusCode, 503);

  assert.throws(
    () => createConfig(environment({ BOVEDA_PUBLIC_ORIGIN: undefined, VERCEL_URL: 'vercel.app.attacker.example' })),
    ServiceUnavailableError,
  );
});
