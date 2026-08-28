import assert from "node:assert/strict";
import kujoPi from "../extensions/kujo.ts";

const tools: string[] = [];
const commands: string[] = [];
const handlers: string[] = [];
const pi = {
  registerCommand(name: string) { commands.push(name); },
  registerTool(tool: { name: string }) { tools.push(tool.name); },
  on(name: string) { handlers.push(name); },
  getActiveTools() { return ["read"]; },
  setActiveTools() {},
} as any;

kujoPi(pi);

for (const name of ["kujo_tools", "kujo_doctor", "kujo_status", "kujo_scout", "kujo_dispatch_run", "kujo_runledger", "kujo_watchdog", "kujo_leash_approval"]) {
  assert.ok(tools.includes(name), `missing registered tool: ${name}`);
}
assert.deepEqual(commands, ["kujo"]);
assert.deepEqual(handlers, ["session_start"]);
console.log("extension contract validation passed");
