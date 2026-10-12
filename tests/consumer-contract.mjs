// Explicit network acceptance: use the distributed package's setup command, then
// execute a real repository operation in a fresh Pi profile, without a checkout.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = realpathSync(mkdtempSync(join(tmpdir(), "kujo-pi-consumer-")));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let source = process.env.KUJO_PI_PACKAGE_SOURCE;
if (!source) {
  const packed = JSON.parse(execFileSync(npm, ["pack", "--json", "--pack-destination", root], { encoding: "utf8" }))[0];
  source = join(root, packed.filename);
} else if (source.endsWith(".tgz")) source = resolve(source);
const environment = { ...process.env, KUJO_PI_HOME: join(root, "private toolchain"), KUJO_PI_PACKAGE_SOURCE: source, KUJO_PI_CONSUMER: "1" };
// No overrides or contributor paths may mask broken consumer discovery.
for (const key of Object.keys(environment)) if (/^KUJO_.*(?:_BIN|_ENTRY|ECOSYSTEM_ROOT|REGISTRY)/.test(key)) delete environment[key];
execFileSync(npm, ["install", "--prefix", root, "--ignore-scripts", "--no-audit", "--no-fund", source], { env: environment, stdio: "inherit" });
const cli = join(root, "node_modules", "@kujolang", "kujo-pi", "bin", "kujo-pi-setup.mjs");
for (const pack of ["review", "understand", "ship", "orchestrate", "extend"]) {
  const plan = JSON.parse(execFileSync(process.execPath, [cli, "plan", pack], { cwd: root, env: environment, encoding: "utf8" }));
  assert.equal(plan.supported, true);
  execFileSync(process.execPath, [cli, "apply", pack, "--approve-plan", plan.digest], { cwd: root, env: environment, stdio: "inherit", timeout: 600_000 });
}
environment.KUJO_PI_INSTALLED_ROOT = join(root, "node_modules", "@kujolang", "kujo-pi");
execFileSync(process.execPath, ["--import", "tsx", "tests/managed-adapters.ts"], { env: environment, stdio: "inherit", timeout: 300_000 });
execFileSync(process.execPath, ["tests/fresh-profile-contract.mjs"], { env: environment, stdio: "inherit", timeout: 180_000 });
console.log("consumer install, peer resolution, signed setup and real Pi workflow passed");
