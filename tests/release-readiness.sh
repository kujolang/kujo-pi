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
rg -n 'registerTool|kujo_scout|kujo_scent|kujo_review_changes' extensions/kujo.ts >/dev/null
rg -n 'sameOriginUrl|boundedResponse|realpathSync' src/core.mjs >/dev/null
node tests/core-contract.mjs
npm run test:extension
git diff --check

echo "kujo-pi release-readiness validation passed"
