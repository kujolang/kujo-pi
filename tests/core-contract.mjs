import assert from "node:assert/strict";
import { OPTIONAL_TOOLS, commandResult, receiptPath, truncateOutput, workspacePath } from "../src/core.mjs";

assert.ok(OPTIONAL_TOOLS.includes("kujo_dispatch_run"));
assert.equal(workspacePath("/tmp/project", "src/index.ts"), "/tmp/project/src/index.ts");
assert.throws(() => workspacePath("/tmp/project", "../outside"), /inside/);
assert.equal(truncateOutput("abcdef", 3), "abc\n\n[output truncated at 3 characters]");
assert.deepEqual(commandResult({ stdout: "ok", stderr: "", code: 0, killed: false }, "test"), {
  ok: true, label: "test", code: 0, killed: false, output: "ok",
});
assert.match(receiptPath("/tmp/project", "run-1"), /\.kujo\/pi\/receipts\/run-1\.json$/);
assert.throws(() => receiptPath("/tmp/project", "../bad"), /runId/);

console.log("core contract validation passed");
