// @ts-check
import { createHash, randomUUID } from "node:crypto";
import { lstat, opendir, readFile, readlink, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

// Spools are local to one machine. Include Linux's boot and PID namespace so
// containers sharing a hostname cannot mistake each other's process IDs.
async function readOwnerScope() {
  let identity = hostname();
  if (process.platform === "linux") {
    try {
      identity += `:${await readFile("/proc/sys/kernel/random/boot_id", "utf8")}:${await readlink("/proc/self/ns/pid")}`;
    } catch {
      // No reliable namespace identity: preserve telemetry, disable recovery.
      return null;
    }
  }
  return createHash("sha256").update(identity).digest("hex").slice(0, 32);
}

/** @type {Promise<string|null>|undefined} */
let scopePromise;
function ownerScope() { return scopePromise ??= readOwnerScope(); }

/** @param {string} directory */
export async function temporarySpoolPath(directory) {
  return join(directory, `.kujo-pi-${await ownerScope() ?? "unowned"}-${process.pid}-${randomUUID()}.tmp`);
}

/** Remove only recognized regular files whose local owning process is gone.
 * Live/reused PIDs, foreign scopes, old formats and uncertain liveness are kept.
 * @param {string} directory
 */
export async function recoverSpoolTemporaries(directory) {
  const scope = await ownerScope();
  if (!scope) return 0;
  let recovered = 0;
  for await (const entry of await opendir(directory)) {
    const name = entry.name;
    const match = /^\.kujo-pi-([a-f0-9]{32})-([1-9][0-9]*)-([a-f0-9-]{36})\.tmp$/.exec(name);
    if (!match || match[1] !== scope) continue;
    const pid = Number(match[2]);
    if (!Number.isSafeInteger(pid) || pid > 2_147_483_647) continue;
    try { process.kill(pid, 0); continue; }
    catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ESRCH")) continue;
    }
    const path = join(directory, name);
    try {
      if (!(await lstat(path)).isFile()) continue;
      await unlink(path);
      recovered += 1;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return recovered;
}
