// @ts-check
import { isAbsolute, relative, resolve } from "node:path";

export const OPTIONAL_TOOLS = [
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
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path must stay inside the Pi workspace: ${candidate}`);
  }
  return target;
}

/** @param {string} value @param {number} [maxChars] */
export function truncateOutput(value, maxChars = 12_000) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[output truncated at ${maxChars} characters]`;
}

/** @param {{stdout: string, stderr: string, code: number, killed: boolean}} result @param {string} label */
export function commandResult(result, label) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return {
    ok: result.code === 0 && !result.killed,
    label,
    code: result.code,
    killed: result.killed,
    output: truncateOutput(output || `${label} completed without output.`),
  };
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
