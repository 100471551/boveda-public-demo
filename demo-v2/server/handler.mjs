import { readFile } from 'node:fs/promises';

import { createAccessService } from './access.mjs';
import { createConfig, originAllowed } from './config.mjs';
import { createDataStore } from './data.mjs';
import { DataNotFoundError, ServiceUnavailableError } from './errors.mjs';
import { createRedisClient } from './redis.mjs';

const UI_TOKEN = 'boveda-demo-ui';
const MAX_JSON_BYTES = 4096;
const INDEX_PATH = new URL('../web/index.html', import.meta.url);

function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function query(req, name) {
  const direct = req.query?.[name];
  if (Array.isArray(direct)) return direct.length === 1 ? direct[0] : undefined;
  if (direct !== undefined) return direct;
  try {
    return new URL(req.url || '/', 'https://request.invalid').searchParams.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function route(req) {
  const value = query(req, 'route');
  if (typeof value !== 'string') return '';
  return value.replace(/^\/+|\/+$/g, '');
}

function setCommonHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'none'; img-src 'self'; font-src 'self'; media-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'self'");
}

function send(res, status, body, contentType = 'application/json; charset=utf-8', extraHeaders = {}) {
  const bytes = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  res.statusCode = status;
  setCommonHeaders(res);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(bytes.length));
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  res.end(bytes);
}

async function readJson(req) {
  const contentType = String(header(req, 'content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw Object.assign(new Error('JSON required'), { status: 415 });
  const declared = header(req, 'content-length');
  if (declared !== undefined) {
    const length = Number(declared);
    if (!Number.isInteger(length) || length < 0) throw Object.assign(new Error('Invalid request size'), { status: 400 });
    if (length > MAX_JSON_BYTES) throw Object.assign(new Error('Request too large'), { status: 413 });
  }

  let raw = req.body;
  if (raw === undefined && req[Symbol.asyncIterator]) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_JSON_BYTES) throw Object.assign(new Error('Request too large'), { status: 413 });
      chunks.push(bytes);
    }
    raw = Buffer.concat(chunks);
  }
  if (raw === undefined || raw === null || raw === '') raw = '{}';
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) {
    if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > MAX_JSON_BYTES) {
      throw Object.assign(new Error('Request too large'), { status: 413 });
    }
    if (Array.isArray(raw)) throw Object.assign(new Error('Invalid request'), { status: 400 });
    return raw;
  }
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8');
  if (bytes.length > MAX_JSON_BYTES) throw Object.assign(new Error('Request too large'), { status: 413 });
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request');
    return value;
  } catch {
    throw Object.assign(new Error('Invalid request'), { status: 400 });
  }
}

function authRequired(res) {
  send(res, 401, { error: 'Log in to continue.', code: 'AUTH_REQUIRED' });
}

export function createDemoHandler(options = {}) {
  const env = options.env || process.env;
  let dependencies;

  function getDependencies() {
    if (dependencies) return dependencies;
    const config = options.config || createConfig(env);
    const redis = options.redis || createRedisClient({ env, fetchImpl: options.fetchImpl });
    dependencies = {
      config,
      access: options.access || createAccessService({
        config,
        redis,
        clock: options.clock,
        randomBytes: options.randomBytes,
        verifyCredential: options.verifyCredential,
      }),
      data: options.data || createDataStore({ dataKey: config.dataKey, read: options.readData }),
      indexLoader: options.indexLoader || (() => readFile(INDEX_PATH, 'utf8')),
    };
    return dependencies;
  }

  return async function demoHandler(req, res) {
    try {
      const { config, access, data, indexLoader } = getDependencies();
      const requestRoute = route(req);
      const method = String(req.method || 'GET').toUpperCase();

      if (method === 'GET' && requestRoute === 'index') {
        const html = String(await indexLoader()).replaceAll('__PROBE_TOKEN__', UI_TOKEN);
        send(res, 200, html, 'text/html; charset=utf-8');
        return;
      }

      if (method === 'GET' && requestRoute === 'auth/session') {
        const authenticated = await access.authenticated(header(req, 'cookie'));
        send(res, 200, { enabled: true, authenticated, hostedDemo: true });
        return;
      }

      if (method === 'POST') {
        if (!originAllowed(config, header(req, 'origin'), header(req, 'host')) || header(req, 'x-probe-token') !== UI_TOKEN) {
          send(res, 403, { error: 'This action must originate in the app.' });
          return;
        }
        const value = await readJson(req);
        if (requestRoute === 'auth/login') {
          const result = await access.login(value.username, value.password, value.remember ?? false, header(req, 'cookie'));
          if (result.status === 200) {
            send(res, 200, { enabled: true, authenticated: true, hostedDemo: true }, undefined, { 'Set-Cookie': result.cookie });
          } else if (result.status === 429) {
            send(res, 429, { error: 'Too many attempts. Please wait a minute and try again.' }, undefined, { 'Retry-After': String(result.retryAfter) });
          } else if (result.status === 400) {
            send(res, 400, { error: 'Invalid login request.' });
          } else {
            send(res, 401, { error: 'The username or password is incorrect.' });
          }
          return;
        }
        if (requestRoute === 'auth/logout') {
          const cookie = await access.logout(header(req, 'cookie'));
          send(res, 200, { enabled: true, authenticated: false, hostedDemo: true }, undefined, { 'Set-Cookie': cookie });
          return;
        }
        authRequired(res);
        return;
      }

      if (method !== 'GET') {
        send(res, 405, { error: 'Method not allowed.' }, undefined, { Allow: 'GET, POST' });
        return;
      }

      if (!['library', 'audit', 'evidence', 'canonical', 'visual-asset'].includes(requestRoute)) {
        send(res, 404, { error: 'Not found.' });
        return;
      }
      if (!(await access.authenticated(header(req, 'cookie')))) {
        authRequired(res);
        return;
      }

      if (requestRoute === 'library') {
        send(res, 200, await data.library());
      } else if (requestRoute === 'audit') {
        send(res, 200, await data.audit(query(req, 'audit')));
      } else if (requestRoute === 'evidence') {
        send(res, 200, await data.evidence(query(req, 'audit'), query(req, 'stage'), query(req, 'evidence')));
      } else if (requestRoute === 'visual-asset') {
        const asset = await data.visualAsset(query(req, 'audit'), query(req, 'asset'));
        send(res, 200, asset.bytes, asset.mime);
      } else {
        const id = query(req, 'audit');
        const markdown = await data.canonical(id);
        send(res, 200, markdown, 'text/markdown; charset=utf-8', {
          'Content-Disposition': `attachment; filename="Boveda_${String(id).replace(/[^A-Za-z0-9_-]/g, '')}_Canonical_Audit.md"`,
        });
      }
    } catch (error) {
      if (error instanceof DataNotFoundError) {
        send(res, 404, { error: error.message });
      } else if (error instanceof ServiceUnavailableError) {
        send(res, 503, { error: 'Demo access is temporarily unavailable.', code: 'SERVICE_UNAVAILABLE' });
      } else if (Number.isInteger(error?.status)) {
        send(res, error.status, { error: error.message });
      } else {
        send(res, 503, { error: 'Demo access is temporarily unavailable.', code: 'SERVICE_UNAVAILABLE' });
      }
    }
  };
}
