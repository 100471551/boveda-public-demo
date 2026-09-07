import { ServiceUnavailableError } from './errors.mjs';

function redisEnvironment(env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (typeof url !== 'string' || !url || typeof token !== 'string' || !token) {
    throw new ServiceUnavailableError('Redis is not configured.');
  }
  return { url: url.replace(/\/+$/, ''), token };
}

export class RedisRestClient {
  constructor({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
    const { url, token } = redisEnvironment(env);
    if (typeof fetchImpl !== 'function') throw new ServiceUnavailableError('Redis transport is unavailable.');
    this.url = url;
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async command(...parts) {
    let response;
    try {
      const options = {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(parts.map((part) => String(part))),
      };
      if (typeof AbortSignal?.timeout === 'function') options.signal = AbortSignal.timeout(5_000);
      response = await this.fetchImpl(this.url, options);
      if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
      const body = await response.json();
      if (!body || body.error || !Object.prototype.hasOwnProperty.call(body, 'result')) {
        throw new Error('Redis returned an invalid response');
      }
      return body.result;
    } catch (error) {
      if (error instanceof ServiceUnavailableError) throw error;
      throw new ServiceUnavailableError('Redis request failed.');
    }
  }

  async eval(script, keys, args = []) {
    return this.command('EVAL', script, keys.length, ...keys, ...args);
  }
}

export function createRedisClient(options = {}) {
  return new RedisRestClient(options);
}
