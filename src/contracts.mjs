// @ts-check
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

export const RESULT_SCHEMA_VERSION = "kujo.pi.result.v1";
export const RECEIPT_SCHEMA_VERSION = "kujo.pi.receipt.v1";
export const APPROVAL_SCHEMA_VERSION = "kujo.pi.approval.v1";

/** @param {unknown} value @returns {string} */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** @param {string|Buffer} value */
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** @param {string} workspace */
export function workspaceDigest(workspace) {
  return sha256(resolve(workspace));
}

/**
 * @param {{operation: string, command: string, args: string[], workspace: string, revision?: string|null, entrypoint?: string|null, outputRoot?: string|null, payload?: unknown}} input
 */
export function createOperationDescriptor(input) {
  const argumentsDigest = sha256(canonicalJson(input.args));
  const payloadDigest = sha256(canonicalJson(input.payload ?? null));
  return {
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    operationId: `op_${randomUUID()}`,
    operation: input.operation,
    command: input.command,
    entrypoint: input.entrypoint ?? null,
    workspace: resolve(input.workspace),
    revision: input.revision ?? null,
    outputRoot: input.outputRoot ? resolve(input.outputRoot) : null,
    argumentsDigest,
    payloadDigest,
  };
}

/** @param {unknown} value @param {string|null} [operationId] */
export function versionedResult(value, operationId = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { schemaVersion: RESULT_SCHEMA_VERSION, operationId, value };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  return { ...record, schemaVersion: RESULT_SCHEMA_VERSION, operationId: typeof record.operationId === "string" ? record.operationId : operationId };
}

/** @param {string|null|undefined} root @param {number} [maxFiles] @param {number} [maxBytes] */
export function digestArtifacts(root, maxFiles = 128, maxBytes = 10_000_000) {
  if (!root || !existsSync(root)) return null;
  const absoluteRoot = resolve(root);
  /** @type {string[]} */
  const paths = [];
  /** @param {string} path */
  const visit = (path) => {
    if (paths.length >= maxFiles) return;
    let stat;
    try { stat = lstatSync(path); } catch { return; }
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(resolve(path, name));
    } else if (stat.isFile()) paths.push(path);
  };
  visit(absoluteRoot);
  let remaining = maxBytes;
  const hash = createHash("sha256");
  for (const path of paths) {
    const length = Math.min(lstatSync(path).size, Math.max(0, remaining));
    const slice = Buffer.alloc(length);
    const descriptor = openSync(path, "r");
    try { readSync(descriptor, slice, 0, length, 0); } finally { closeSync(descriptor); }
    hash.update(relative(absoluteRoot, path));
    hash.update("\0");
    hash.update(slice);
    remaining -= slice.length;
    if (remaining <= 0) break;
  }
  hash.update(`\0files=${paths.length}\0truncated=${remaining <= 0}`);
  return hash.digest("hex");
}
