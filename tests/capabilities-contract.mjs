import assert from "node:assert/strict";
import { CAPABILITIES, CAPABILITY_PACKS, CORE_TOOLS, OPTIONAL_TOOLS, capabilityByTool, capabilitySummaries, expandCapabilitySelection } from "../src/capabilities.mjs";

assert.equal(new Set(CAPABILITIES.map(({ tool }) => tool)).size, CAPABILITIES.length);
assert.equal(new Set(CAPABILITY_PACKS.map(({ id }) => id)).size, CAPABILITY_PACKS.length);
assert.deepEqual([...CORE_TOOLS, ...OPTIONAL_TOOLS].sort(), CAPABILITIES.map(({ tool }) => tool).sort());

for (const pack of CAPABILITY_PACKS) {
  assert.ok(pack.tools.length > 0, `${pack.id} must contain tools`);
  for (const tool of pack.tools) {
    const capability = capabilityByTool(tool);
    assert.ok(capability, `${pack.id} references unknown tool ${tool}`);
    assert.equal(capability.pack, pack.id, `${tool} must name its containing pack`);
    assert.equal(capability.defaultActive, false, `${pack.id} tools must remain opt-in`);
  }
}

const expanded = expandCapabilitySelection(["understand", "kujo_changebucket", "missing"]);
assert.deepEqual(expanded.tools, ["kujo_scout", "kujo_scent", "kujo_changebucket"]);
assert.deepEqual(expanded.packs, ["understand"]);
assert.deepEqual(expanded.unknown, ["missing"]);
assert.equal(capabilitySummaries().every(({ sideEffect }) => sideEffect.length > 0), true);

console.log("capability manifest and pack contract validation passed");
