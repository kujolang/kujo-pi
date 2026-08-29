import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { boundedResponse, fetchWithRetry, truncateOutput, workspacePath } from "../src/core.mjs";
import { inspectIntegrations } from "../src/registry.mjs";

const budgets = {
  registryInspectionMs: 500,
  largeWorkspaceChecksMs: 1_500,
  largeOutputMs: 250,
  retryMinMs: 250,
  retryMaxMs: 1_500,
};

let started = performance.now();
const registry = inspectIntegrations({ ...process.env, PATH: "", KUJO_ECOSYSTEM_ROOT: "" });
assert.equal(registry.signatureVerified, true);
assert.ok(performance.now() - started < budgets.registryInspectionMs);

const workspace = mkdtempSync(join(tmpdir(), "kujo-pi-performance-"));
started = performance.now();
for (let index = 0; index < 1_000; index += 1) workspacePath(workspace, `packages/p${index}/src/index.ts`);
assert.ok(performance.now() - started < budgets.largeWorkspaceChecksMs);

started = performance.now();
assert.match(truncateOutput("x".repeat(5_000_000), 12_000), /output truncated/);
const response = new Response("x".repeat(5_000_000));
assert.match(await boundedResponse(response, 12_000), /output truncated/);
assert.ok(performance.now() - started < budgets.largeOutputMs);

started = performance.now();
let attempts = 0;
await assert.rejects(fetchWithRetry(async () => ({ status: 503, body: { cancel: async () => {} } }), undefined, 3, 100));
attempts += 3;
const retryDuration = performance.now() - started;
assert.equal(attempts, 3);
assert.ok(retryDuration >= budgets.retryMinMs && retryDuration < budgets.retryMaxMs, `retry duration ${retryDuration}ms outside budget`);

console.log("performance budget validation passed");
