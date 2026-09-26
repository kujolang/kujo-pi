import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, realpathSync, readFileSync, writeFileSync } from "node:fs";
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

const largeBinary = Buffer.alloc(131_089, 120);
largeBinary[largeBinary.length - 1] = 121;
writeFileSync(executable, largeBinary);
const largeInspection = inspectIntegrations({ PATH: "", KUJO_SCOUT_BIN: executable });
assert.equal(largeInspection.integrations.find(({ id }) => id === "scout").actualSha256,
  createHash("sha256").update(largeBinary).digest("hex"), "bounded hashing must include every byte and the final partial chunk");

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


const explicitEntry = join(temp, "explicit.kujo");
writeFileSync(explicitEntry, "operator entrypoint");
const entryWins = inspectIntegrations({ PATH: temp, KUJO_SCOUT_ENTRY: explicitEntry }).integrations.find(({ id }) => id === "scout");
assert.equal(entryWins.binaryPath, null, "an explicit entrypoint must outrank PATH discovery");
assert.equal(entryWins.entrypointPath, realpathSync(explicitEntry));
assert.equal(entryWins.actualSha256, createHash("sha256").update("operator entrypoint").digest("hex"));
const binaryWins = inspectIntegrations({ PATH: "", KUJO_SCOUT_BIN: executable, KUJO_SCOUT_ENTRY: "/missing-fixture" }).integrations.find(({ id }) => id === "scout");
assert.equal(binaryWins.available, true, "binary override precedence must match command execution");
assert.equal(binaryWins.entrypointPath, null);
const isolatedFailure = inspectIntegrations({ PATH: "", KUJO_SCOUT_ENTRY: join(temp, "missing"), KUJO_SCENT_ENTRY: explicitEntry });
assert.equal(isolatedFailure.signatureVerified, true);
assert.equal(isolatedFailure.integrations.find(({ id }) => id === "scout").available, false);
assert.match(isolatedFailure.integrations.find(({ id }) => id === "scout").error, /ENOENT/);
assert.equal(isolatedFailure.integrations.find(({ id }) => id === "scent").available, true);
const binaryFailure = inspectIntegrations({ PATH: temp, KUJO_SCOUT_BIN: join(temp, "missing"), KUJO_SCOUT_ENTRY: explicitEntry }).integrations.find(({ id }) => id === "scout");
assert.equal(binaryFailure.available, false, "a broken explicit binary must not silently fall back");
assert.match(binaryFailure.error, /KUJO_SCOUT_BIN/);
for (const key of ["KUJO_INTEGRATION_REGISTRY", "KUJO_INTEGRATION_REGISTRY_SIGNATURE", "KUJO_INTEGRATION_REGISTRY_PUBLIC_KEY"]) {
  assert.throws(() => inspectIntegrations({ [key]: "relative-path" }), /must be absolute/);
}

console.log("signed integration registry contract validation passed");
