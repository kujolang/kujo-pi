import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import kujoPi, { runStreamingCommand } from "../src/extension.ts";
import { canonicalJson, sha256 } from "../src/contracts.mjs";

const tools: Array<{ name: string; renderResult?: unknown }> = [];
const commands: string[] = [];
const commandDefinitions = new Map<string, any>();
const handlers: string[] = [];
const eventHandlers = new Map<string, (...args: any[]) => any>();
const execCalls: Array<{ command: string; args: string[] }> = [];
const appendedEntries: Array<{ type: string; data: any }> = [];
let execMode: "success" | "missing" | "timeout" = "success";
let activeTools = ["read"];
const pi = {
  registerCommand(name: string, definition: any) { commands.push(name); commandDefinitions.set(name, definition); },
  registerTool(tool: { name: string; renderResult?: unknown }) { tools.push(tool); },
  on(name: string, handler: (...args: any[]) => any) { handlers.push(name); eventHandlers.set(name, handler); },
  getActiveTools() { return [...activeTools]; },
  setActiveTools(value: string[]) { activeTools = [...value]; },
  appendEntry(type: string, data: any) { appendedEntries.push({ type, data }); },
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
  "session_start", "session_tree", "before_agent_start", "agent_start", "agent_end", "agent_settled", "turn_start", "turn_end",
  "tool_execution_start", "tool_execution_end", "user_bash", "model_select", "before_provider_headers", "session_shutdown",
]);

activeTools = ["read", "kujo_scout", "kujo_watchdog"];
await eventHandlers.get("session_start")?.({}, {
  cwd: mkdtempSync(join(tmpdir(), "kujo-pi-session-")),
  ui: { setStatus() {} },
  model: undefined,
  isProjectTrusted: () => true,
  sessionManager: { getSessionId: () => "session-fixture", getBranch: () => [] },
});
assert.deepEqual(activeTools, ["read"], "session startup must reset optional activation");

const notifications: string[] = [];
const commandCtx = {
  cwd: mkdtempSync(join(tmpdir(), "kujo-pi-command-")),
  isProjectTrusted: () => true,
  ui: { notify(message: string) { notifications.push(message); } },
};
await commandDefinitions.get("kujo").handler("enable understand", commandCtx);
assert.ok(activeTools.includes("kujo_scout") && activeTools.includes("kujo_scent"), "capability packs must enable their tools");
const stateEntry = [...appendedEntries].reverse().find(({ type }) => type === "kujo-tools-state");
assert.deepEqual(stateEntry?.data.active.sort(), ["kujo_scent", "kujo_scout"]);
activeTools = ["read"];
await eventHandlers.get("session_tree")?.({}, {
  sessionManager: { getBranch: () => [{ type: "custom", customType: "kujo-tools-state", data: stateEntry?.data }] },
});
assert.ok(activeTools.includes("kujo_scout") && activeTools.includes("kujo_scent"), "session tree navigation must restore the latest activation state");
await commandDefinitions.get("kujo").handler("packs", commandCtx);
assert.match(notifications.at(-1) || "", /understand:/);
const completions = await commandDefinitions.get("kujo").getArgumentCompletions("enable und");
assert.ok(completions.some(({ label }: any) => label === "understand"), "slash command must complete capability packs");

