import { createDecipheriv, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { DataNotFoundError, ServiceUnavailableError } from './errors.mjs';

const AUDIT_ID = /^(?:R(?:[1-9]|1[0-9]|2[0-2])|R6_Fresh|R13_Fresh|audit_[a-f0-9]{32})$/;
const EVIDENCE_ID = /^E[0-9]{4,}$/;
const STAGES = new Set(['S1', 'S2', 'S3', 'S4', 'Q1', 'Q2', 'S6']);
const STUB_IDS = new Set(['R10', 'R20']);
const INVALID_BASE64_CHARACTER = /[^A-Za-z0-9+/=]/;
const VISUAL_SHA = /^[a-f0-9]{64}$/;
const MAX_VISUAL_BYTES = 4 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const READY_VISUAL_STATUSES = new Set(['READY', 'PARTIAL']);

function requireAuditId(value) {
  if (typeof value !== 'string' || !AUDIT_ID.test(value)) throw new DataNotFoundError();
  return value;
}

function requireVisualSha(value) {
  if (typeof value !== 'string' || !VISUAL_SHA.test(value)) throw new DataNotFoundError();
  return value;
}

function publicAudit(value) {
  const { visual_assets: ignored, ...audit } = value;
  return audit;
}

function assetMetadata(audit, sha) {
  const metadata = audit.visual_assets?.[sha];
  const expectedPng = `visual-${sha}.png`;
  const expectedJpeg = `visual-${sha}.jpg`;
  if (!metadata) throw new DataNotFoundError();
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new ServiceUnavailableError('Visual asset metadata is malformed.');
  }
  if ((metadata.name === expectedPng && metadata.mime === 'image/png') ||
      (metadata.name === expectedJpeg && metadata.mime === 'image/jpeg')) {
    return metadata;
  }
  throw new ServiceUnavailableError('Visual asset metadata differs.');
}

function assetReferencedByVisualEvidence(audit, sha) {
  const visualEvidence = audit.visual_evidence;
  const expectedUrl = `/api/visual-asset?audit=${audit.id}&asset=${sha}`;
  if (!visualEvidence || !READY_VISUAL_STATUSES.has(visualEvidence.status)) {
    return false;
  }
  const imageRecords = [visualEvidence.items, visualEvidence.additional_images]
    .filter(Array.isArray)
    .flat();
  return imageRecords.some((item) => Array.isArray(item?.images) && item.images.some((image) => (
    image && typeof image === 'object' && image.url === expectedUrl
  )));
}

function validateVisualBytes(bytes, sha, mime) {
  if (bytes.length > MAX_VISUAL_BYTES) {
    throw new ServiceUnavailableError('Visual asset is too large.');
  }
  if (createHash('sha256').update(bytes).digest('hex') !== sha) {
    throw new ServiceUnavailableError('Visual asset digest differs.');
  }
  const signature = mime === 'image/png' ? PNG_SIGNATURE : JPEG_SIGNATURE;
  if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) {
    throw new ServiceUnavailableError('Visual asset type differs.');
  }
}

function decodeBase64(value, expectedLength) {
  // Repeated-group regexes can overflow V8's stack on valid multi-megabyte images.
  if (typeof value !== 'string' || value.length % 4 || INVALID_BASE64_CHARACTER.test(value)) throw new ServiceUnavailableError('Invalid encrypted data envelope.');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw new ServiceUnavailableError('Invalid encrypted data envelope.');
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

  async function loadAudit(rawId) {
    const id = requireAuditId(rawId);
    const value = await loadJson(`${id}.json`);
    if (!value || typeof value !== 'object' || value.id !== id) {
      throw new ServiceUnavailableError('Demo audit identity differs.');
    }
    return value;
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
      return publicAudit(await loadAudit(rawId));
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

    async visualAsset(rawId, rawSha) {
      const id = requireAuditId(rawId);
      const sha = requireVisualSha(rawSha);
      const audit = await loadAudit(id);
      const metadata = assetMetadata(audit, sha);
      if (!assetReferencedByVisualEvidence(audit, sha)) throw new DataNotFoundError();
      let bytes;
      try {
        bytes = await load(metadata.name);
      } catch (error) {
        if (error instanceof DataNotFoundError) {
          throw new ServiceUnavailableError('Visual asset is unavailable.');
        }
        throw error;
      }
      validateVisualBytes(bytes, sha, metadata.mime);
      return { bytes, mime: metadata.mime };
    },
  };
}
