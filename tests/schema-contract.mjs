import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

console.log("versioned result, approval, and receipt schema validation passed");
