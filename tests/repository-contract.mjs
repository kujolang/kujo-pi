import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
for (const [name, range] of Object.entries(packageJson.peerDependencies)) {
  assert.notEqual(range, "*", `${name} must declare a tested compatibility range`);
}

let loopEngineeringTracked = true;
try { execFileSync("git", ["ls-files", "--error-unmatch", ".loop-engineering"], { stdio: "ignore" }); }
catch { loopEngineeringTracked = false; }
assert.equal(loopEngineeringTracked, false, "generated loop-engineering state must not be committed");
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
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
assert.doesNotMatch(release, /workflow_dispatch/);
assert.match(release, /expected_tag=.*package\.json/);
assert.match(release, /merge-base --is-ancestor/);
assert.match(release, /publish-npm:[\s\S]*id-token: write/);
assert.match(release, /publish-github:[\s\S]*contents: write/);
assert.match(release, /npm publish \.\/release\/kujo-pi\.tgz --provenance --access public --tag "\$dist_tag"/);
assert.match(release, /if \[\[ "\$version" == \*-\* \]\]; then dist_tag="next"/);
assert.match(release, /prerelease: \$\{\{ contains\(github\.ref_name, '-'\) \}\}/);
assert.doesNotMatch(release, /npm publish release\/kujo-pi\.tgz/);
assert.equal((release.match(/working-directory: release\s+run: sha256sum --check kujo-pi\.tgz\.sha256/g) ?? []).length, 2,
  "both publication jobs must verify checksums from the downloaded artifact directory");
assert.doesNotMatch(release, /sha256sum --check release\/kujo-pi\.tgz\.sha256/);
assert.match(ci, /ubuntu-latest, macos-latest, windows-latest/);
assert.match(ci, /schedule:[\s\S]*cron:/);
assert.match(ci, /pi-compatibility:[\s\S]*0\.84\.3[\s\S]*latest/);
assert.match(ci, /name: Verify extension against Pi target[\s\S]*npm run typecheck[\s\S]*npm run test:extension[\s\S]*npm run test:host/);
assert.match(ci, /actions\/dependency-review-action@[a-f0-9]{40}/);
assert.match(release, /ubuntu-latest, macos-latest, windows-latest/);
assert.match(release, /environment: npm-release/);
assert.match(release, /environment: github-release/);
assert.match(release, /actions\/attest-build-provenance@[a-f0-9]{40}/);
assert.match(release, /KUJO_PI_PACKAGE_SOURCE=\.\/release\/kujo-pi\.tgz npm run test:fresh-profile/);
assert.match(release, /kujo-pi\.sbom\.cdx\.json/);
assert.match(release, /provenance\.bundle\.jsonl/);
assert.match(readFileSync(".github/dependabot.yml", "utf8"), /package-ecosystem: github-actions/);

console.log("repository contract validation passed");
