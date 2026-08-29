import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = JSON.parse(execFileSync(npmCommand, ["pack", "--dry-run", "--json"], { encoding: "utf8", shell: process.platform === "win32" }));
const files = result[0].files.map(({ path }) => path);
assert.ok(files.includes("extensions/kujo.ts"));
assert.ok(files.includes("src/core.mjs"));
assert.ok(files.includes("src/extension.ts"));
assert.ok(files.includes("src/telemetry.mjs"));
assert.ok(files.includes("src/contracts.mjs"));
assert.ok(files.includes("src/registry.mjs"));
assert.ok(files.includes("integrations/registry.v1.json"));
assert.ok(files.includes("integrations/registry.v1.sig"));
assert.ok(files.includes("integrations/registry.v1.pub.pem"));
assert.ok(files.includes("schemas/result-v1.schema.json"));
assert.ok(files.includes("schemas/receipt-v1.schema.json"));
assert.ok(files.includes("schemas/approval-v1.schema.json"));
assert.ok(files.includes("schemas/integration-registry-v1.schema.json"));
assert.ok(files.includes("docs/enterprise-roadmap.md"));
assert.ok(files.includes("docs/production-readiness-next.md"));
for (const forbidden of ["tests/", ".github/", ".loop-engineering/", "node_modules/"]) {
  assert.equal(files.some((path) => path.startsWith(forbidden)), false, `package contains ${forbidden}`);
}
console.log("package contract validation passed");
