// @ts-check
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir, readFile, readlink, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

// Spools are local to one machine. Include Linux's boot and PID namespace so
// containers sharing a hostname cannot mistake each other's process IDs.
async function readOwnerScope() {
  let identity = hostname();
  if (process.platform === "linux") {
    try {
      identity += `:${await readFile("/proc/sys/kernel/random/boot_id", "utf8")}:${await readlink("/proc/self/ns/pid")}`;
    } catch {
      // No reliable namespace identity: preserve telemetry, disable recovery.
      return null;
    }
  }
  return createHash("sha256").update(identity).digest("hex").slice(0, 32);
}

/** @type {Promise<string|null>|undefined} */
let scopePromise;
function ownerScope() { return scopePromise ??= readOwnerScope(); }

/** @param {string} directory */
export async function temporarySpoolPath(directory) {
  return join(directory, `.kujo-pi-${await ownerScope() ?? "unowned"}-${process.pid}-${randomUUID()}.tmp`);
}

/** @param {string} name */
export function isSpoolBatchName(name) {
  return /^\d{16}-[a-z0-9-]{1,128}\.json$/i.test(name);
}

/** @param {string} path @param {number} limit */
export async function readSpoolFile(path, limit) {
  if (!(await lstat(path)).isFile()) return null;
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit || (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o022)))) return null;
    const buffer = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    return length === info.size ? buffer.subarray(0, length) : null;
  } finally { await file.close(); }
}

const metadataNames = new Set("pi_agent_run pi.turn pi.agent_run pi.telemetry_spool run_started agent_attempt_started agent_attempt_ended turn_started turn_completed tool_started tool_failed tool_completed shell_requested model_selected run_completed run_failed persistence_saved".split(" "));
const numericAttributes = new Set("sequence attempt attempts turn_index input_tokens output_tokens cached_input_tokens cache_write_input_tokens".split(" "));
const booleanAttributes = new Set(["will_retry", "success", "excluded_from_context"]);
const textAttributes = new Set("project_hash telemetry_mode provider model stop_reason tool_name tool_kind command_class source status storage durability".split(" "));
const recordFields = "record_id record_type trace_id span_id parent_span_id observed_at started_at ended_at kind name status source references attributes usage costs error content privacy";
const usageNumbers = "input_tokens output_tokens total_tokens cached_input_tokens cache_write_input_tokens".split(" ");

/** @param {any} value @param {string} fields */
function exactFields(value, fields) {
  const expected = fields.split(" ");
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

/** @param {unknown} value */
function metadataId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_.:/+@-]{0,255}$/i.test(value);
}

