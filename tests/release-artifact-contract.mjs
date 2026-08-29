import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const output = mkdtempSync(join(tmpdir(), "kujo-pi-release-"));
execFileSync(process.execPath, ["scripts/build-release-artifacts.mjs", "--output", output], { stdio: "pipe" });
const tarball = readFileSync(join(output, "kujo-pi.tgz"));
const digest = createHash("sha256").update(tarball).digest("hex");
assert.equal(readFileSync(join(output, "kujo-pi.tgz.sha256"), "utf8"), `${digest}  kujo-pi.tgz\n`);
const sbom = JSON.parse(readFileSync(join(output, "kujo-pi.sbom.cdx.json"), "utf8"));
assert.equal(sbom.bomFormat, "CycloneDX");
const verification = JSON.parse(readFileSync(join(output, "verification.json"), "utf8"));
assert.equal(verification.schemaVersion, "kujo.pi.release-verification.v1");
assert.equal(verification.tarballSha256, digest);
assert.match(verification.commit, /^[a-f0-9]{40,64}$/);

console.log("release artifact, checksum, SBOM, and verification contract passed");
