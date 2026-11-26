// @ts-check
import { spawn } from "node:child_process";
import { isAbsolute, join } from "node:path";

/** @param {import("node:child_process").ChildProcess} child @param {NodeJS.Signals} signal */
export function terminateProcessTree(child, signal) {
  if (!child.pid) return;
  if (process.platform !== "win32") {
    try { process.kill(-child.pid, signal); }
    catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ESRCH")) child.kill(signal);
    }
    return;
  }
  const system = process.env.SystemRoot || process.env.WINDIR;
  if (!system || !isAbsolute(system)) {
    child.kill(signal);
    return;
  }
  const task = spawn(join(system, "System32", "taskkill.exe"), ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  task.once("error", () => child.kill(signal));
  task.once("exit", code => { if (code !== 0 && child.exitCode === null) child.kill(signal); });
}
