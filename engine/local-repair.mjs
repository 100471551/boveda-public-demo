import {
  reconstructionSchema,
  unresolvedField,
  unresolvedResult,
  unresolvedSample,
} from "./contract.mjs";

export const MAX_LOCAL_REPAIR_FIELDS = 4;

function pathSegments(trail) {
  if (typeof trail !== "string" || !trail.startsWith("record.")) return null;
  const source = trail.slice("record".length);
  const segments = [];
  const matcher = /\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g;
  let consumed = 0;
  for (const match of source.matchAll(matcher)) {
    if (match.index !== consumed) return null;
    segments.push(match[1] ?? Number(match[2]));
    consumed = match.index + match[0].length;
  }
  return consumed === source.length && segments.length ? segments : null;
}

function valueAt(root, trail) {
  const segments = pathSegments(trail);
  if (!segments) return undefined;
  let value = root;
  for (const segment of segments) {
    if (value == null || !Object.hasOwn(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}

function schemaAt(trail) {
  const segments = pathSegments(trail);
  if (!segments) return null;
  let schema = reconstructionSchema;
  for (const segment of segments) {
    schema = typeof segment === "number" ? schema?.items : schema?.properties?.[segment];
    if (!schema) return null;
  }
  return structuredClone(schema);
}

function setAt(root, trail, replacement) {
  const segments = pathSegments(trail);
  if (!segments) throw new Error(`Invalid repair path: ${trail}`);
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    if (parent == null || !Object.hasOwn(parent, segment)) throw new Error(`Repair path does not exist: ${trail}`);
    parent = parent[segment];
  }
  const final = segments.at(-1);
  if (parent == null || !Object.hasOwn(parent, final)) throw new Error(`Repair path does not exist: ${trail}`);
  parent[final] = replacement;
}

function materialPaths(root) {
  const paths = [];
  function visit(value, trail) {
    if (!value || typeof value !== "object") return;
    if (materialField(value)) {
      paths.push(trail);
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${trail}[${index}]`));
    else for (const [key, child] of Object.entries(value)) visit(child, `${trail}.${key}`);
  }
  visit(root, "record");
  return paths;
}

function errorPath(error, reconstruction) {
  const text = String(error || "");
  const explicit = text.match(/^(record(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])+):\s/)?.[1];
  if (explicit) return explicit;
  const leaf = text.match(/^([A-Za-z_][A-Za-z0-9_]*):\s/)?.[1];
  if (!leaf) return null;
  const candidates = materialPaths(reconstruction).filter((trail) => trail.endsWith(`.${leaf}`));
  return candidates.length === 1 ? candidates[0] : null;
}

function materialField(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value.state === "string" && Array.isArray(value.evidence_ids));
}

function constrainEvidenceIds(schema, allowedIds) {
  if (schema?.properties?.evidence_ids?.type === "array") {
    schema.properties.evidence_ids.items = { type: "string", enum: [...allowedIds] };
  }
  return schema;
}

export function localizeValidationFailure(reconstruction, evidence, errors) {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const grouped = new Map();
  for (const error of errors) {
    const trail = errorPath(error, reconstruction);
    if (!trail) return null;
    if (!grouped.has(trail)) grouped.set(trail, []);
    grouped.get(trail).push(error);
  }
  if (grouped.size > MAX_LOCAL_REPAIR_FIELDS) return null;

  const fields = [];
  for (const [trail, fieldErrors] of grouped) {
    const value = valueAt(reconstruction, trail);
    const fieldSchema = schemaAt(trail);
    if (!materialField(value) || !fieldSchema) return null;
    if (value.evidence_ids.length === 0 || value.evidence_ids.some((id) => !evidenceIds.has(id))) return null;
    fields.push({
      path: trail,
      value: structuredClone(value),
      evidence_ids: [...value.evidence_ids],
      errors: [...fieldErrors],
      schema: constrainEvidenceIds(fieldSchema, value.evidence_ids),
    });
  }

  for (let left = 0; left < fields.length; left += 1) {
    for (let right = left + 1; right < fields.length; right += 1) {
      if (fields[left].path.startsWith(`${fields[right].path}.`) || fields[right].path.startsWith(`${fields[left].path}.`)) return null;
    }
  }

  const cited = new Set(fields.flatMap((field) => field.evidence_ids));
  return {
    fields,
    evidence: evidence.filter((item) => cited.has(item.id)),
  };
}

export function repairResponseSchema(localization) {
  const properties = Object.fromEntries(localization.fields.map((field) => [field.path, field.schema]));
  return {
    type: "object",
    additionalProperties: false,
    required: ["repairs"],
    properties: {
      repairs: {
        type: "object",
        additionalProperties: false,
        required: localization.fields.map((field) => field.path),
        properties,
      },
    },
  };
}

function matchesType(value, type) {
  if (type === "object") return Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "null") return value === null;
  return true;
}

function matchesSchema(value, schema) {
  if (Array.isArray(schema?.anyOf)) return schema.anyOf.some((choice) => matchesSchema(value, choice));
  if (schema?.type && !matchesType(value, schema.type)) return false;
  if (schema?.enum && !schema.enum.includes(value)) return false;
  if (schema?.type === "object") {
    const keys = Object.keys(value);
    if ((schema.required || []).some((key) => !Object.hasOwn(value, key))) return false;
    if (schema.additionalProperties === false && keys.some((key) => !Object.hasOwn(schema.properties || {}, key))) return false;
    return keys.every((key) => !schema.properties?.[key] || matchesSchema(value[key], schema.properties[key]));
  }
  if (schema?.type === "array") {
    if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) return false;
    return value.every((item) => matchesSchema(item, schema.items));
  }
  return true;
}

function sameKeys(actual, expected) {
  const actualKeys = Object.keys(actual || {}).sort();
  const expectedKeys = [...expected].sort();
  return actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index]);
}

export function mergeLocalizedRepairs(reconstruction, localization, payload) {
  const repairs = payload?.repairs;
  const paths = localization.fields.map((field) => field.path);
  if (!repairs || typeof repairs !== "object" || Array.isArray(repairs) || !sameKeys(repairs, paths)) {
    throw new Error("Localized repair response did not contain exactly the requested fields.");
  }

  const merged = structuredClone(reconstruction);
  for (const field of localization.fields) {
    const replacement = repairs[field.path];
    if (!matchesSchema(replacement, field.schema)) throw new Error(`Localized repair returned an invalid contract shape for ${field.path}.`);
    if (replacement.evidence_ids.some((id) => !field.evidence_ids.includes(id))) {
      throw new Error(`Localized repair introduced evidence outside the cited set for ${field.path}.`);
    }
    setAt(merged, field.path, structuredClone(replacement));
  }

  const verification = structuredClone(merged);
  for (const field of localization.fields) setAt(verification, field.path, structuredClone(valueAt(reconstruction, field.path)));
  if (JSON.stringify(verification) !== JSON.stringify(reconstruction)) {
    throw new Error("Localized repair changed content outside the requested fields.");
  }
  return merged;
}

function unresolvedLike(value) {
  if (Object.hasOwn(value, "display_value")) return unresolvedResult();
  if (Object.hasOwn(value, "display")) return unresolvedSample();
  return unresolvedField();
}

export function unresolvedLocalizedCandidate(reconstruction, localization) {
  const unresolved = structuredClone(reconstruction);
  for (const field of localization.fields) setAt(unresolved, field.path, unresolvedLike(field.value));
  return unresolved;
}

export function localizedFieldValues(reconstruction, localization) {
  return Object.fromEntries(localization.fields.map((field) => [field.path, structuredClone(valueAt(reconstruction, field.path))]));
}
