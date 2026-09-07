import { createHash, pbkdf2, randomBytes as cryptoRandomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { ServiceUnavailableError } from './errors.mjs';

export const SESSION_SECONDS = 8 * 60 * 60;
export const REMEMBER_SECONDS = 14 * 24 * 60 * 60;
export const COOKIE_NAME = '__Host-boveda_demo_session';

const pbkdf2Async = promisify(pbkdf2);
const RATE_LIMIT_KEY = 'boveda:{demo}:login-attempts';
const SESSION_PREFIX = 'boveda:{demo}:session:';
const COOKIE_VALUE = /^[A-Za-z0-9_-]{43}$/;

export const RATE_LIMIT_SCRIPT = `-- BOVEDA_RATE_LIMIT_V1
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local count = redis.call('ZCARD', KEYS[1])
if count >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = window
  if oldest[2] then retry = math.max(1, tonumber(oldest[2]) + window - now) end
  redis.call('PEXPIRE', KEYS[1], window)
  return {0, retry}
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return {1, 0}`;

export const ROTATE_SESSION_SCRIPT = `-- BOVEDA_ROTATE_SESSION_V1
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
return 1`;

function sha256(value) {
  return createHash('sha256').update(value).digest();
}

function sessionKey(value) {
  return SESSION_PREFIX + sha256(value).toString('hex');
}

function cookieToken(header) {
  if (typeof header !== 'string') return null;
  const values = [];
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === COOKIE_NAME) values.push(part.slice(separator + 1).trim());
  }
  return values.length === 1 && COOKIE_VALUE.test(values[0]) ? values[0] : null;
}

function sessionCookie(value, maxAge) {
  const fields = [`${COOKIE_NAME}=${value}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (maxAge !== undefined) fields.push(`Max-Age=${maxAge}`);
  return fields.join('; ');
}

async function defaultVerifyCredential({ username, password, credential }) {
  const candidate = await pbkdf2Async(password, credential.salt, credential.iterations, 32, 'sha256');
  const usernameMatches = timingSafeEqual(sha256(username), sha256(credential.username));
  const passwordMatches = timingSafeEqual(candidate, credential.digest);
  return usernameMatches && passwordMatches;
}

function normalizeEvalResult(result) {
  if (!Array.isArray(result) || result.length < 2) throw new ServiceUnavailableError('Invalid rate-limit response.');
  const allowed = Number(result[0]);
  const retryMs = Number(result[1]);
  if (![0, 1].includes(allowed) || !Number.isFinite(retryMs) || retryMs < 0) {
    throw new ServiceUnavailableError('Invalid rate-limit response.');
  }
  return { allowed: allowed === 1, retryMs };
}

export function createAccessService({
  config,
  redis,
  clock = () => Date.now(),
  randomBytes = cryptoRandomBytes,
  verifyCredential = defaultVerifyCredential,
} = {}) {
  if (!config?.credential || !config?.authVersion || !redis) {
    throw new ServiceUnavailableError('Demo access is not configured.');
  }

  async function reserveLoginAttempt() {
    const now = clock();
    const member = randomBytes(18).toString('base64url');
    const result = await redis.eval(RATE_LIMIT_SCRIPT, [RATE_LIMIT_KEY], [now, 60_000, 5, member]);
    return normalizeEvalResult(result);
  }

  async function authenticated(cookieHeader) {
    const token = cookieToken(cookieHeader);
    if (!token) {
      await redis.command('PING');
      return false;
    }
    const key = sessionKey(token);
    const raw = await redis.command('GET', key);
    if (typeof raw !== 'string') return false;
    let session;
    try {
      session = JSON.parse(raw);
    } catch {
      return false;
    }
    const now = clock();
    if (session?.version !== config.authVersion || !Number.isFinite(session?.expiresAt) || session.expiresAt <= now) {
      try { await redis.command('DEL', key); } catch { /* Authentication already fails closed. */ }
      return false;
    }
    return true;
  }

  async function login(username, password, remember = false, oldCookie) {
    if (
      typeof username !== 'string'
      || typeof password !== 'string'
      || username.length > 128
      || password.length > 512
      || typeof remember !== 'boolean'
    ) return { status: 400 };

    const limit = await reserveLoginAttempt();
    if (!limit.allowed) return { status: 429, retryAfter: Math.max(1, Math.ceil(limit.retryMs / 1000)) };

    let matches;
    try {
      matches = await verifyCredential({ username, password, credential: config.credential });
    } catch {
      throw new ServiceUnavailableError('Credential verification failed.');
    }
    if (matches !== true) return { status: 401 };

    const oldToken = cookieToken(oldCookie);
    let token;
    for (let attempt = 0; attempt < 4 && (!token || token === oldToken); attempt += 1) {
      token = randomBytes(32).toString('base64url');
    }
    if (!COOKIE_VALUE.test(token)) throw new ServiceUnavailableError('Session generation failed.');
    if (token === oldToken) throw new ServiceUnavailableError('Session rotation failed.');
    const duration = remember ? REMEMBER_SECONDS : SESSION_SECONDS;
    const expiresAt = clock() + duration * 1000;
    const value = JSON.stringify({ version: config.authVersion, expiresAt });
    const oldKey = oldToken ? sessionKey(oldToken) : sessionKey(token);
    await redis.eval(ROTATE_SESSION_SCRIPT, [oldKey, sessionKey(token)], [value, duration]);
    return { status: 200, cookie: sessionCookie(token, remember ? duration : undefined) };
  }

  async function logout(cookieHeader) {
    const token = cookieToken(cookieHeader);
    if (token) await redis.command('DEL', sessionKey(token));
    else await redis.command('PING');
    return sessionCookie('', 0);
  }

  return { authenticated, login, logout };
}
