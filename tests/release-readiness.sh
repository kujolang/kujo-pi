#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

python3 -m json.tool package.json >/dev/null
npm run typecheck
test -f extensions/kujo.ts
test -f skills/kujo-way/SKILL.md
test -f skills/kujo-review/SKILL.md
test -f skills/kujo-release/SKILL.md
test -f prompts/kujo-finish.md
grep -Eq 'registerTool|kujo_scout|kujo_scent|kujo_review_changes' src/extension.ts
grep -Eq 'sameOriginUrl|boundedResponse|realpathSync' src/core.mjs
node tests/core-contract.mjs
node tests/telemetry-contract.mjs
npm run test:extension
node tests/package-contract.mjs
node tests/docs-contract.mjs
node tests/repository-contract.mjs
git diff --check

echo "kujo-pi release-readiness validation passed"
