import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
for (const [name, range] of Object.entries(packageJson.peerDependencies)) {
  assert.notEqual(range, "*", `${name} must declare a tested compatibility range`);
}

assert.equal(existsSync(".loop-engineering"), false, "generated loop-engineering state must not be committed");
const entrypoint = readFileSync("extensions/kujo.ts", "utf8");
assert.match(entrypoint, /export \{ default \} from "\.\.\/src\/extension\.js"/);
assert.ok(entrypoint.split("\n").length <= 4, "the public extension entrypoint must stay a thin src/ bridge");

for (const workflow of [".github/workflows/ci.yml", ".github/workflows/release.yml"]) {
  const source = readFileSync(workflow, "utf8");
  const refs = [...source.matchAll(/uses:\s+\S+@([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(refs.length > 0, `${workflow} must declare its actions`);
  assert.equal(refs.every((ref) => /^[a-f0-9]{40}$/.test(ref)), true, `${workflow} contains a mutable action reference`);
}

const release = readFileSync(".github/workflows/release.yml", "utf8");
assert.doesNotMatch(release, /workflow_dispatch/);
assert.match(release, /expected_tag=.*package\.json/);
assert.match(release, /merge-base --is-ancestor/);
assert.match(release, /publish-npm:[\s\S]*id-token: write/);
assert.match(release, /publish-github:[\s\S]*contents: write/);
assert.match(release, /npm publish release\/kujo-pi\.tgz --provenance --access public/);

console.log("repository contract validation passed");