/** @param {unknown} value */
function count(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** @param {any} value */
function adapterIdentity(value) {
  return value.adapter_id === "kujo-pi.native" && value.adapter_version === "watchdog.ingestion-adapter.v1" &&
    value.original_schema === "kujo-pi.lifecycle.v1";
}

/** @param {any} record */
function metadataRecord(record) {
  return exactFields(record, recordFields) && ["trace", "span", "event"].includes(record.record_type) &&
    typeof record.record_id === "string" && /^pi:(trace|span|event):[a-z0-9-]{1,128}$/i.test(record.record_id) &&
    typeof record.trace_id === "string" && /^[a-f0-9]{32}$/.test(record.trace_id) &&
    [record.span_id, record.parent_span_id].every(id => id === null || (typeof id === "string" && /^[a-f0-9]{16}$/.test(id))) &&
    [record.observed_at, record.started_at, record.ended_at].every(time => time === null || (typeof time === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time))) &&
    [null, "internal", "workflow", "execution", "tool", "persistence"].includes(record.kind) &&
    (metadataNames.has(record.name) || (typeof record.name === "string" && /^tool\.[a-z0-9][a-z0-9_.-]{0,255}$/i.test(record.name))) &&
    ["ok", "error", "cancelled", "timeout", "denied", "unset"].includes(record.status) &&
    exactFields(record.source, "producer adapter_id adapter_version original_schema") && record.source.producer === "kujo-pi" && adapterIdentity(record.source) &&
    Array.isArray(record.references) && record.references.length === 2 &&
    Array.from(record.references).every((/** @type {any} */ ref, index) => exactFields(ref, "type id namespace relation") && metadataId(ref.id) && ref.namespace === "kujo-pi" &&
      (index === 0 ? ref.type === "session" && ref.relation === "groups" : ref.type === "run" && ref.relation === "originates")) &&
    record.attributes && typeof record.attributes === "object" && !Array.isArray(record.attributes) &&
    Object.entries(record.attributes).every(([key, value]) => numericAttributes.has(key) ? count(value) :
      booleanAttributes.has(key) ? typeof value === "boolean" : textAttributes.has(key) && metadataId(value)) &&
    (record.usage === null || (exactFields(record.usage, usageNumbers.join(" ") + " reasoning_tokens usage_source total_semantics provider_usage") &&
      usageNumbers.every(key => count(record.usage[key])) && record.usage.reasoning_tokens === null && record.usage.provider_usage === null &&
      record.usage.usage_source === "pi" && record.usage.total_semantics === "input_plus_output")) &&
    record.error === null && [record.costs, record.content].every(value => Array.isArray(value) && value.length === 0) &&
    exactFields(record.privacy, "content_mode policy_version transformations") && record.privacy.content_mode === "off" &&
    record.privacy.policy_version === "watchdog.privacy.v1" && Array.isArray(record.privacy.transformations) && record.privacy.transformations.length === 0;
}

/** Keep replay on the same metadata-only wire contract as live batches.
 * @param {any} batch @param {string} schema */
export function isMetadataBatch(batch, schema) {
  return exactFields(batch, "schema_version batch_id sent_at producer records") && batch.schema_version === schema &&
    typeof batch.batch_id === "string" && /^pi:[a-z0-9-]{1,128}:\d+:[a-z0-9-]{1,128}$/i.test(batch.batch_id) &&
    typeof batch.sent_at === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(batch.sent_at) &&
    exactFields(batch.producer, "name version adapter_id adapter_version original_schema") && batch.producer.name === "kujo-pi" &&
    typeof batch.producer.version === "string" && /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(batch.producer.version) && adapterIdentity(batch.producer) &&
    Array.isArray(batch.records) && batch.records.length > 0 && batch.records.length <= 64 && batch.records.every(metadataRecord);
}

/** Remove only recognized regular files whose local owning process is gone.
 * Live/reused PIDs, foreign scopes, old formats and uncertain liveness are kept.
 * @param {string} directory
 */
export async function recoverSpoolTemporaries(directory) {
  const scope = await ownerScope();
  if (!scope) return { recovered: 0, deferred: 0 };
  let recovered = 0;
  let deferred = 0;
  for await (const entry of await opendir(directory)) {
    const name = entry.name;
    const match = /^\.kujo-pi-([a-f0-9]{32})-([1-9][0-9]*)-([a-f0-9-]{36})\.tmp$/.exec(name);
    if (!match || match[1] !== scope) continue;
    const pid = Number(match[2]);
    if (!Number.isSafeInteger(pid) || pid > 2_147_483_647) continue;
    try { process.kill(pid, 0); continue; }
    catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ESRCH")) continue;
    }
    const path = join(directory, name);
    try {
      if (!(await lstat(path)).isFile()) continue;
      await unlink(path);
      recovered += 1;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "ENOENT") continue;
        // Windows can deny a competing unlink while deletion is pending.
        // Preserve inaccessible files and surface deferred cleanup to Doctor.
        if (["EPERM", "EACCES", "EBUSY"].includes(String(error.code))) { deferred += 1; continue; }
      }
      throw error;
    }
  }
  return { recovered, deferred };
}
