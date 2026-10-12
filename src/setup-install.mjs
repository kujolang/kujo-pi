// @ts-check
import { spawn } from "node:child_process";
import { mkdirSync, openSync, closeSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { join, delimiter } from "node:path";
import { canonicalJson, sha256 } from "./contracts.mjs";
import { managedRuntime, validateSetupHome } from "./setup.mjs";

/** @param {string} url @param {string} expected @param {AbortSignal} [signal] */
export async function downloadInstaller(url, expected, signal) {
  if (url !== "https://kennel.kujolang.ai/install.kujo" || !/^[a-f0-9]{64}$/.test(expected)) throw new Error("Invalid signed installer identity");
  const response = await fetch(url, { redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`Installer download failed: ${response.status}`);
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024 * 1024) throw new Error("Installer exceeds 1 MiB");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  if (sha256(bytes) !== expected) throw new Error("Installer checksum changed; update Kujo Pi after reviewing its signed cohort");
  return bytes;
}

/** @param {string} command @param {string[]} args @param {NodeJS.ProcessEnv} env @param {string} cwd @param {(message:string)=>void} report @param {AbortSignal} [signal] */
function run(command, args, env, cwd, report, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Setup cancelled")); return; }
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let tail = "";
    const output = (/** @type {Buffer} */ chunk) => { tail = (tail + chunk.toString()).slice(-4000); };
    child.stdout.on("data", output); child.stderr.on("data", output);
    const stop = () => { try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch {} };
    const timer = setTimeout(stop, 300_000);
    signal?.addEventListener("abort", stop, { once: true });
    const finish = () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); };
    child.on("error", error => { finish(); reject(error); });
    child.on("close", code => {
      finish();
      // Installer output can contain paths; only surface its bounded tail on a local failure.
      if (code !== 0) reject(new Error(`Setup command failed (${code}): ${tail}`));
      else { report(`${args[0]} completed`); resolve(undefined); }
    });
  });
}

/** Installs only the freshly recomputed, digest-approved plan. No shell or background jobs.
 * @param {any} plan @param {string} approvedDigest @param {(message:string)=>void} [report] @param {AbortSignal} [signal] */
export async function applySetupPlan(plan, approvedDigest, report = () => {}, signal) {
  const { digest, ...body } = plan;
  if (approvedDigest !== digest || sha256(canonicalJson(body)) !== digest) throw new Error("Setup plan changed; preview and approve the new digest");
  if (!plan.supported || !plan.steps.length) throw new Error(plan.note);
  validateSetupHome(plan.home);
  mkdirSync(plan.home, { recursive: true, mode: 0o700 });
  for (const directory of [join(plan.home, "runtime"), join(plan.home, "kennel")]) validateSetupHome(directory);
  const lock = join(plan.home, ".setup.lock");
  const fd = openSync(lock, "wx", 0o600);
  writeFileSync(fd, JSON.stringify({ pid: process.pid, plan: plan.digest }));
  const environment = {
    ...process.env, KUJO_BIN: managedRuntime(plan.home), KENNEL_HOME: join(plan.home, "kennel"),
    PATH: [join(plan.home, "runtime", "node_modules", ".bin"), join(plan.home, "kennel", "bin"), process.env.PATH || ""].join(delimiter),
  };
  try {
    for (const step of plan.steps) {
      if (signal?.aborted) throw new Error("Setup cancelled");
      report(`Installing: ${step.kind}`);
      if (step.kind === "download") {
        const bytes = await downloadInstaller(step.url, step.sha256, signal);
        const staging = join(plan.home, ".installer.download");
        const handle = openSync(staging, "wx", 0o600);
        try {
          writeFileSync(handle, bytes);
          renameSync(staging, step.destination);
        } finally { closeSync(handle); rmSync(staging, { force: true }); }
      } else {
        await run(step.command, step.args, environment, plan.home, report, signal);
      }
    }
    const receipt = join(plan.home, ".setup-receipt.tmp");
    writeFileSync(receipt, JSON.stringify({ schemaVersion: "kujo.pi.setup-receipt.v1", planDigest: plan.digest, pack: plan.pack, packages: plan.packages, completedAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    renameSync(receipt, join(plan.home, "setup-receipt.json"));
  } finally {
    closeSync(fd); rmSync(lock);
  }
}
