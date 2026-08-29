import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputFlag = process.argv.indexOf("--output");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const output = resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : "release");
mkdirSync(output, { recursive: true });
const pack = JSON.parse(execFileSync(npmCommand, ["pack", "--json", "--pack-destination", output], { encoding: "utf8", shell: process.platform === "win32" }))[0];
const source = resolve(output, pack.filename);
const tarball = resolve(output, "kujo-pi.tgz");
renameSync(source, tarball);
const digest = createHash("sha256").update(readFileSync(tarball)).digest("hex");
writeFileSync(`${tarball}.sha256`, `${digest}  kujo-pi.tgz\n`, { mode: 0o644 });
const sbom = execFileSync(npmCommand, ["sbom", "--sbom-format", "cyclonedx", "--omit", "dev"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, shell: process.platform === "win32" });
writeFileSync(resolve(output, "kujo-pi.sbom.cdx.json"), sbom, { mode: 0o644 });
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const verification = {
  schemaVersion: "kujo.pi.release-verification.v1",
  package: packageJson.name,
  version: packageJson.version,
  commit: process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  ref: process.env.GITHUB_REF_NAME || null,
  node: process.version,
  npm: execFileSync(npmCommand, ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim(),
  tarballSha256: digest,
  generatedAt: new Date().toISOString(),
};
writeFileSync(resolve(output, "verification.json"), `${JSON.stringify(verification, null, 2)}\n`, { mode: 0o644 });
console.log(JSON.stringify({ output, ...verification }));
