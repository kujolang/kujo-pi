// Opt-in fixture benchmark; run from the repository root. No timing gate.
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "kujo-pi-hash-"));
try {
  const file = join(root, "scout");
  writeFileSync(file, Buffer.alloc(64 * 1024 * 1024, 120));
  chmodSync(file, 0o755);
  const script = `
    import { inspectIntegrations } from ${JSON.stringify(pathToFileURL(resolve("src/registry.mjs")).href)};
    const start = performance.now();
    const registry = inspectIntegrations({ PATH: "", KUJO_SCOUT_BIN: ${JSON.stringify(file)} });
    console.log(JSON.stringify({
      ms: performance.now() - start,
      maxRSSKiB: process.resourceUsage().maxRSS,
      sha256: registry.integrations.find(({ id }) => id === "scout").actualSha256,
    }));
  `;
  for (let index = 0; index < 5; index += 1) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    process.stdout.write(result.stdout);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