const byName = (name: string) => tools.find((tool) => tool.name === name) as any;
const ctx = { cwd: mkdtempSync(join(tmpdir(), "kujo-pi-extension-")), hasUI: false, isProjectTrusted: () => true };
const doctorStarted = performance.now();
const doctor = await byName("kujo_doctor").execute("doctor", {}, undefined, undefined, ctx);
assert.ok(performance.now() - doctorStarted < 500, "Doctor mock contract exceeded its startup budget");
assert.equal(doctor.details.registry.signatureVerified, true);
assert.ok(Array.isArray(doctor.details.remediations));
process.env.KUJO_PI_MIN_KUJO_VERSION = "9.0.0";
process.env.KUJO_WATCHDOG_URL = "http://example.com";
process.env.KUJO_LEASH_URL = "https://leash.example.test";
const doctorNeedsFixes = await byName("kujo_doctor").execute("doctor-fixes", {}, undefined, undefined, ctx);
assert.ok(doctorNeedsFixes.details.remediations.some(({ status }: any) => status === "unsupported_version"));
assert.ok(doctorNeedsFixes.details.remediations.some(({ status }: any) => status === "policy_rejected"));
assert.ok(doctorNeedsFixes.details.remediations.some(({ status }: any) => status === "missing_token"));
delete process.env.KUJO_PI_MIN_KUJO_VERSION;
delete process.env.KUJO_WATCHDOG_URL;
delete process.env.KUJO_LEASH_URL;
const success = await byName("kujo_status").execute("1", {}, undefined, undefined, ctx);
assert.equal(success.details.status, "success");
assert.equal(success.details.schemaVersion, "kujo.pi.result.v1");
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
const enabledPack = await byName("kujo_tools").execute("enable-pack", { enable: ["review"] }, undefined, undefined, ctx);
assert.deepEqual(enabledPack.details.enabled.sort(), ["kujo_changebucket", "kujo_review_changes"]);
assert.equal(enabledPack.details.enabledPacks[0], "review");
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
const dispatchCallsBeforeDenial = execCalls.filter(({ args }) => args[0] === "run" && args[2] === "demo").length;
const deniedDispatch = await byName("kujo_dispatch_run").execute("denied-dispatch", { task: "fixture" }, undefined, undefined, deniedCtx);
assert.equal(deniedDispatch.details.status, "approval_required");
assert.equal(execCalls.filter(({ args }) => args[0] === "run" && args[2] === "demo").length, dispatchCallsBeforeDenial, "denied Dispatch approval must not execute");
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
  assert.equal(result.details.schemaVersion, "kujo.pi.result.v1", `${name} must return the versioned result contract`);
}
await byName("kujo_dispatch_run").execute("approval-binding", { task: "binding fixture" }, undefined, undefined, approvedCtx);
const dispatchApproval = [...appendedEntries].reverse().find(({ type, data }) => type === "kujo-approval" && data.operation === "dispatch");
const boundDispatchCall = [...execCalls].reverse().find(({ args }) => args[0] === "run" && args[2] === "demo");
assert.ok(boundDispatchCall?.args.includes("--yes"), "approved Dispatch execution must carry the non-interactive confirmation flag");
assert.equal(dispatchApproval?.data.argumentsDigest, sha256(canonicalJson(boundDispatchCall?.args)), "approval digest must bind the exact executed Dispatch arguments");
const approvalEntry = appendedEntries.find(({ type }) => type === "kujo-approval");
assert.equal(approvalEntry?.data.schemaVersion, "kujo.pi.approval.v1");
assert.match(approvalEntry?.data.argumentsDigest || "", /^[a-f0-9]{64}$/);
assert.equal(approvalEntry?.data.approvalSource, "interactive_ui");
const previousReceipts = process.env.KUJO_PI_RECEIPTS;
process.env.KUJO_PI_RECEIPTS = "1";
await byName("kujo_status").execute("receipt", {}, undefined, undefined, ctx);
const receiptEntry = appendedEntries.find(({ type }) => type === "kujo-receipt");
assert.equal(receiptEntry?.data.schemaVersion, "kujo.pi.receipt.v1");
assert.match(receiptEntry?.data.workspaceHash || "", /^[a-f0-9]{64}$/);
assert.equal("workspace" in (receiptEntry?.data || {}), false);
if (previousReceipts === undefined) delete process.env.KUJO_PI_RECEIPTS;
else process.env.KUJO_PI_RECEIPTS = previousReceipts;
const dispatchCall = execCalls.find(({ args }) => args[0] === "run" && args[2] === "demo");
assert.deepEqual(dispatchCall?.args.slice(0, 3), ["run", realpathSync(trustedEntrypoint), "demo"], "Dispatch must use its configured command surface, not a workspace fallback");
const previousFetch = globalThis.fetch;
let watchdogFetchOptions: RequestInit | undefined;
let watchdogFetchUrl = "";
process.env.KUJO_WATCHDOG_URL = "http://127.0.0.1:4318";
process.env.KUJO_WATCHDOG_TOKEN = "fixture-token";
process.env.KUJO_WATCHDOG_AUDIENCE = "fixture-audience";
globalThis.fetch = async (input, init) => {
  watchdogFetchUrl = String(input);
  watchdogFetchOptions = init;
  return { ok: true, status: 200, text: async () => "ok" } as Response;
};
const watchdog = await byName("kujo_watchdog").execute("health", {}, undefined, undefined, ctx);
assert.equal(watchdog.details.status, "success");
assert.equal(watchdogFetchUrl, "http://127.0.0.1:4318/healthz");
assert.equal(watchdogFetchOptions?.redirect, "error", "Watchdog requests must not follow redirects");
assert.equal((watchdogFetchOptions?.headers as Record<string, string>).authorization, "Bearer fixture-token");
assert.equal((watchdogFetchOptions?.headers as Record<string, string>)["x-kujo-audience"], "fixture-audience");
globalThis.fetch = previousFetch;
delete process.env.KUJO_WATCHDOG_URL;
delete process.env.KUJO_WATCHDOG_TOKEN;
delete process.env.KUJO_WATCHDOG_AUDIENCE;
for (const variable of ["KUJO_SCOUT_ENTRY", "KUJO_SCENT_ENTRY", "KUJO_MCP_ENTRY", "KUJO_AGENTS_SMOKE_ENTRY", "KUJO_RAG_ENTRY", "KUJO_DISPATCH_ENTRY"]) {
  delete process.env[variable];
}
const controller = new AbortController();
const cancellation = runStreamingCommand(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], ctx.cwd, controller.signal, 5_000, () => {});
setTimeout(() => controller.abort(), 25);
const cancelled = await cancellation;
assert.equal(cancelled.status, "cancelled");
console.log("extension contract validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
