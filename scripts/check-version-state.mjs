import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `v${version}`;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

let taggedCommit = "";
try {
  taggedCommit = git(["rev-parse", "--verify", `${tag}^{commit}`]);
} catch {
  console.log(`${version} is unreleased; no local ${tag} tag exists`);
  process.exit(0);
}

const head = git(["rev-parse", "HEAD"]);
if (head !== taggedCommit) {
  throw new Error(`package version ${version} already belongs to ${tag} at ${taggedCommit}; bump the version before changing release contents`);
}

console.log(`${version} matches ${tag} at ${head}`);
