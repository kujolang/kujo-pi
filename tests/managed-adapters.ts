// Network consumer suite installs the signed cohort before invoking this test.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
async function main() {
  process.env.DISPATCH_OFFLINE_FIXTURE = "true";
  const packageRoot = process.env.KUJO_PI_INSTALLED_ROOT || resolve(".");
  const { commandFor, runStreamingCommand } = await import(pathToFileURL(join(packageRoot, "src/extension.ts")).href);
  const { inspectIntegrations } = await import(pathToFileURL(join(packageRoot, "src/registry.mjs")).href);
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "kujo-pi-adapters-")));
  execFileSync("git", ["init", "-q"], { cwd });
  writeFileSync(join(cwd, "README.md"), "# Example\n");
  execFileSync("git", ["add", "."], { cwd });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Initial"], { cwd });
  writeFileSync(join(cwd, "README.md"), "# Example\nChanged\n");
  const registry = inspectIntegrations();
  assert.equal(registry.integrations.every((e: any) => e.available && e.source === "kennel" && e.checksumVerified), true);
  const cases: Array<[string, any, RegExp, boolean]> = [
    ["scout", { quick: true }, /Scan manifest:/, true],
    ["scent", { task: "Review README change" }, /included_files/, true],
    ["review", {}, /README.md/, true],
    ["changebucket", {}, /README.md/, true],
    // This intentionally incomplete project should fail the release gate with evidence.
    ["shipcheck", {}, /tests-exist/, false],
    ["runledger", { action: "start", task: "Acceptance" }, /Started run:/, true],
    ["agents", {}, /hello_agent/, true],
    ["dispatch", { task: "Acceptance fixture" }, /Acceptance fixture|completed|report/i, true],
    ["mcp", {}, /Validation failed checks: 0/, true],
    ["rag", { question: "Where is README?" }, /insufficient_context/, true],
  ];
  for (const [operation, params, expected, ok] of cases) {
    const [command, args, environment] = commandFor(operation, params, cwd, registry);
    const result = await runStreamingCommand(command, args, cwd, undefined, 120_000, () => {}, environment);
    assert.equal(result.ok, ok, `${operation}: ${result.output || result.message}`);
    assert.match(result.output, expected, operation);
    console.log(`released adapter passed: ${operation}`);
  }
  assert.equal(existsSync(join(cwd, ".mcp", "generated-server")), true);
  assert.equal(existsSync(join(cwd, ".kujo", "pi", "dispatch")), true);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
