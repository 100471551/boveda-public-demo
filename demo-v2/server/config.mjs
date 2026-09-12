import { createHash } from 'node:crypto';

import { ServiceUnavailableError } from './errors.mjs';

const HEX_32 = /^[a-fA-F0-9]{64}$/;
const DNS_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const VERCEL_HOST = new RegExp(`^(?:${DNS_LABEL}\\.)+vercel\\.app$`);

function requiredText(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ServiceUnavailableError(`Missing ${name}.`);
  }
  return value;
}

function decodeHex32(value, name) {
  if (!HEX_32.test(value || '')) {
    throw new ServiceUnavailableError(`Invalid ${name}.`);
  }
  return Buffer.from(value, 'hex');
}

function parseCredential(raw) {
  let value;
  try {
    value = JSON.parse(requiredText(raw, 'BOVEDA_DEMO_CREDENTIAL'));
  } catch (error) {
    if (error instanceof ServiceUnavailableError) throw error;
    throw new ServiceUnavailableError('Invalid BOVEDA_DEMO_CREDENTIAL.');
  }
  const username = value?.username;
  const iterations = value?.iterations;
  if (
    value?.algorithm !== 'pbkdf2_sha256'
    || typeof username !== 'string'
    || username.length < 1
    || username.length > 128
    || username !== username.trim()
    || !Number.isInteger(iterations)
    || iterations < 600_000
    || iterations > 2_000_000
  ) {
    throw new ServiceUnavailableError('Invalid BOVEDA_DEMO_CREDENTIAL.');
  }
  return {
    username,
    algorithm: value.algorithm,
    iterations,
    salt: decodeHex32(value.salt, 'credential salt'),
    digest: decodeHex32(value.password_hash, 'credential password hash'),
  };
}

function productionOrigin(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:'
      || url.origin !== raw
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash
    ) return null;
    return { origin: url.origin, host: url.host.toLowerCase() };
  } catch {
    return null;
  }
}

function previewOrigin(raw) {
  if (typeof raw !== 'string') return null;
  const host = raw.toLowerCase();
  if (host !== raw || host.length > 253 || !VERCEL_HOST.test(host)) return null;
  return { origin: `https://${host}`, host };
}

export function createConfig(env = process.env) {
  const credential = parseCredential(env.BOVEDA_DEMO_CREDENTIAL);
  const dataKey = decodeHex32(requiredText(env.BOVEDA_DATA_KEY, 'BOVEDA_DATA_KEY'), 'BOVEDA_DATA_KEY');
  const origins = [];
  const configured = productionOrigin(env.BOVEDA_PUBLIC_ORIGIN);
  if (env.BOVEDA_PUBLIC_ORIGIN && !configured) {
    throw new ServiceUnavailableError('Invalid BOVEDA_PUBLIC_ORIGIN.');
  }
  if (configured) origins.push(configured);
  for (const rawPreviewOrigin of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
    const preview = previewOrigin(rawPreviewOrigin);
    if (preview && !origins.some((entry) => entry.origin === preview.origin)) origins.push(preview);
  }
  if (origins.length === 0) throw new ServiceUnavailableError('No valid demo origin is configured.');

  const canonicalCredential = JSON.stringify({
    username: credential.username,
    algorithm: credential.algorithm,
    iterations: credential.iterations,
    salt: credential.salt.toString('hex'),
    password_hash: credential.digest.toString('hex'),
  });
  const authVersion = createHash('sha256')
    .update(canonicalCredential, 'utf8')
    .update(Buffer.from([0]))
    .update(dataKey)
    .digest('hex');

  return { credential, dataKey, origins, authVersion };
}

export function originAllowed(config, origin, host) {
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  const normalizedHost = host.toLowerCase();
  return config.origins.some((entry) => entry.origin === origin && entry.host === normalizedHost);
}
