import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OPERATION_CONTRACTS, operationArguments } from "../src/operations.mjs";

assert.deepEqual(Object.keys(OPERATION_CONTRACTS).sort(), ["agents", "changebucket", "dispatch", "mcp", "rag", "review", "runledger", "scent", "scout", "shipcheck"]);
for (const contract of Object.values(OPERATION_CONTRACTS)) {
  assert.match(contract.integration, /^[a-z][a-z0-9-]*$/);
  assert.match(contract.binaryEnvironment, /^KUJO_[A-Z0-9_]+$/);
  assert.match(contract.entrypointEnvironment, /^KUJO_[A-Z0-9_]+$/);
}

const cwd = mkdtempSync(join(tmpdir(), "kujo-pi-operations-"));
assert.deepEqual(operationArguments("review", {}, cwd), { binary: ["handoff"], entrypoint: ["--", "handoff"] });
assert.deepEqual(operationArguments("scout", { quick: true }, cwd).binary, [cwd, "--quick"]);
assert.deepEqual(operationArguments("dispatch", { task: "audit", confirm: true }, cwd).entrypoint.slice(-1), ["--yes"]);
assert.deepEqual(operationArguments("dispatch", { task: "audit" }, cwd).entrypoint.slice(-1), ["--yes"], "the final approval-bound command must include its non-interactive confirmation flag");
assert.throws(() => operationArguments("unknown", {}, cwd), /Unsupported Kujo operation/);

const start = operationArguments("runledger", { action: "start", task: "audit" }, cwd);
assert.deepEqual(start.entrypoint, ["--", ...start.binary]);
assert.deepEqual(start.binary, ["start", "--provider", "unknown", "--model", "unknown", "--task", "audit", "--repo", cwd]);
assert.deepEqual(operationArguments("runledger", { action: "finish", runId: "run-1" }, cwd).binary,
  ["finish", "run-1", "--status", "partial", "--verdict", "Pi session finished", "--repo", cwd]);
console.log("integration operation contract validation passed");
