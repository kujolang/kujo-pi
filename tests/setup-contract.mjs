import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectIntegrations } from "../src/registry.mjs";
import { createSetupPlan, managedIntegration, validateSetupHome, setupSummary } from "../src/setup.mjs";
import { applySetupPlan, downloadInstaller } from "../src/setup-install.mjs";
import { sha256 } from "../src/contracts.mjs";

const root = realpathSync(mkdtempSync(join(tmpdir(), "kujo-pi-setup-")));
const environment = { PATH: "", KUJO_PI_HOME: join(root, "toolchain with spaces") };
const registry = inspectIntegrations(environment);
const plan = createSetupPlan(registry, "review", environment, "linux");
assert.deepEqual(plan, createSetupPlan(registry, "review", environment, "linux"));
assert.equal(existsSync(plan.home), false, "preview must not write");
assert.match(setupSummary(registry, plan), /changebucket@1\.1\.0: missing/);
assert.equal(createSetupPlan(registry, "review", environment, "win32").steps.length, 0);
assert.equal(createSetupPlan(registry, "observe", environment, "linux").steps.length, 0);
assert.throws(() => createSetupPlan(registry, "unknown", environment), /Unknown pack/);
assert.throws(() => createSetupPlan({ ...registry, signatureVerified: false }, "review", environment), /valid signed/);
await assert.rejects(applySetupPlan(plan, "wrong"), /plan changed/);
await assert.rejects(applySetupPlan({ ...plan, home: root }, plan.digest), /plan changed/);
assert.equal(existsSync(plan.home), false, "denied or altered plan must not write");
if (process.platform !== "win32") {
  symlinkSync(join(root, "absent"), join(root, "link"));
  assert.throws(() => validateSetupHome(join(root, "link", "child")), /symlink/);
}
const previousFetch = globalThis.fetch;
try {
  const bytes = Buffer.from("fixture installer");
  globalThis.fetch = async () => new Response(bytes);
  assert.deepEqual(await downloadInstaller("https://kennel.kujolang.ai/install.kujo", sha256(bytes)), bytes);
  await assert.rejects(downloadInstaller("https://kennel.kujolang.ai/install.kujo", "0".repeat(64)), /checksum changed/);
  await assert.rejects(downloadInstaller("https://untrusted.test/install", sha256(bytes)), /Invalid signed/);
  globalThis.fetch = async () => new Response(Buffer.alloc(1024 * 1024 + 1));
  await assert.rejects(downloadInstaller("https://kennel.kujolang.ai/install.kujo", sha256(bytes)), /exceeds/);
} finally { globalThis.fetch = previousFetch; }
const runtimeRoot = join(plan.home, "runtime", "node_modules");
mkdirSync(join(runtimeRoot, "@kujolang", "kujo-runtime"), { recursive: true });
mkdirSync(join(runtimeRoot, ".bin"), { recursive: true });
writeFileSync(join(runtimeRoot, ".bin", process.platform === "win32" ? "kujo.cmd" : "kujo"), "fixture");
writeFileSync(join(runtimeRoot, "@kujolang", "kujo-runtime", "package.json"), JSON.stringify({ version: "1.8.1" }));
const entry = registry.integrations.find(e => e.id === "changebucket");
const generation = join(plan.home, "kennel", "tools", "generation-fixture");
const packageRoot = join(generation, "kennel_packages", entry.package);
mkdirSync(packageRoot, { recursive: true });
writeFileSync(join(packageRoot, "changebucket.kujo"), "tampered");
const record = { version: entry.packageVersion, generation: "generation-fixture", module_roots: [packageRoot], lock: {
  kind: "registry", checksum: `sha256:${entry.archiveSha256}`, provenance_status: "registry-statement-verified",
  registry_manifest: JSON.stringify({ package: entry.package, version: entry.packageVersion, source_commit: entry.version, provenance_sha256: entry.provenanceSha256 }),
} };
const state = { schema_version: 1, packages: { [entry.package]: record } };
const save = () => writeFileSync(join(plan.home, "kennel", "tools.json"), JSON.stringify(state));
save();
assert.equal(managedIntegration(entry, environment).packageVersion, entry.packageVersion);
assert.equal(inspectIntegrations(environment).integrations.find(e => e.id === entry.id).available, false, "modified entrypoint must fail closed");
record.version = "0.0.0"; save();
assert.throws(() => managedIntegration(entry, environment), /found 0.0.0/);
record.version = entry.packageVersion;
record.module_roots = [root]; save();
assert.throws(() => managedIntegration(entry, environment), /escapes/);
record.module_roots = [packageRoot]; record.lock.provenance_status = "unverified"; save();
assert.throws(() => managedIntegration(entry, environment), /release identity/);
console.log("setup approval, installer identity and managed discovery contracts passed");
