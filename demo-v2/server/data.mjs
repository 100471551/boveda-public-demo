import { createDecipheriv } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { DataNotFoundError, ServiceUnavailableError } from './errors.mjs';

const AUDIT_ID = /^(?:R(?:[1-9]|1[0-9]|2[0-2])|R6_Fresh|R13_Fresh|audit_[a-f0-9]{32})$/;
const EVIDENCE_ID = /^E[0-9]{4,}$/;
const STAGES = new Set(['S1', 'S2', 'S3', 'S4', 'Q1', 'Q2', 'S6']);
const STUB_IDS = new Set(['R10', 'R20']);
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function requireAuditId(value) {
  if (typeof value !== 'string' || !AUDIT_ID.test(value)) throw new DataNotFoundError();
  return value;
}

function decodeBase64(value, expectedLength) {
  if (typeof value !== 'string' || !BASE64.test(value)) throw new ServiceUnavailableError('Invalid encrypted data envelope.');
  const decoded = Buffer.from(value, 'base64');
  if (expectedLength !== undefined && decoded.length !== expectedLength) {
    throw new ServiceUnavailableError('Invalid encrypted data envelope.');
  }
  return decoded;
}

function decryptEnvelope(bytes, key, logicalName) {
  let envelope;
  try {
    envelope = JSON.parse(bytes.toString('utf8'));
    const iv = decodeBase64(envelope.iv, 12);
    const tag = decodeBase64(envelope.tag, 16);
    const ciphertext = decodeBase64(envelope.ciphertext);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(logicalName, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    if (error instanceof ServiceUnavailableError) throw error;
    throw new ServiceUnavailableError('Encrypted demo data could not be authenticated.');
  }
}

export function createDataStore({ dataKey, read = readFile, dataRoot = new URL('../data/', import.meta.url) } = {}) {
  if (!Buffer.isBuffer(dataKey) || dataKey.length !== 32) {
    throw new ServiceUnavailableError('Demo data encryption is not configured.');
  }

  async function load(logicalName) {
    let bytes;
    try {
      bytes = await read(new URL(`${logicalName}.enc`, dataRoot));
    } catch (error) {
      if (error?.code === 'ENOENT') throw new DataNotFoundError();
      throw new ServiceUnavailableError('Encrypted demo data could not be read.');
    }
    return decryptEnvelope(Buffer.from(bytes), dataKey, logicalName);
  }

  async function loadJson(logicalName) {
    try {
      return JSON.parse((await load(logicalName)).toString('utf8'));
    } catch (error) {
      if (error instanceof DataNotFoundError || error instanceof ServiceUnavailableError) throw error;
      throw new ServiceUnavailableError('Demo data is malformed.');
    }
  }

  return {
    async library() {
      const value = await loadJson('library.json');
      if (!Array.isArray(value) && (typeof value !== 'object' || value === null)) {
        throw new ServiceUnavailableError('Demo library is malformed.');
      }
      return value;
    },

    async audit(rawId) {
      const id = requireAuditId(rawId);
      const value = await loadJson(`${id}.json`);
      if (!value || typeof value !== 'object' || value.id !== id) {
        throw new ServiceUnavailableError('Demo audit identity differs.');
      }
      return value;
    },

    async canonical(rawId) {
      const id = requireAuditId(rawId);
      if (STUB_IDS.has(id)) throw new DataNotFoundError();
      return load(`${id}.canonical.md`);
    },

    async evidence(rawId, stage, evidenceId) {
      const id = requireAuditId(rawId);
      if (STUB_IDS.has(id) || !STAGES.has(stage) || typeof evidenceId !== 'string' || !EVIDENCE_ID.test(evidenceId)) {
        throw new DataNotFoundError();
      }
      const records = await loadJson(`${id}.evidence.json`);
      const key = `${stage}:${evidenceId}`;
      if (!records || typeof records !== 'object' || Array.isArray(records) || !Object.prototype.hasOwnProperty.call(records, key)) {
        throw new DataNotFoundError();
      }
      return records[key];
    },
  };
}
