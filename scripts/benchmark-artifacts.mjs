// Run from the repository root; optionally pass a contracts module for comparison.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "kujo-artifacts-benchmark-"));
try {
  writeFileSync(join(root, "payload.bin"), Buffer.alloc(10_000_000, 120));
  const moduleUrl = pathToFileURL(resolve(process.argv[2] || "src/contracts.mjs")).href;
  const script = `
    import { digestArtifacts } from ${JSON.stringify(moduleUrl)};
    const start = performance.now();
    const hash = digestArtifacts(${JSON.stringify(root)});
    console.log(JSON.stringify({ ms: performance.now() - start, maxRSSKiB: process.resourceUsage().maxRSS, hash }));
  `;
  for (let index = 0; index < 5; index++) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    process.stdout.write(result.stdout);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
