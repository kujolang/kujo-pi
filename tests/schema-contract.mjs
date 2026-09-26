import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { APPROVAL_SCHEMA_VERSION, RECEIPT_SCHEMA_VERSION, RESULT_SCHEMA_VERSION, canonicalJson, createOperationDescriptor, digestArtifacts, versionedResult, workspaceDigest } from "../src/contracts.mjs";

for (const [file, version] of [
  ["schemas/integration-registry-v1.schema.json", "kujo.pi.integration-registry.v1"],
  ["schemas/result-v1.schema.json", RESULT_SCHEMA_VERSION],
  ["schemas/receipt-v1.schema.json", RECEIPT_SCHEMA_VERSION],
  ["schemas/approval-v1.schema.json", APPROVAL_SCHEMA_VERSION],
]) {
  const schema = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(schema.properties.schemaVersion.const, version);
}
assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
const result = versionedResult({ ok: true, status: "success" }, "op_test");
assert.equal(result.schemaVersion, RESULT_SCHEMA_VERSION);
assert.equal(result.operationId, "op_test");

const workspace = mkdtempSync(join(tmpdir(), "kujo-pi-contracts-"));
const descriptor = createOperationDescriptor({ operation: "shipcheck", command: "/bin/shipcheck", args: ["check", "--format", "json"], workspace, revision: "a".repeat(40), payload: { confirm: true } });
assert.equal(descriptor.schemaVersion, APPROVAL_SCHEMA_VERSION);
assert.match(descriptor.operationId, /^op_/);
assert.match(descriptor.argumentsDigest, /^[a-f0-9]{64}$/);
assert.match(descriptor.payloadDigest, /^[a-f0-9]{64}$/);
assert.equal("args" in descriptor, false, "approval records bind arguments by digest without persisting raw arguments");
assert.match(workspaceDigest(workspace), /^[a-f0-9]{64}$/);

const artifacts = join(workspace, "artifacts");
mkdirSync(artifacts);
writeFileSync(join(artifacts, "result.json"), '{"ok":true}\n');
const first = digestArtifacts(artifacts);
assert.match(first || "", /^[a-f0-9]{64}$/);
writeFileSync(join(artifacts, "result.json"), '{"ok":false}\n');
assert.notEqual(digestArtifacts(artifacts), first);


// Preserve the existing v1 digest byte sequence for supported snapshots.
function legacyDigest(root, maxFiles = 128, maxBytes = 10_000_000) {
  const paths = [];
  function visit(path) {
    if (paths.length >= maxFiles) return;
    const stat = fs.lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) for (const name of fs.readdirSync(path).sort()) visit(join(path, name));
    else if (stat.isFile()) paths.push(path);
  }
  visit(root);
  let remaining = maxBytes;
  const hash = createHash("sha256");
  for (const path of paths) {
    const data = fs.readFileSync(path).subarray(0, remaining);
    hash.update(relative(root, path)); hash.update("\0"); hash.update(data);
    remaining -= data.length;
    if (!remaining) break;
  }
  return hash.update(`\0files=${paths.length}\0truncated=${remaining <= 0}`).digest("hex");
}
mkdirSync(join(artifacts, "nested"));
writeFileSync(join(artifacts, "nested", "large.bin"), Buffer.alloc(131_089, 120));
writeFileSync(join(artifacts, "empty"), "");
for (const maxFiles of [1, 2, 128]) for (const maxBytes of [1, 17, 65_537, 200_000]) {
  assert.equal(digestArtifacts(artifacts, maxFiles, maxBytes), legacyDigest(artifacts, maxFiles, maxBytes));
}
for (const bad of [0, -1, 0.5, Infinity, NaN]) {
  assert.throws(() => digestArtifacts(artifacts, bad), /positive integer/);
  assert.throws(() => digestArtifacts(artifacts, 128, bad), /positive integer/);
  assert.throws(() => digestArtifacts(artifacts, 128, 100, bad), /positive integer/);
}
const emptyTree = join(workspace, "empty-tree");
mkdirSync(emptyTree);
for (let i = 0; i < 5; i++) mkdirSync(join(emptyTree, String(i)));
assert.throws(() => digestArtifacts(emptyTree, 128, 100, 3), /traversal exceeds 3 entries/);
assert.equal(digestArtifacts(emptyTree), legacyDigest(emptyTree));
const read = fs.readSync;
const expectedShort = legacyDigest(artifacts, 128, 123);
try {
  fs.readSync = (fd, buffer, offset, length, position) => read(fd, buffer, offset, Math.min(length, 7), position);
  syncBuiltinESMExports();
  assert.equal(digestArtifacts(artifacts, 128, 123), expectedShort, "partial reads must be retried, not padded with zeros");
  fs.readSync = () => 0;
  syncBuiltinESMExports();
  assert.throws(() => digestArtifacts(artifacts), /changed size/);
} finally { fs.readSync = read; syncBuiltinESMExports(); }
fs.rmSync(workspace, { recursive: true, force: true });

console.log("versioned result, approval, and receipt schema validation passed");
