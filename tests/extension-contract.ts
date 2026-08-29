import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import kujoPi from "../extensions/kujo.ts";

const tools: Array<{ name: string; renderResult?: unknown }> = [];
const commands: string[] = [];
const handlers: string[] = [];
const execCalls: Array<{ command: string; args: string[] }> = [];
let execMode: "success" | "missing" | "timeout" = "success";
const pi = {
  registerCommand(name: string) { commands.push(name); },
  registerTool(tool: { name: string; renderResult?: unknown }) { tools.push(tool); },
  on(name: string) { handlers.push(name); },
  getActiveTools() { return ["read"]; },
  setActiveTools() {},
  async exec(command: string, args: string[]) {
    execCalls.push({ command, args });
    if (execMode === "missing") throw new Error("ENOENT: command not found");
    if (execMode === "timeout") throw new Error("operation timed out");
    return { stdout: "kujo 1.2.3", stderr: "", code: 0, killed: false };
  },
} as any;

async function main() {
kujoPi(pi);

for (const name of ["kujo_tools", "kujo_doctor", "kujo_status", "kujo_scout", "kujo_dispatch_run", "kujo_runledger", "kujo_watchdog", "kujo_leash_approval"]) {
  assert.ok(tools.some((tool) => tool.name === name), `missing registered tool: ${name}`);
}
for (const name of ["kujo_status", "kujo_scout", "kujo_runledger", "kujo_watchdog"]) {
  assert.equal(typeof tools.find((tool) => tool.name === name)?.renderResult, "function", `missing renderer: ${name}`);
}
assert.deepEqual(commands, ["kujo"]);
assert.deepEqual(handlers, [
  "session_start", "before_agent_start", "agent_start", "agent_end", "agent_settled", "turn_start", "turn_end",
  "tool_execution_start", "tool_execution_end", "user_bash", "model_select", "before_provider_headers", "session_shutdown",
]);

const byName = (name: string) => tools.find((tool) => tool.name === name) as any;
const ctx = { cwd: mkdtempSync(join(tmpdir(), "kujo-pi-extension-")), hasUI: false, isProjectTrusted: () => true };
const success = await byName("kujo_status").execute("1", {}, undefined, undefined, ctx);
assert.equal(success.details.status, "success");
execMode = "missing";
const missing = await byName("kujo_status").execute("2", {}, undefined, undefined, ctx);
assert.equal(missing.details.status, "dependency_unavailable");
execMode = "timeout";
const timeout = await byName("kujo_status").execute("3", {}, undefined, undefined, ctx);
assert.equal(timeout.details.status, "timeout");
const rejectedPath = await byName("kujo_check").execute("4", { file: "../outside" }, undefined, undefined, ctx);
assert.equal(rejectedPath.details.status, "configuration_error");
const untrustedCtx = { ...ctx, isProjectTrusted: () => false };
const untrusted = await byName("kujo_check").execute("untrusted", { file: "source.kujo" }, undefined, undefined, untrustedCtx);
assert.equal(untrusted.details.status, "project_untrusted");
const untrustedStatus = await byName("kujo_status").execute("untrusted-status", {}, undefined, undefined, untrustedCtx);
assert.equal(untrustedStatus.details.status, "project_untrusted");
const untrustedDoctor = await byName("kujo_doctor").execute("untrusted-doctor", {}, undefined, undefined, untrustedCtx);
assert.equal(untrustedDoctor.details.status, "project_untrusted");
const untrustedEnable = await byName("kujo_tools").execute("enable", { enable: ["kujo_scout"] }, undefined, undefined, untrustedCtx);
assert.equal(untrustedEnable.details.status, "project_untrusted");
const approval = await byName("kujo_shipcheck").execute("5", {}, undefined, undefined, ctx);
assert.equal(approval.details.status, "approval_required");
const previousKujoBin = process.env.KUJO_BIN;
process.env.KUJO_BIN = process.execPath;
const updates: any[] = [];
const streamed = await byName("kujo_status").execute("stream", {}, undefined, (update: any) => updates.push(update), ctx);
assert.equal(streamed.details.status, "success");
assert.ok(updates.length >= 2, "streaming execution should publish start and completion updates");
if (previousKujoBin === undefined) delete process.env.KUJO_BIN;
else process.env.KUJO_BIN = previousKujoBin;
execMode = "success";
const missingEntrypoint = await byName("kujo_scout").execute("missing-entry", {}, undefined, undefined, ctx);
assert.equal(missingEntrypoint.details.status, "configuration_error");
const trustedEntrypoint = join(ctx.cwd, "trusted-integration.kujo");
writeFileSync(trustedEntrypoint, "# trusted integration fixture\n");
for (const variable of ["KUJO_SCOUT_ENTRY", "KUJO_SCENT_ENTRY", "KUJO_MCP_ENTRY", "KUJO_AGENTS_SMOKE_ENTRY", "KUJO_RAG_ENTRY", "KUJO_DISPATCH_ENTRY"]) {
  process.env[variable] = trustedEntrypoint;
}
const approvedCtx = { ...ctx, hasUI: true, ui: { confirm: async () => true } };
const deniedCtx = { ...ctx, hasUI: true, ui: { confirm: async () => false } };
const denied = await byName("kujo_shipcheck").execute("denied", { confirm: true }, undefined, undefined, deniedCtx);
assert.equal(denied.details.status, "approval_required", "interactive approval cannot be bypassed with confirm=true");
const fixtures: Array<[string, Record<string, unknown>]> = [
  ["kujo_scout", {}],
  ["kujo_scent", { task: "fixture" }],
  ["kujo_review_changes", {}],
  ["kujo_changebucket", {}],
  ["kujo_shipcheck", { confirm: true }],
  ["kujo_mcp_make", { confirm: true }],
  ["kujo_agents_smoke", { confirm: true }],
  ["kujo_rag_query", { question: "fixture" }],
  ["kujo_dispatch_run", { task: "fixture", confirm: true }],
  ["kujo_runledger", { action: "start" }],
];
for (const [name, params] of fixtures) {
  const result = await byName(name).execute("fixture", params, undefined, undefined, approvedCtx);
  assert.equal(result.details.status, "success", `${name} fixture failed`);
}
const dispatchCall = execCalls.find(({ args }) => args[0] === "run" && args[2] === "demo");
assert.deepEqual(dispatchCall?.args.slice(0, 3), ["run", realpathSync(trustedEntrypoint), "demo"], "Dispatch must use its configured command surface, not a workspace fallback");
const previousFetch = globalThis.fetch;
let watchdogFetchOptions: RequestInit | undefined;
process.env.KUJO_WATCHDOG_URL = "http://127.0.0.1:4318";
globalThis.fetch = async (_input, init) => {
  watchdogFetchOptions = init;
  return { ok: true, status: 200, text: async () => "ok" } as Response;
};
const watchdog = await byName("kujo_watchdog").execute("health", {}, undefined, undefined, ctx);
assert.equal(watchdog.details.status, "success");
assert.equal(watchdogFetchOptions?.redirect, "error", "Watchdog requests must not follow redirects");
globalThis.fetch = previousFetch;
delete process.env.KUJO_WATCHDOG_URL;
for (const variable of ["KUJO_SCOUT_ENTRY", "KUJO_SCENT_ENTRY", "KUJO_MCP_ENTRY", "KUJO_AGENTS_SMOKE_ENTRY", "KUJO_RAG_ENTRY", "KUJO_DISPATCH_ENTRY"]) {
  delete process.env[variable];
}
console.log("extension contract validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
