import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectIntegrations, loadSignedRegistry } from "../src/registry.mjs";

const registryPath = resolve("integrations/registry.v1.json");
const signaturePath = resolve("integrations/registry.v1.sig");
const publicKeyPath = resolve("integrations/registry.v1.pub.pem");
const loaded = loadSignedRegistry(registryPath, signaturePath, publicKeyPath);
assert.equal(loaded.signatureVerified, true);
assert.equal(loaded.manifest.integrations.length, 10);

const temp = mkdtempSync(join(tmpdir(), "kujo-pi-registry-"));
const executable = join(temp, process.platform === "win32" ? "scout.cmd" : "scout");
writeFileSync(executable, process.platform === "win32" ? "@echo scout 1.0.0\r\n" : "#!/bin/sh\necho scout 1.0.0\n");
chmodSync(executable, 0o755);
const inspected = inspectIntegrations({ ...process.env, KUJO_SCOUT_BIN: executable, KUJO_ECOSYSTEM_ROOT: "" });
const scout = inspected.integrations.find(({ id }) => id === "scout");
assert.equal(inspected.signatureVerified, true);
assert.equal(scout?.available, true);
assert.equal(scout?.source, "environment");
assert.match(scout?.actualSha256 || "", /^[a-f0-9]{64}$/);

const tampered = join(temp, "registry.json");
const manifest = JSON.parse(readFileSync(registryPath, "utf8"));
manifest.integrations[0].command = "attacker-controlled";
writeFileSync(tampered, `${JSON.stringify(manifest)}\n`);
assert.throws(() => loadSignedRegistry(tampered, signaturePath, publicKeyPath), /signature verification failed/);

const mismatchedRoot = join(temp, "ecosystem");
const mismatchedScout = join(mismatchedRoot, "scout", "scout.kujo");
await import("node:fs").then(({ mkdirSync }) => mkdirSync(join(mismatchedRoot, "scout"), { recursive: true }));
writeFileSync(mismatchedScout, "tampered\n");
const mismatch = inspectIntegrations({ ...process.env, PATH: "", KUJO_ECOSYSTEM_ROOT: mismatchedRoot });
const rejected = mismatch.integrations.find(({ id }) => id === "scout");
assert.equal(rejected?.source, "signed_registry");
assert.equal(rejected?.checksumVerified, false);
assert.equal(rejected?.available, false);

console.log("signed integration registry contract validation passed");
