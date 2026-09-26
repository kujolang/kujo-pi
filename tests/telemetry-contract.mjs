import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiTelemetryBridge, TELEMETRY_SCHEMA_VERSION, classifyCommand, telemetryConfig, toolSpanKind } from "../src/telemetry.mjs";

assert.equal(telemetryConfig({}).enabled, false);
assert.equal(telemetryConfig({ KUJO_WATCHDOG_TELEMETRY: "metadata" }).enabled, false);
assert.equal(telemetryConfig({ KUJO_WATCHDOG_TELEMETRY: "content", KUJO_WATCHDOG_URL: "http://127.0.0.1:7700" }).enabled, false);
assert.equal(classifyCommand("git status --short"), "source_control");
assert.equal(classifyCommand("curl https://example.com"), "network");
assert.equal(toolSpanKind("bash"), "shell");
assert.equal(toolSpanKind("read"), "tool");

const spoolRoot = await mkdtemp(join(tmpdir(), "kujo-pi-telemetry-"));
let clock = 1_000;
let nextId = 0;
let accept = false;
const delivered = [];
const environment = {
  KUJO_WATCHDOG_TELEMETRY: "metadata",
  KUJO_WATCHDOG_URL: "http://127.0.0.1:7700",
  KUJO_WATCHDOG_PROXY_PROVIDER: "kujo-watchdog",
  KUJO_PI_TELEMETRY_SPOOL_DIR: spoolRoot,
  KUJO_PI_TELEMETRY_SPOOL_MAX_FILES: "10",
  KUJO_PI_TELEMETRY_SPOOL_MAX_BYTES: "65536",
};
const bridge = new PiTelemetryBridge({
  environment,
  now: () => clock,
  uuid: () => `id-${++nextId}`,
  fetchImpl: async (_url, init) => {
    if (!accept) throw new Error("Watchdog unavailable");
    delivered.push(JSON.parse(String(init?.body || "{}")));
    return { ok: true, status: 200, body: null };
  },
});

const rawWorkspace = "/private/work/acme-secret-repository";
const concurrentBridge = new PiTelemetryBridge({
  environment,
  fetchImpl: async () => { throw new Error("Watchdog unavailable"); },
});
await Promise.all([
  bridge.startSession({ sessionId: "session-1", workspace: rawWorkspace, provider: "openai", model: "gpt-test", trusted: true }),
  concurrentBridge.startSession({ sessionId: "session-concurrent", workspace: rawWorkspace, trusted: true }),
]);
assert.equal(concurrentBridge.enabled, true, "concurrent Pi sessions must share spool initialization safely");
assert.equal(bridge.projectId, concurrentBridge.projectId, "concurrent sessions must use the same durable project salt");
assert.equal(bridge.spool.salt.length, 32, "published telemetry salts must always be complete");
await bridge.startRun();
bridge.agentStart();
clock += 10;
bridge.turnStart(0, clock);
const headers = {};
bridge.correlateProviderHeaders(headers, "direct-provider");
assert.deepEqual(headers, {}, "correlation metadata must not leak to direct providers");
bridge.correlateProviderHeaders(headers, "kujo-watchdog");
assert.equal(headers["X-Observe-Trace-Id"], "id-1");
assert.equal(headers["X-Observe-Parent-Span-Id"], bridge.run.currentTurnSpanId);
assert.notEqual(headers["X-Observe-Project-Id"], rawWorkspace);
bridge.toolStart("tool-call-1", "bash");
bridge.userBash("curl https://secret.example.invalid/path?token=raw-secret", false);
clock += 20;
bridge.toolEnd("tool-call-1", "bash", false);
bridge.turnEnd(0, {
  role: "assistant", provider: "openai", model: "gpt-test", stopReason: "stop",
  usage: { input: 12, output: 4, cacheRead: 3, cacheWrite: 1 },
});
bridge.agentEnd(false);
clock += 5;
await bridge.finishRun("success");
await bridge.spool.writeChain;

const queuedFiles = await bridge.spool.files();
assert.ok(queuedFiles.length > 0, "Watchdog downtime should retain telemetry in the durable spool");
const queuedText = (await Promise.all(queuedFiles.map(async name => {
  const { readFile } = await import("node:fs/promises");
  return readFile(join(bridge.spool.directory, name), "utf8");
}))).join("\n");
assert.doesNotMatch(queuedText, /acme-secret-repository|secret\.example|raw-secret|curl https:/, "metadata spool must not contain workspace paths or shell text");
assert.doesNotMatch(queuedText, /tool_args|tool_result|prompt|response_body/, "metadata spool must use an allowlist rather than content fields");
assert.match(queuedText, new RegExp(TELEMETRY_SCHEMA_VERSION.replaceAll(".", "\\.")));
assert.match(queuedText, /"command_class":"network"/);
assert.match(queuedText, /"kind":"execution"/);
assert.match(queuedText, /"kind":"persistence"/);
assert.match(queuedText, /"name":"persistence_saved"/);

