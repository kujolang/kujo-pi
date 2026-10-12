// @ts-check
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { CAPABILITY_PACKS } from "./capabilities.mjs";
import { canonicalJson, sha256 } from "./contracts.mjs";

export const PACK_INTEGRATIONS = /** @type {Record<string, string[]>} */ ({
  understand: ["scout", "scent"], review: ["patchbrief", "changebucket"],
  ship: ["shipcheck", "runledger"], orchestrate: ["dispatch", "agents"],
  extend: ["mcp", "rag"], observe: [],
});

/** @param {NodeJS.ProcessEnv} [environment] */
export function setupHome(environment = process.env) {
  const path = environment.KUJO_PI_HOME || join(homedir(), ".local", "share", "kujo-pi");
  if (!isAbsolute(path)) throw new Error("KUJO_PI_HOME must be an absolute path");
  return resolve(path);
}

/** @param {string} home */
export function managedRuntime(home) {
  return join(home, "runtime", "node_modules", ".bin", process.platform === "win32" ? "kujo.cmd" : "kujo");
}

/** Reject user-selected roots that traverse symlinks or writable foreign directories.
 * @param {string} home */
export function validateSetupHome(home) {
  let path = resolve(home);
  if (path === dirname(path) || path === homedir()) throw new Error("Use a dedicated Kujo Pi toolchain directory");
  while (path !== dirname(path)) {
    const info = lstatSync(path, { throwIfNoEntry: false });
    if (info) {
      if (info.isSymbolicLink()) throw new Error(`Setup path traverses a symlink: ${path}`);
      if (!info.isDirectory()) throw new Error(`Setup path is not a directory: ${path}`);
    }
    path = dirname(path);
  }
  if (existsSync(home)) {
    const info = lstatSync(home);
    if (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o022))) throw new Error("Setup directory must be owned by you and not group/world writable");
  }
}

/** Resolve a Kennel installation only when its released identity and entrypoint match.
 * Kennel owns archive/provenance verification; this checks its recorded identity
 * and the exact signed entrypoint, rather than treating a shim's hash as package proof.
 * @param {any} entry @param {NodeJS.ProcessEnv} environment */
export function managedIntegration(entry, environment) {
  const home = setupHome(environment);
  const statePath = join(home, "kennel", "tools.json");
  if (!existsSync(statePath)) return null;
  if (lstatSync(statePath).size > 8 * 1024 * 1024) throw new Error("Kennel tool state is too large");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.schema_version !== 1) throw new Error("Unsupported Kennel tool state");
  const record = state.packages?.[entry.package];
  if (!record) return null;
  if (!environment.KUJO_BIN) {
    const metadataPath = join(home, "runtime", "node_modules", "@kujolang", "kujo-runtime", "package.json");
    if (!existsSync(managedRuntime(home)) || !existsSync(metadataPath)) throw new Error("Managed Kujo runtime is missing; run setup again");
    const version = JSON.parse(readFileSync(metadataPath, "utf8")).version;
    const parts = String(version).split(".").map(Number);
    const minimum = String(entry.minimumKujoVersion).split(".").map(Number);
    let compatible = /^\d+\.\d+\.\d+$/.test(version);
    for (let i = 0; compatible && i < 3; i++) {
      if (parts[i] > minimum[i]) break;
      if (parts[i] < minimum[i]) { compatible = false; break; }
    }
    if (!compatible) throw new Error(`Kujo ${entry.minimumKujoVersion}+ required; managed runtime is ${version}`);
  }
  if (record.version !== entry.packageVersion) throw new Error(`Install ${entry.package}@${entry.packageVersion}; found ${record.version}`);
  const metadata = JSON.parse(record.lock?.registry_manifest || "null");
  if (record.lock?.kind !== "registry" || record.lock?.checksum !== `sha256:${entry.archiveSha256}`
    || record.lock?.provenance_status !== "registry-statement-verified"
    || metadata?.provenance_sha256 !== entry.provenanceSha256 || metadata?.source_commit !== entry.version
    || metadata?.package !== entry.package || metadata?.version !== entry.packageVersion) throw new Error("Kennel release identity does not match the signed cohort");
  if (!/^generation-[a-zA-Z0-9_-]+$/.test(record.generation)) throw new Error("Invalid Kennel generation");
  const generation = realpathSync(join(home, "kennel", "tools", record.generation));
  if (!generation.startsWith(realpathSync(join(home, "kennel", "tools")) + sep)) throw new Error("Kennel generation escapes its tool directory");
  const roots = record.module_roots;
  if (!Array.isArray(roots) || !roots.length || roots.length > 128) throw new Error("Invalid Kennel module roots");
  const prefix = join(generation, "kennel_packages") + sep;
  const paths = roots.map((/** @type {unknown} */ root) => {
    if (typeof root !== "string" || !isAbsolute(root) || root.includes(delimiter)) throw new Error("Invalid Kennel module root");
    const path = realpathSync(root);
    if (!path.startsWith(prefix)) throw new Error("Kennel module root escapes its generation");
    if (!lstatSync(path).isDirectory()) throw new Error("Kennel module root is not a directory");
    return path;
  });
  const packageRoot = join(generation, "kennel_packages", entry.package);
  if (!paths.includes(packageRoot)) throw new Error("Missing Kennel package root");
  const entrypoint = realpathSync(join(packageRoot, ...entry.relativeEntrypoint.split("/").slice(1)));
  if (!entrypoint.startsWith(packageRoot + sep)) throw new Error("Kennel entrypoint escapes its package");
  return { entrypoint, modulePaths: paths, packageVersion: record.version, lock: record.lock };
}

