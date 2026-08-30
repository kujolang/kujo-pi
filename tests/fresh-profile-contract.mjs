import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "kujo-pi-fresh-profile-"));
const profile = join(root, "profile");
const workspace = join(root, "workspace");
const packageOutput = join(root, "package");
const isolatedInstall = join(root, "installed");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const piBinary = resolve("node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
mkdirSync(profile);
mkdirSync(workspace);
mkdirSync(packageOutput);

let source = process.env.KUJO_PI_PACKAGE_SOURCE;
if (!source) {
  const packed = JSON.parse(execFileSync(npmCommand, ["pack", "--json", "--pack-destination", packageOutput], {
    encoding: "utf8",
    shell: process.platform === "win32",
  }))[0];
  source = join(packageOutput, packed.filename);
}
if ((source.startsWith(".") || isAbsolute(source)) && !existsSync(resolve(source))) {
  throw new Error(`KUJO_PI_PACKAGE_SOURCE does not exist: ${source}`);
}
let installSource = source;
if (source.endsWith(".tgz")) {
  execFileSync(npmCommand, ["install", "--prefix", isolatedInstall, "--ignore-scripts", "--no-package-lock", "--legacy-peer-deps", source], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  installSource = join(isolatedInstall, "node_modules", "@kujolang", "kujo-pi");
}

const environment = {
  ...process.env,
  PI_CODING_AGENT_DIR: profile,
  KUJO_WATCHDOG_TELEMETRY: "off",
};
execFileSync(process.execPath, [piBinary, "install", installSource, "--approve"], {
  cwd: workspace,
  env: environment,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const settings = JSON.parse(readFileSync(join(profile, "settings.json"), "utf8"));
assert.equal(settings.packages.length, 1, "fresh profile must contain only the requested Kujo Pi package");
if (isAbsolute(installSource)) assert.equal(resolve(profile, settings.packages[0]), resolve(installSource));
else assert.equal(settings.packages[0], installSource);

const child = spawn(process.execPath, [piBinary, "--mode", "rpc", "--no-session", "--approve"], {
  cwd: workspace,
  env: environment,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const childClosed = new Promise((resolveWait) => child.once("close", resolveWait));
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
function waitFor(predicate, timeoutMs = 30_000) {
  const existing = messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolveWait, rejectWait) => {
    const waiter = { predicate, resolve: resolveWait, timer: setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      rejectWait(new Error(`Pi fresh-profile RPC timeout\n${stderr}\n${JSON.stringify(messages.slice(-10), null, 2)}`));
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
  return waitFor((entry) => messages.indexOf(entry) >= before
    && entry.type === "extension_ui_request"
    && entry.method === "notify"
    && String(entry.message).includes(expectedNotification));
}

try {
  const status = await waitFor((message) => message.type === "extension_ui_request"
    && message.method === "setStatus"
    && message.statusKey === "kujo");
  assert.match(status.statusText, /opt-in tools available/);

  const commands = await request("get_commands");
  const kujo = commands.data.commands.find(({ name }) => name === "kujo");
  assert.equal(kujo?.source, "extension");
  assert.ok(!kujo.sourceInfo.path.startsWith(resolve(".")), "fresh profile must not load the repository checkout");

  await command("/kujo setup", "Kujo setup");
  await command("/kujo packs", "understand:");
  await command("/kujo enable understand", "enabled pack understand");
  const active = await command("/kujo active", "Active Kujo tools:");
  assert.match(active.message, /kujo_scout/);
  assert.match(active.message, /kujo_scent/);
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await childClosed;
}

console.log(`fresh Pi profile acceptance passed for ${source}`);