accept = true;
await bridge.spool.flush();
assert.equal((await bridge.spool.files()).length, 0, "successful replay should drain the durable spool");
assert.ok(delivered.length > 0);
assert.ok(delivered.every(payload => payload.schema_version === TELEMETRY_SCHEMA_VERSION));
assert.ok(delivered.every(payload => payload.producer.name === "kujo-pi"));
const packageVersion = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
assert.ok(delivered.every(payload => payload.producer.version === packageVersion), "telemetry producer version must match the released package");
assert.ok(delivered.every(payload => payload.records.every(record => record.privacy.content_mode === "off")));
assert.ok(delivered.some(payload => payload.records.some(record => record.record_type === "span" && record.kind === "execution")));
await bridge.startRun();
await bridge.startSession({ sessionId: "untrusted-after-trusted", workspace: rawWorkspace, trusted: false });
assert.equal(bridge.enabled, false, "a reused bridge must revoke telemetry on an untrusted session");
assert.equal(bridge.run, null);
const revokedHeaders = {};
bridge.correlateProviderHeaders(revokedHeaders, "kujo-watchdog");
assert.deepEqual(revokedHeaders, {}, "revoked sessions must not receive correlation metadata");
await bridge.spool.writeChain;
await bridge.spool.flush();
const deliveryCount = delivered.length;
await bridge.startRun();
bridge.userBash("git status", false);
await bridge.spool.writeChain;
assert.equal(delivered.length, deliveryCount);
await bridge.shutdown("quit");
await concurrentBridge.shutdown("quit");

const untrusted = new PiTelemetryBridge({ environment, fetchImpl: async () => ({ ok: true, status: 200, body: null }) });
await untrusted.startSession({ sessionId: "session-2", workspace: rawWorkspace, trusted: false });
assert.equal(untrusted.enabled, false, "untrusted projects must not activate background telemetry");

const invalidSaltRoot = await mkdtemp(join(tmpdir(), "kujo-pi-telemetry-invalid-salt-"));
const endpointDirectory = createHash("sha256").update(environment.KUJO_WATCHDOG_URL).digest("hex").slice(0, 32);
await mkdir(join(invalidSaltRoot, endpointDirectory), { recursive: true });
await writeFile(join(invalidSaltRoot, endpointDirectory, "salt"), Buffer.alloc(0));
const invalidSaltBridge = new PiTelemetryBridge({ environment: { ...environment, KUJO_PI_TELEMETRY_SPOOL_DIR: invalidSaltRoot } });
await invalidSaltBridge.startSession({ sessionId: "session-invalid-salt", workspace: rawWorkspace, trusted: true });
assert.equal(invalidSaltBridge.enabled, false, "an incomplete persisted salt must fail closed");
assert.match(invalidSaltBridge.spool.lastError, /exactly 32 bytes/);

const boundedRoot = await mkdtemp(join(tmpdir(), "kujo-pi-telemetry-bounded-"));
const boundedBridge = new PiTelemetryBridge({
  environment: { ...environment, KUJO_PI_TELEMETRY_SPOOL_DIR: boundedRoot, KUJO_PI_TELEMETRY_SPOOL_MAX_FILES: "10" },
  fetchImpl: async () => { throw new Error("Watchdog unavailable"); },
});
await boundedBridge.startSession({ sessionId: "session-bounded", workspace: rawWorkspace, trusted: true });
await boundedBridge.startRun();
for (let index = 0; index < 30; index += 1) boundedBridge.userBash("git status", false);
await boundedBridge.spool.writeChain;
assert.ok((await boundedBridge.spool.files()).length <= 10, "spool file count must remain bounded during prolonged Watchdog downtime");

await boundedBridge.spool.flush();
const pending = join(boundedBridge.spool.directory, ".active-writer.tmp");
await writeFile(pending, "active writer");
await boundedBridge.spool.prune();
assert.equal(await readFile(pending, "utf8"), "active writer", "retention must not delete another writer's unpublished file");
await unlink(pending);
let racedDeliveries = 0;
boundedBridge.spool.fetchImpl = async (_url, init) => {
  const batchId = JSON.parse(init.body).batch_id;
  for (const name of await boundedBridge.spool.files()) {
    const path = join(boundedBridge.spool.directory, name);
    if (JSON.parse(await readFile(path, "utf8")).batch_id === batchId) await unlink(path);
  }
  racedDeliveries += 1;
  return { ok: true, status: 200, body: null };
};
const expectedDeliveries = (await boundedBridge.spool.files()).length;
await boundedBridge.spool.flush();
assert.equal(racedDeliveries, expectedDeliveries, "another sender deleting an acknowledged file must not halt replay");
assert.equal((await boundedBridge.spool.files()).length, 0);
await boundedBridge.shutdown("quit");
console.log("telemetry contract validation passed");
