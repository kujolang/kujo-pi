import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sameOriginUrl } from "../src/core.mjs";

if (process.env.KUJO_PI_LIVE !== "1") {
  console.log("live adapter smoke skipped; set KUJO_PI_LIVE=1 to opt in");
  process.exit(0);
}

const run = promisify(execFile);
const binary = process.env.KUJO_BIN || "kujo";
const version = await run(binary, ["--version"], { timeout: 15_000 });
assert.match(`${version.stdout}\n${version.stderr}`, /\d+\.\d+\.\d+/);

for (const [name, base] of [["watchdog", process.env.KUJO_WATCHDOG_URL], ["leash", process.env.KUJO_LEASH_URL]]) {
  if (!base) continue;
  const response = await fetch(sameOriginUrl(base, "/health"), { signal: AbortSignal.timeout(15_000) });
  assert.ok(response.status < 500, `${name} health returned ${response.status}`);
}
console.log("live adapter smoke passed");
