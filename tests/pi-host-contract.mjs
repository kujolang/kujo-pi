import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

function extractNpmTarball(tarball, destination) {
  const archive = gunzipSync(readFileSync(tarball));
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeText = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const normalized = name.replace(/^package\//, "");
    assert.ok(normalized && !normalized.split("/").includes("..") && !normalized.startsWith("/"), `unsafe tar path: ${name}`);
    const target = resolve(destination, normalized);
    assert.ok(target === resolve(destination) || target.startsWith(`${resolve(destination)}${sep}`));
    if (type === "5") mkdirSync(target, { recursive: true });
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, archive.subarray(offset + 512, offset + 512 + size));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
}

const root = mkdtempSync(join(tmpdir(), "kujo-pi-host-"));
const packageOutput = join(root, "pack");
const packageRoot = join(root, "package");
const workspace = join(root, "workspace");
const agentDir = join(root, "agent");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
mkdirSync(packageOutput);
mkdirSync(packageRoot);
mkdirSync(workspace);
mkdirSync(agentDir);
const pack = JSON.parse(execFileSync(npmCommand, ["pack", "--json", "--pack-destination", packageOutput], { encoding: "utf8", shell: process.platform === "win32" }))[0];
extractNpmTarball(join(packageOutput, pack.filename), packageRoot);
symlinkSync(resolve("node_modules"), join(packageRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");

const piBinary = resolve("node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
const child = spawn(process.execPath, [piBinary, "--mode", "rpc", "--no-session", "--no-extensions", "-e", packageRoot, "--approve"], {
  cwd: workspace,
  env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, KUJO_WATCHDOG_TELEMETRY: "off" },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
let buffer = "";
let stderr = "";
const messages = [];
const waiters = [];
function dispatch(message) {
  messages.push(message);
  for (const waiter of [...waiters]) {
    if (!waiter.predicate(message)) continue;
    clearTimeout(waiter.timer);
    waiters.splice(waiters.indexOf(waiter), 1);
    waiter.resolve(message);
  }
}
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) dispatch(JSON.parse(line));
  }
});
child.stderr.on("data", (chunk) => { stderr += chunk; });
function waitFor(predicate, timeoutMs = 15_000) {
  const existing = messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolveWait, rejectWait) => {
    const waiter = { predicate, resolve: resolveWait, timer: setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      rejectWait(new Error(`Pi RPC timeout\n${stderr}`));
    }, timeoutMs) };
    waiters.push(waiter);
  });
}
let sequence = 0;
async function request(type, data = {}) {
  const id = `request-${++sequence}`;
  child.stdin.write(`${JSON.stringify({ id, type, ...data })}\n`);
  return waitFor((message) => message.type === "response" && message.id === id);
}
async function command(message, expectedNotification) {
  const before = messages.length;
  const response = await request("prompt", { message });
  assert.equal(response.success, true);
  return waitFor((entry) => messages.indexOf(entry) >= before && entry.type === "extension_ui_request" && entry.method === "notify" && String(entry.message).includes(expectedNotification));
}

try {
  const status = await waitFor((message) => message.type === "extension_ui_request" && message.method === "setStatus" && message.statusKey === "kujo");
  assert.match(status.statusText, /opt-in tools available/);
  const commands = await request("get_commands");
  const kujo = commands.data.commands.find(({ name }) => name === "kujo");
  assert.equal(kujo.source, "extension");
  assert.ok(kujo.sourceInfo.path.startsWith(packageRoot), "Pi must load the extension from the packed package");

  await command("/kujo enable kujo_scout", "enabled kujo_scout");
  await command("/kujo active", "kujo_scout");
  await request("new_session");
  await waitFor((message) => message.type === "extension_ui_request" && message.method === "setStatus" && messages.indexOf(message) > 0);
  const activeAfterReset = await command("/kujo active", "Active Kujo tools:");
  assert.doesNotMatch(activeAfterReset.message, /kujo_scout/);
  await command("/kujo init", "Initialized .kujo/pi");
  assert.equal(existsSync(join(workspace, ".kujo", "pi", "README.md")), true);
} finally {
  child.kill("SIGTERM");
  await new Promise((resolveWait) => child.once("close", resolveWait));
}

console.log("packaged Pi host lifecycle contract validation passed");
