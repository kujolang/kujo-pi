import { open, rename } from "node:fs/promises";
import { join } from "node:path";
import { PiTelemetryBridge } from "../../src/telemetry.mjs";
import { temporarySpoolPath } from "../../src/telemetry-files.mjs";

const bridge = new PiTelemetryBridge({
  environment: { KUJO_WATCHDOG_TELEMETRY: "metadata", KUJO_WATCHDOG_URL: "http://127.0.0.1:7700", KUJO_PI_TELEMETRY_SPOOL_DIR: process.argv[2] },
  fetchImpl: async () => { throw new Error("offline fixture"); },
});
await bridge.spool.initialize();
const temporary = await temporarySpoolPath(bridge.spool.directory);
const handle = await open(temporary, "wx", 0o600);
await handle.writeFile('{"batch_id":"surviving-writer"}');
await handle.sync();
process.on("message", async () => {
  await handle.close();
  await rename(temporary, join(bridge.spool.directory, "surviving-writer.json"));
  process.disconnect();
});
process.send({ temporary, directory: bridge.spool.directory, salt: bridge.spool.salt.toString("hex") });
