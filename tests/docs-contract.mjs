import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const documents = [
  "README.md",
  "SECURITY.md",
  "docs/enterprise-roadmap.md",
  "docs/pi-onboarding.md",
  "docs/production-readiness-next.md",
  "docs/service-profiles.md",
];

for (const document of documents) {
  assert.equal(existsSync(document), true, `missing documentation file: ${document}`);
  const markdown = readFileSync(document, "utf8");
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^(?:[a-z]+:|\/\/)/i.test(target)) continue;
    const localPath = resolve(dirname(document), decodeURIComponent(target));
    assert.equal(existsSync(localPath), true, `${document} has a broken local link: ${match[1]}`);
  }
}

console.log("documentation contract validation passed");
