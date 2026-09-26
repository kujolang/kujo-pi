// Run with an optional baseline telemetry module path. No disk/network delivery.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { PiTelemetryBridge } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "../src/telemetry.mjs");
const root = await mkdtemp(join(tmpdir(), "kujo-pi-queue-benchmark-"));
try {
  const bridge = new PiTelemetryBridge({ environment: { KUJO_PI_TELEMETRY_SPOOL_DIR: root, KUJO_PI_TELEMETRY_SPOOL_MAX_FILES: "10", KUJO_PI_TELEMETRY_SPOOL_MAX_BYTES: "65536" } });
  // Hold the writer exactly at its scheduling boundary; no arbitrary delays.
  bridge.spool.writeChain = new Promise(() => {});
  let queued = 0;
  const submitted = 10_000;
  for (let i = 0; i < submitted; i++) {
    const previous = bridge.spool.writeChain;
    void bridge.spool.append({ batch_id: String(i), data: "x".repeat(1024) });
    if (previous !== bridge.spool.writeChain) queued += 1;
  }
  console.log(JSON.stringify({ submitted, queued, pendingUtf8Bytes: bridge.spool.pendingBytes ?? null, reportedDropped: bridge.spool.droppedBatches ?? null }));
} finally { await rm(root, { recursive: true, force: true }); }
