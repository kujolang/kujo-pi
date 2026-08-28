import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import kujoPi from "../extensions/kujo.ts";

const tools: Array<{ name: string; renderResult?: unknown }> = [];
const commands: string[] = [];
const handlers: string[] = [];
let execMode: "success" | "missing" | "timeout" = "success";
const pi = {
  registerCommand(name: string) { commands.push(name); },
  registerTool(tool: { name: string; renderResult?: unknown }) { tools.push(tool); },
  on(name: string) { handlers.push(name); },
  getActiveTools() { return ["read"]; },
  setActiveTools() {},
  async exec() {
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
assert.deepEqual(handlers, ["session_start"]);

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
const approval = await byName("kujo_shipcheck").execute("5", {}, undefined, undefined, ctx);
assert.equal(approval.details.status, "approval_required");
console.log("extension contract validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
