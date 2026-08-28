import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OPTIONAL_TOOLS, boundedJson, boundedResponse, commandResult, errorResult, meetsMinimumVersion, receiptPath, sameOriginUrl, truncateOutput, versionFromOutput, workspacePath } from "../src/core.mjs";

assert.ok(OPTIONAL_TOOLS.includes("kujo_dispatch_run"));
assert.ok(OPTIONAL_TOOLS.includes("kujo_shipcheck"));
const root = mkdtempSync(join(tmpdir(), "kujo-pi-"));
assert.equal(workspacePath(root, "src/index.ts"), join(root, "src/index.ts"));
assert.throws(() => workspacePath(root, "../outside"), /inside/);
mkdirSync(join(root, "safe"));
symlinkSync(tmpdir(), join(root, "escape"));
assert.throws(() => workspacePath(root, "escape/file.txt"), /inside/);
assert.equal(truncateOutput("abcdef", 3), "abc\n\n[output truncated at 3 characters]");
assert.deepEqual(commandResult({ stdout: "ok", stderr: "", code: 0, killed: false }, "test"), {
  ok: true, status: "success", label: "test", code: 0, killed: false, output: "ok",
});
assert.match(receiptPath(root, "run-1"), /\.kujo\/pi\/receipts\/run-1\.json$/);
assert.throws(() => receiptPath(root, "../bad"), /runId/);
assert.equal(sameOriginUrl("http://127.0.0.1:4318", "/health").href, "http://127.0.0.1:4318/health");
assert.throws(() => sameOriginUrl("http://127.0.0.1:4318", "https://example.com/"), /begin with/);
assert.throws(() => sameOriginUrl("http://127.0.0.1:4318", "//example.com/"), /configured origin/);
assert.throws(() => sameOriginUrl("http://example.com", "/health"), /HTTPS/);
assert.equal(boundedJson({ ok: true }), '{"ok":true}');
assert.throws(() => boundedJson("x".repeat(100), 10), /exceeds/);
assert.equal(errorResult(new Error("ENOENT: command not found")).status, "dependency_unavailable");
assert.deepEqual(versionFromOutput("kujo 1.2.3"), [1, 2, 3]);
assert.equal(meetsMinimumVersion([1, 3, 0], [1, 2, 9]), true);
assert.equal(meetsMinimumVersion([1, 2, 3], [1, 2, 3]), true);
const response = { text: async () => "x".repeat(20_000) };
assert.equal((await boundedResponse(response, 10)).length, 47);

console.log("core contract validation passed");
