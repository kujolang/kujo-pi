import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const result = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }));
const files = result[0].files.map(({ path }) => path);
assert.ok(files.includes("extensions/kujo.ts"));
assert.ok(files.includes("src/core.mjs"));
assert.ok(files.includes("src/extension.ts"));
assert.ok(files.includes("src/telemetry.mjs"));
assert.ok(files.includes("docs/enterprise-roadmap.md"));
assert.ok(files.includes("docs/production-readiness-next.md"));
for (const forbidden of ["tests/", ".github/", ".loop-engineering/", "node_modules/"]) {
  assert.equal(files.some((path) => path.startsWith(forbidden)), false, `package contains ${forbidden}`);
}
console.log("package contract validation passed");
