import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiTelemetryBridge } from "../src/telemetry.mjs";
import { recoverSpoolTemporaries } from "../src/telemetry-files.mjs";

const root = await mkdtemp(join(tmpdir(), "kujo-pi-pressure-"));
const children = [];
try {
  const writers = await Promise.all([0, 1].map(async () => {
    const child = fork(new URL("./fixtures/telemetry-owner.mjs", import.meta.url), [root], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
    children.push(child);
    const exit = once(child, "exit");
    const [state] = await Promise.race([
      once(child, "message"),
      exit.then(([code]) => { throw new Error(`Writer exited before ready: ${code}`); }),
    ]);
    return { child, state, exit };
  }));
  const [crashed, survivor] = writers;
  assert.equal(crashed.state.salt, survivor.state.salt);
  assert.deepEqual(await recoverSpoolTemporaries(crashed.state.directory), { recovered: 0, deferred: 0 });
  assert.match(await readFile(survivor.state.temporary, "utf8"), /surviving-writer/);
  crashed.child.kill("SIGKILL");
  await crashed.exit;
  const recovered = await Promise.all([recoverSpoolTemporaries(crashed.state.directory), recoverSpoolTemporaries(crashed.state.directory)]);
  // Some filesystems acknowledge both concurrent unlink calls. The invariant
  // is removal of the orphan while the live writer can still publish.
  assert.ok(recovered.every(result => result.recovered === 0 || result.recovered === 1));
  assert.ok(recovered.some(result => result.recovered === 1));
  await assert.rejects(readFile(crashed.state.temporary), { code: "ENOENT" });
  survivor.child.send("publish");
  assert.equal((await survivor.exit)[0], 0);
  assert.match(await readFile(join(survivor.state.directory, "surviving-writer.json"), "utf8"), /surviving-writer/);
  await writeFile(crashed.state.temporary, "orphan");
  const recoveryBridge = new PiTelemetryBridge({ environment: { KUJO_WATCHDOG_URL: "http://127.0.0.1:7700", KUJO_PI_TELEMETRY_SPOOL_DIR: root } });
  await recoveryBridge.spool.initialize();
  assert.equal(recoveryBridge.spool.recoveredTemporaries, 1, "initialization must invoke recovery");
  await assert.rejects(readFile(crashed.state.temporary), { code: "ENOENT" });
  const unknown = join(survivor.state.directory, "legacy.json.tmp");
  const foreign = crashed.state.temporary.replace(/\.kujo-pi-[a-f0-9]{32}-/, `.kujo-pi-${"f".repeat(32)}-`);
  await writeFile(unknown, "legacy");
  await writeFile(foreign, "foreign");
  assert.deepEqual(await recoverSpoolTemporaries(survivor.state.directory), { recovered: 0, deferred: 0 });
  assert.equal(await readFile(unknown, "utf8"), "legacy");
  assert.equal(await readFile(foreign, "utf8"), "foreign");
  await writeFile(crashed.state.temporary, "uncertain owner");
  const originalKill = process.kill;
  try {
    process.kill = () => { throw Object.assign(new Error("permission denied"), { code: "EPERM" }); };
    assert.deepEqual(await recoverSpoolTemporaries(survivor.state.directory), { recovered: 0, deferred: 0 });
    assert.equal(await readFile(crashed.state.temporary, "utf8"), "uncertain owner");
  } finally { process.kill = originalKill; }
  const originalUnlink = fs.unlink;
  try {
    fs.unlink = async () => { throw Object.assign(new Error("busy orphan"), { code: "EPERM" }); };
    syncBuiltinESMExports();
    assert.deepEqual(await recoverSpoolTemporaries(survivor.state.directory), { recovered: 0, deferred: 1 });
    assert.equal(await readFile(crashed.state.temporary, "utf8"), "uncertain owner");
    const deferredBridge = new PiTelemetryBridge({ environment: { KUJO_WATCHDOG_URL: "http://127.0.0.1:7700", KUJO_PI_TELEMETRY_SPOOL_DIR: root } });
    await deferredBridge.spool.initialize();
    assert.equal(deferredBridge.spool.initialized, true, "deferred cleanup must not disable a writable spool");
    assert.equal(deferredBridge.spool.diagnostics().deferredTemporaries, 1);
    fs.unlink = async () => { throw Object.assign(new Error("I/O failure"), { code: "EIO" }); };
    syncBuiltinESMExports();
    await assert.rejects(recoverSpoolTemporaries(survivor.state.directory), { code: "EIO" });
  } finally { fs.unlink = originalUnlink; syncBuiltinESMExports(); }
  await fs.unlink(crashed.state.temporary);
  if (process.platform !== "win32") {
    await fs.symlink(unknown, crashed.state.temporary);
    assert.deepEqual(await recoverSpoolTemporaries(survivor.state.directory), { recovered: 0, deferred: 0 });
    assert.equal((await fs.lstat(crashed.state.temporary)).isSymbolicLink(), true);
    await fs.unlink(crashed.state.temporary);
  }


  const bridge = new PiTelemetryBridge({
    environment: { KUJO_WATCHDOG_TELEMETRY: "metadata", KUJO_WATCHDOG_URL: "http://127.0.0.1:7701", KUJO_PI_TELEMETRY_SPOOL_DIR: root, KUJO_PI_TELEMETRY_SPOOL_MAX_FILES: "10", KUJO_PI_TELEMETRY_SPOOL_MAX_BYTES: "65536" },
    fetchImpl: async () => { throw new Error("offline fixture"); },
  });
  await bridge.spool.initialize();
  let release;
  bridge.spool.writeChain = new Promise(resolve => { release = resolve; });
  for (let i = 0; i < 10_000; i++) void bridge.spool.append({ batch_id: String(i), data: "x".repeat(1024) });
  assert.equal(bridge.spool.pendingBatches, 10);
  assert.ok(bridge.spool.pendingBytes <= 65536);
  assert.equal(bridge.spool.droppedBatches, 9990);
  release();
  await bridge.spool.writeChain;
  await bridge.spool.flush();
  assert.equal(bridge.spool.pendingBatches, 0);
  assert.equal(bridge.spool.pendingBytes, 0);
  assert.equal((await bridge.spool.files()).length, 10);
  // Byte capacity applies independently of batch count, using UTF-8 bytes.
  bridge.spool.writeChain = new Promise(resolve => { release = resolve; });
  for (let i = 0; i < 3; i++) void bridge.spool.append({ data: "é".repeat(15_000) });
  assert.equal(bridge.spool.pendingBatches, 2);
  assert.equal(bridge.spool.droppedBatches, 9991);
  release();
  await bridge.spool.writeChain;
  await bridge.spool.flush();
  bridge.spool.initialize = async () => { throw new Error("injected storage failure"); };
  await bridge.spool.append({ batch_id: "failure" });
  assert.equal(bridge.spool.writeFailures, 1);
  assert.equal(bridge.spool.pendingBatches, 0);
  assert.equal(bridge.spool.pendingBytes, 0);
  assert.match(bridge.spool.lastError, /injected storage failure/);
  await bridge.spool.flush();

  const brokenSalt = new PiTelemetryBridge({ environment: { KUJO_PI_TELEMETRY_SPOOL_DIR: join(root, "salt-failure") } });
  const originalOpen = fs.open;
  try {
    fs.open = async (...args) => {
      const handle = await originalOpen(...args);
      return {
        writeFile: async () => { throw new Error("injected salt write failure"); },
        sync: () => handle.sync(), close: () => handle.close(),
      };
    };
    syncBuiltinESMExports();
    await assert.rejects(brokenSalt.spool.initialize(), /injected salt write failure/);
    assert.deepEqual(await fs.readdir(brokenSalt.spool.directory), [], "failed salt publication must clean its temporary file");
  } finally { fs.open = originalOpen; syncBuiltinESMExports(); }
} finally {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
  }
  await rm(root, { recursive: true, force: true });
}
console.log("telemetry crash recovery and pressure contracts passed");