/** @param {any} registry @param {string} pack @param {NodeJS.ProcessEnv} [environment] @param {string} [platform] */
export function createSetupPlan(registry, pack = "understand", environment = process.env, platform = process.platform) {
  const ids = PACK_INTEGRATIONS[pack];
  if (!ids) throw new Error(`Unknown pack: ${pack}. Choose ${Object.keys(PACK_INTEGRATIONS).join(", ")}`);
  const installation = registry.installation;
  if (!registry.signatureVerified || !installation) throw new Error("Setup requires a valid signed installation manifest");
  const home = setupHome(environment);
  const runtime = managedRuntime(home);
  const kennelHome = join(home, "kennel");
  const kennel = join(kennelHome, "bin", "kennel");
  const supported = ["darwin", "linux"].includes(platform);
  const packages = ids.map(id => {
    const entry = registry.integrations.find((/** @type {any} */ value) => value.id === id);
    if (!entry?.packageVersion || !entry?.archiveSha256) throw new Error(`No released setup contract for ${id}`);
    return { id, name: entry.package, version: entry.packageVersion, archiveSha256: entry.archiveSha256, provenanceSha256: entry.provenanceSha256 };
  });
  const plan = {
    schemaVersion: "kujo.pi.setup-plan.v1", pack, platform, supported, home,
    registryDigest: registry.manifestDigest,
    runtimeVersion: installation.runtimeVersion, kennelVersion: installation.kennelVersion,
    packages,
    writes: [home, join(home, "runtime"), kennelHome, join(home, "installer.kujo"), join(home, "setup-receipt.json")],
    packageCaches: "npm and Kennel may populate their normal user caches",
    network: ["registry.npmjs.org", "kennel.kujolang.ai", "github.com (locked package dependencies)"],
    steps: packages.length && supported ? [
      { kind: "runtime", command: "npm", args: ["install", "--prefix", join(home, "runtime"), "--ignore-scripts", "--no-audit", "--no-fund", `@kujolang/kujo-runtime@${installation.runtimeVersion}`] },
      { kind: "download", url: installation.kennelInstallerUrl, sha256: installation.kennelInstallerSha256, destination: join(home, "installer.kujo") },
      { kind: "kennel", command: runtime, args: ["run", join(home, "installer.kujo"), "--interpreter", "--isolated-imports", "--", "--version", installation.kennelVersion, "--home", kennelHome, "--no-modify-path"] },
      ...packages.map(p => ({ kind: "tool", command: kennel, args: ["tool", "install", `${p.name}@${p.version}`, "--allow-shadow"] })),
    ] : [],
    note: !supported ? "Automatic Kennel setup supports macOS/Linux. On Windows use WSL for these integrations; the Pi extension itself supports Windows."
      : pack === "observe" ? "Configure Watchdog/Leash service URLs and secret references explicitly; no service is installed or started."
      : "Installs a private toolchain. Existing commands, shell profiles and Pi settings are not changed. --allow-shadow applies only inside this private toolchain.",
    next: pack === "review" ? "/kujo demo" : `/kujo enable ${pack}`,
  };
  return { ...plan, digest: sha256(canonicalJson(plan)) };
}

/** @param {any} registry @param {any} plan */
export function setupSummary(registry, plan) {
  const rows = CAPABILITY_PACKS.map(pack => {
    const entries = PACK_INTEGRATIONS[pack.id].map(id => registry.integrations.find((/** @type {any} */ e) => e.id === id));
    const ready = entries.filter(e => e?.available).length;
    return `${pack.id}: ${entries.length ? `${ready}/${entries.length} installed` : "service configuration required"} — ${pack.description}`;
  });
  return ["Kujo setup", ...rows, "", `Selected: ${plan.pack}`, plan.note,
    ...plan.packages.map((/** @type {any} */ p) => {
      const e = registry.integrations.find((/** @type {any} */ value) => value.id === p.id);
      const status = !plan.supported ? "unsupported platform" : e?.available ? `available (${e.source})` : e?.error || (e?.checksumVerified === false ? "checksum mismatch" : "missing");
      return `${p.name}@${p.version}: ${status}`;
    }),
    `Install location: ${plan.home}`, `Plan: ${plan.digest}`,
    plan.steps.length ? `Preview exact commands: /kujo setup plan ${plan.pack}\nInstall after review: /kujo setup install ${plan.pack}` : "See docs/pi-onboarding.md for configuration.",
    `Next useful action: ${plan.next}`].join("\n");
}
