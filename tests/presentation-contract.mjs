import assert from "node:assert/strict";
import { presentResult } from "../src/presentation.mjs";

assert.deepEqual(presentResult({ ok: true, label: "Scout", status: "success", output: "mapped" }), {
  tone: "success",
  summary: "✓ Scout · success",
  output: "mapped",
});

const approval = presentResult({ ok: false, label: "ShipCheck", status: "approval_required", operationId: "op_fixture" });
assert.equal(approval.tone, "warning");
assert.match(approval.output, /approve explicitly/);
assert.match(approval.output, /op_fixture/);

const doctor = presentResult({ ok: true, label: "Doctor", status: "needs_configuration", remediations: [{ name: "scout", fix: "Install Scout." }] });
assert.equal(doctor.tone, "warning");
assert.match(doctor.output, /scout: Install Scout/);
assert.ok(presentResult({ ok: true, output: "x".repeat(20_000) }).output.length <= 12_000);

console.log("result presentation contract validation passed");
