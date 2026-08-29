// @ts-check
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const OPTIONAL_TOOLS = [
  "kujo_scout",
  "kujo_scent",
  "kujo_review_changes",
  "kujo_changebucket",
  "kujo_shipcheck",
  "kujo_mcp_make",
  "kujo_dispatch_run",
  "kujo_agents_smoke",
  "kujo_runledger",
  "kujo_watchdog",
  "kujo_leash_approval",
  "kujo_rag_query",
];

/** @param {string} workspace @param {string} [candidate] */
export function workspacePath(workspace, candidate = ".") {
  const root = resolve(workspace);
  const target = resolve(root, candidate);
  const lexicalRel = relative(root, target);
  if (lexicalRel.startsWith("..") || isAbsolute(lexicalRel)) {
    throw new Error(`Path must stay inside the Pi workspace: ${candidate}`);
  }
  const existing = existingAncestor(target);
  const rel = relative(realpathSync(root), realpathSync(existing));
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path must stay inside the Pi workspace: ${candidate}`);
  }
  return target;
}

/** @param {string|undefined} value @param {string} variable */
export function configuredEntrypoint(value, variable) {
  if (!value) throw new Error(`Set ${variable} to the absolute path of the trusted Kujo entrypoint`);
  if (!isAbsolute(value)) throw new Error(`${variable} must be an absolute path`);
  const entrypoint = realpathSync(value);
  if (!statSync(entrypoint).isFile()) throw new Error(`${variable} must point to a file`);
  return entrypoint;
}

/** @param {string} target */
function existingAncestor(target) {
  let current = target;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) throw new Error(`Unable to resolve workspace path: ${target}`);
    current = parent;
  }
  return current;
}

/** @param {string} value @param {number} [maxChars] */
export function truncateOutput(value, maxChars = 12_000) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1) throw new Error("maxChars must be a positive integer");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[output truncated at ${maxChars} characters]`;
}

/** @param {{stdout: string, stderr: string, code: number|null, killed: boolean, timedOut?: boolean, cancelled?: boolean}} result @param {string} label */
export function commandResult(result, label) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  const status = result.cancelled ? "cancelled"
    : result.timedOut ? "timeout"
      : result.killed ? "timeout_or_cancelled"
        : result.code === 0 ? "success" : "command_failed";
  return {
    ok: result.code === 0 && !result.killed,
    status,
    label,
    code: result.code,
    killed: result.killed,
    output: truncateOutput(output || `${label} completed without output.`),
  };
}

/** @param {unknown} error */
export function errorResult(error) {
  const message = String(error);
  const lower = message.toLowerCase();
  const status = lower.includes("abort") ? "cancelled"
    : lower.includes("timed out") || lower.includes("timeout") ? "timeout"
      : lower.includes("not found") || lower.includes("enoent") ? "dependency_unavailable"
        : "request_error";
  return { ok: false, status, message };
}

/** @param {string} value */
export function versionFromOutput(value) {
  const match = value.match(/(?:^|\s|v)(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** @param {number[]|null} actual @param {number[]|null} minimum */
export function meetsMinimumVersion(actual, minimum) {
  if (!actual || !minimum) return null;
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

/** @param {string} workspace @param {string} runId */
export function receiptPath(workspace, runId) {
  if (!/^[a-zA-Z0-9._-]{1,96}$/.test(runId)) {
    throw new Error("runId must contain only letters, numbers, dots, underscores, and hyphens");
  }
  return workspacePath(workspace, `.kujo/pi/receipts/${runId}.json`);
}

/** @param {Record<string, string>} environment */
export function redactEnvironment(environment) {
  return Object.fromEntries(Object.keys(environment)
    .filter((key) => !/(key|token|secret|password|credential)/i.test(key))
    .map((key) => [key, environment[key]]));
}

/** @param {string} base @param {string} path */
export function sameOriginUrl(base, path = "/health") {
  const configured = new URL(base);
  if (!/^https?:$/.test(configured.protocol) || configured.username || configured.password) {
    throw new Error("Configured service URL must use http(s) without embedded credentials");
  }
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(configured.hostname);
  if (!localHost && configured.protocol !== "https:") {
    throw new Error("Remote service URLs must use HTTPS; HTTP is limited to localhost");
  }
  if (!path.startsWith("/")) throw new Error("Service paths must begin with '/'");
  const endpoint = new URL(path, configured);
  if (endpoint.origin !== configured.origin) throw new Error("Service path must stay on the configured origin");
  return endpoint;
}

/** @param {Response} response @param {number} [maxChars] */
export async function boundedResponse(response, maxChars = 12_000) {
  if (!response.body?.getReader) return truncateOutput(await response.text(), maxChars);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let truncated = false;
  try {
    while (output.length < maxChars) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      const remaining = Math.max(1, maxChars - output.length);
      const readLimit = Math.min(bytes.length, remaining * 4 + 4);
      output += decoder.decode(bytes.slice(0, readLimit), { stream: true });
      if (output.length >= maxChars || bytes.length > readLimit) {
        truncated = true;
        await reader.cancel();
      }
    }
    output += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return truncated ? `${output.slice(0, maxChars)}\n\n[output truncated at ${maxChars} characters]` : output;
}

/** @param {AbortSignal|undefined} signal @param {number} [timeoutMs] */
export function requestSignal(signal, timeoutMs = 30_000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("timeoutMs must be a positive integer");
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** @param {number} milliseconds @param {AbortSignal|undefined} signal */
function retryDelay(milliseconds, signal) {
  return new Promise((resolveDelay, rejectDelay) => {
    if (signal?.aborted) {
      rejectDelay(signal.reason);
      return;
    }
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolveDelay(undefined);
    };
    const abort = () => {
      clearTimeout(timer);
      rejectDelay(signal?.reason);
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** @param {(signal: AbortSignal) => Promise<Response>} request @param {AbortSignal|undefined} signal @param {number} [attempts] @param {number} [timeoutMs] */
export async function fetchWithRetry(request, signal, attempts = 3, timeoutMs = 30_000) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new Error("attempts must be an integer between 1 and 10");
  }
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await request(requestSignal(signal, timeoutMs));
      if (response.status < 500 && response.status !== 408 && response.status !== 429) return response;
      try {
        await response.body?.cancel();
      } catch {
        // The retry still proceeds if the remote body is already closed.
      }
      last = new Error(`remote service returned ${response.status}`);
    } catch (error) {
      last = error;
      if (signal?.aborted) throw error;
    }
    if (attempt + 1 < attempts) await retryDelay(100 * (attempt + 1), signal);
  }
  throw last;
}

/** @param {unknown} value @param {number} [maxChars] */
export function boundedJson(value, maxChars = 64_000) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("JSON payload must be serializable");
  if (serialized.length > maxChars) throw new Error(`JSON payload exceeds ${maxChars} characters`);
  return serialized;
}
