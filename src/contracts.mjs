// @ts-check
import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync, opendirSync } from "node:fs";
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

/** @param {string|null|undefined} root @param {number} [maxFiles] @param {number} [maxBytes] @param {number} [maxEntries] */
export function digestArtifacts(root, maxFiles = 128, maxBytes = 10_000_000, maxEntries = 4_096) {
  for (const [name, value] of Object.entries({ maxFiles, maxBytes, maxEntries })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  }
  if (!root || !existsSync(root)) return null;
  const absoluteRoot = resolve(root);
  /** @type {string[]} */
  const paths = [];
  const pending = [absoluteRoot];
  let enumerated = 1;
  while (pending.length && paths.length < maxFiles) {
    const path = /** @type {string} */ (pending.pop());
    let stat;
    try { stat = lstatSync(path); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      // Read a bounded listing before sorting so filesystem enumeration order
      // cannot change the v1 digest. Overflow is explicit, never a partial hash.
      const names = [];
      const directory = opendirSync(path);
      try {
        let entry;
        while ((entry = directory.readSync()) !== null) {
          if (++enumerated > maxEntries) throw new Error(`Artifact traversal exceeds ${maxEntries} entries`);
          names.push(entry.name);
        }
      } finally { directory.closeSync(); }
      names.sort();
      for (let index = names.length - 1; index >= 0; index -= 1) pending.push(resolve(path, names[index]));
    } else if (stat.isFile()) paths.push(path);
  }
  let remaining = maxBytes;
  const hash = createHash("sha256");
  let buffer = Buffer.allocUnsafe(0);
  for (const path of paths) {
    const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile()) throw new Error("Artifact changed to a non-file during hashing");
      let unread = Math.min(stat.size, remaining);
      const chunkSize = Math.min(1024 * 1024, unread);
      if (buffer.length < chunkSize) buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, Math.max(chunkSize, buffer.length * 2)));
      hash.update(relative(absoluteRoot, path));
      hash.update("\0");
      while (unread > 0) {
        const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, unread), null);
        if (!count) throw new Error("Artifact changed size during hashing");
        hash.update(buffer.subarray(0, count));
        unread -= count;
        remaining -= count;
      }
    } finally { closeSync(descriptor); }
    if (remaining <= 0) break;
  }
  hash.update(`\0files=${paths.length}\0truncated=${remaining <= 0}`);
  return hash.digest("hex");
}
