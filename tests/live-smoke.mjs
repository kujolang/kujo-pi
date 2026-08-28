import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { sameOriginUrl } from "../src/core.mjs";

if (process.env.KUJO_PI_LIVE !== "1") {
  console.log("live adapter smoke skipped; set KUJO_PI_LIVE=1 to opt in");
  process.exit(0);
}

const run = promisify(execFile);
function runBounded(command, args, options, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.destroy();
      child.stderr.destroy();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
      finish(new Error(`timed out after ${timeoutMs}ms\n${stderr}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (timedOut) return;
      if (code !== 0) finish(new Error(`exit ${code}\n${stderr || stdout}`));
      else finish(null, { code, stdout, stderr });
    });
  });
}
const binary = process.env.KUJO_BIN || "kujo";
const version = await run(binary, ["--version"], { timeout: 15_000 });
assert.match(`${version.stdout}\n${version.stderr}`, /\d+\.\d+\.\d+/);

const ecosystemRoot = process.env.KUJO_PI_ECOSYSTEM_ROOT;
if (ecosystemRoot) {
  const outputRoot = mkdtempSync(join(tmpdir(), "kujo-pi-live-"));
  const targetRepo = mkdtempSync(join(tmpdir(), "kujo-pi-fixture-"));
  writeFileSync(join(targetRepo, "package.json"), '{"name":"kujo-pi-live-fixture","version":"0.0.0"}\n');
  writeFileSync(join(targetRepo, "README.md"), "# Kujo Pi live fixture\n");
  await run("git", ["init", "--quiet"], { cwd: targetRepo, timeout: 15_000 });
  const commands = [
    ["scout", targetRepo, join(ecosystemRoot, "scout/scout.kujo"), ["--", targetRepo, "--quick"]],
    ["scent", targetRepo, join(ecosystemRoot, "scent/scent.kujo"), ["--", "pack", "--task", "Kujo Pi live contract", "--dry-run", "--json"]],
    ["patchbrief", targetRepo, join(ecosystemRoot, "patchbrief/patchbrief.kujo"), ["--", "summarize", "--format", "json"]],
    ["changebucket", targetRepo, join(ecosystemRoot, "changebucket/changebucket.kujo"), ["--", "--help"]],
    ["shipcheck", targetRepo, join(ecosystemRoot, "shipcheck/shipcheck.kujo"), ["scan", "--format", "json"]],
    ["mcp", targetRepo, join(ecosystemRoot, "mcp/mcp.kujo"), ["--interpreter", "make", targetRepo, "--profile-only"]],
    ["dispatch", join(ecosystemRoot, "dispatch"), join(ecosystemRoot, "dispatch/dispatch.kujo"), ["demo", "Kujo Pi live contract", "--yes", "--non-interactive", "--output-root", outputRoot]],
    ["agents", join(ecosystemRoot, "agents-sdk"), join(ecosystemRoot, "agents-sdk/examples/examples_smoke_runner.kujo"), ["--interpreter"]],
    ["rag", join(ecosystemRoot, "rag"), join(ecosystemRoot, "rag/main.kujo"), ["--interpreter", "query", "--question", "What is Kujo Pi?"]],
    ["runledger", targetRepo, join(ecosystemRoot, "runledger/runledger.kujo"), ["--", "--help"]],
  ];
  const results = [];
  for (const [name, cwd, entry, args] of commands) {
    try {
      const result = await runBounded(binary, ["run", entry, ...args], { cwd, env: { ...process.env, DISPATCH_OFFLINE_FIXTURE: "true", DISPATCH_ALLOW_ANY_OUTPUT_ROOT: "true" } });
      results.push({ name, ok: true, code: result.code });
    } catch (error) {
      results.push({ name, ok: false, message: error.message });
    }
  }
  const failures = results.filter((result) => !result.ok);
  if (failures.length) throw new Error(`ecosystem live contract failures: ${JSON.stringify(failures)}`);
  console.log(`ecosystem live contract passed (${results.length} adapters)`);
}

for (const [name, base] of [["watchdog", process.env.KUJO_WATCHDOG_URL], ["leash", process.env.KUJO_LEASH_URL]]) {
  if (!base) continue;
  const response = await fetch(sameOriginUrl(base, "/health"), { signal: AbortSignal.timeout(15_000) });
  assert.ok(response.status < 500, `${name} health returned ${response.status}`);
}
console.log("live adapter smoke passed");
