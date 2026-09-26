# Kujo Pi repository hardening audit

Latest follow-up: [second hardening pass](repository-hardening-round2.md). The first-pass record below is preserved unchanged.

Date: 2026-09-25 (America/Detroit). Repository: `kujolang/kujo-pi`.
Branch: `main`. Starting SHA: `9d977bdda760830e3cb00c1e0e756ab2d9acfe1e`.
Ending implementation SHA: `165564ee9681fd30d506869b21bcbcf43a35c556`. The subsequent audit-record commit contains this report; use `git log -1 -- docs/audits/repository-hardening.md` for its identity.

## Purpose and scope

Kujo Pi is an opt-in Pi client integration, not a runtime or security sandbox. The public package entrypoint delegates to `src/extension.ts`; capabilities, command construction, network/path policies, signed registry discovery, receipts, presentation, and metadata telemetry occupy separate modules. All eight source modules, the package and lockfile, schemas, both release scripts, contract tests, skills/prompts, agent instructions, integration metadata, CI and release workflows, and supporting documentation were inspected. Changes are confined to this repository.

Primary integrations are Pi coding-agent/TUI, TypeBox, the Kujo executable, Scout, Scent, PatchBrief, ChangeBucket, ShipCheck, RunLedger, MCP, RAG, Agents SDK, Dispatch, Watchdog, Leash, and Ability gateways. Pi users and automation consume tool names, task packs, slash commands, versioned result/approval/receipt schemas, documented environment variables, and argument-array CLI adapters. Those boundaries were retained.

## Baseline

- Clean `main` checkout at the starting SHA; package `1.1.0` is locally unreleased.
- Host: macOS, Node `v26.7.0`, npm `11.19.0`; installed dependency tree available before work.
- `npm test` passed before changes: type checking, core/capability/presentation/operation/schema/registry/service/telemetry/extension contracts, real packed Pi RPC host, fresh-profile installation, performance budgets, package manifest, release tarball/checksum/CycloneDX SBOM, documentation, repository/release controls, and whitespace checks.
- No failing baseline gate. npm emitted a pre-existing user configuration warning about `python`.
- Dependency audit returned zero advisories, including development dependencies (192 dependencies reported; lockfile contains 193 package entries including the root). No dependency or lockfile changes were justified.
- Five isolated processes inspected a synthetic 64 MiB executable through `inspectIntegrations`. Raw results are preserved in [before measurements](registry-hash-before.jsonl) and [after measurements](registry-hash-after.jsonl).
- New regression tests copied against the original source fail on the accepted `..cache` path, HTTP-success malformed Ability JSON, and trusted-to-untrusted telemetry transition. These are newly detected baseline defects, not failures introduced by this pass.

## Findings

| ID | Priority | Area | Finding | Evidence | Action | Status |
|---|---|---|---|---|---|---|
| KP-01 | P1 | Filesystem | Prefix containment rejected valid `..name` directories; `existsSync` skipped dangling symlinks as though absent | Core path fixtures; original core regression failure | Compare parent path segments; use `lstatSync`, resolve existing symlinks, propagate non-ENOENT errors | Fixed |
| KP-02 | P1 | Commands | Pre-cancelled calls still spawned; unused stdin stayed open; UTF-8 chunks decoded separately; output clipping concealed truncation | Real Node child fixtures in extension contract | Check abort before dispatch/spawn, close stdin, stream UTF-8 decoding, retain one overflow character, stop retaining saturated streams, preserve first termination reason | Fixed |
| KP-03 | P2 | HTTP | Invalid response bounds were not validated on streamed bodies; exact-limit responses were falsely marked truncated; invalid retry timeout was retried | Core exact-boundary, split UTF-8, invalid bound, pre-abort fixtures | Validate bounds once; detect overflow with lookahead; avoid copying byte slices; reject cancelled callbacks before invocation | Fixed |
| KP-04 | P1 | Failure semantics | Malformed or oversized Ability JSON inside HTTP 200 was returned as top-level success | Extension regression fails on original source | Carry parse validity into result status and receipt outcome | Fixed |
| KP-05 | P1 | Privacy | A reused telemetry bridge stayed active when entering an untrusted session | Telemetry transition regression fails on original source | Revoke active/run state and guard correlation headers with enabled state | Fixed |
| KP-06 | P1 | Concurrency | Retention could remove another writer's `.tmp`; acknowledged-file deletion by another sender stopped replay | Active temporary-file and deterministic concurrent deletion fixtures | Exclude unpublished files; clean owned temporary files; tolerate only expected ENOENT races in prune/read/delete/rename | Fixed |
| KP-07 | P1 | Memory | Registry checksums buffered complete executable files during startup discovery | Five-process 64 MiB benchmark | Reuse a 64 KiB buffer and close the descriptor in `finally`; checksum equivalence fixture includes a partial final chunk | Fixed |
| KP-08 | P2 | Verification/DX | Retry-budget test incremented its counter after execution rather than counting callbacks; AGENTS pointed at the compatibility shim | Source inspection | Count actual attempts; correct source-of-truth pointer; document changed boundaries | Fixed |
| KP-09 | P2 | Crash recovery | A hard crash can orphan unpublished spool files outside committed-bundle limits | Source-supported: process death bypasses cleanup; regression demonstrates live temporary files must be preserved | Document stopped-writer recovery; retain SignalBox follow-up for ownership-aware cleanup | Open |

## Changes implemented and compatibility

### Paths and bounded network reads

`src/core.mjs` and `tests/core-contract.mjs` now distinguish a parent segment from a dot-prefixed local name and reject unresolved symlink ancestors. Normal missing descendants remain supported. Stream bounds accept positive safe integers only; exact-limit complete bodies remain parseable without a false truncation suffix. UTF-8 split across byte chunks has regression coverage. Read retries retain their existing attempt count/backoff and dispose retry bodies; already-aborted callbacks are not invoked. Non-idempotent service POSTs still have no automatic retries.

### Subprocess and Ability results

`src/extension.ts`, `src/core.mjs`, and `tests/extension-contract.ts` preserve argument arrays, exit codes, project trust and approval gates. Cancellation before command dispatch no longer creates the target process. Streaming stdin is noninteractive, output decoding spans byte chunks, truncation remains visible even when the overflow starts with whitespace, and full output buffers stop growing. Existing 12,000-character model output limits remain, plus their truncation marker. No full-output artifact archive is introduced; bounded output is the existing contract.

Malformed/oversized Ability JSON now produces `ok: false` and `invalid_response` for successful HTTP statuses. Valid JSON and rejected HTTP statuses retain their behavior; the HTTP code and nested diagnostic body remain present. This is an intentional correction for consumers that previously relied on a false success. Input schemas, tool names and network endpoints are unchanged.

### Telemetry

`src/telemetry.mjs` and `tests/telemetry-contract.mjs` cover trust revocation, provider-header privacy, retention of active temporary files, and replay where another sender removes an acknowledged file. ENOENT is treated as expected only at shared-spool disappearance boundaries; other failures still populate `lastError`. Previously queued trusted-session data remains eligible for delivery. Payloads, stable batch IDs, salt format, destination policy and disk file modes are unchanged. Delivery is still at-least-once, not exactly-once. See [telemetry operations](../watchdog-telemetry-bridge.md) for the crash-recovery limit.

### Registry and regression gates

`src/registry.mjs` reads every checksum byte with bounded memory; there is no cache or invalidation change. `tests/registry-contract.mjs` proves the final partial buffer is hashed. `scripts/benchmark-registry.mjs` makes the measurement reproducible without a timing-sensitive CI gate. Existing `npm test` automatically executes all modified contracts on the existing OS/Node CI matrix. `tests/performance-contract.mjs` now verifies actual retry count. No workflow expansion, dependency replacement, public API redesign or cosmetic module split was warranted.

## Performance and efficiency

| Measurement | Before | After | Interpretation |
|---|---:|---:|---|
| Median peak process RSS, 64 MiB checksum fixture, five processes | 106,152 KiB | 41,328 KiB | Measured reduction of 64,824 KiB on this host |
| Median inspection duration, same fixture | 1,917.967 ms | 1,331.305 ms | Observed only; substantial host variance, not a general speed guarantee |
| SHA-256, every measured run | `e20a69eca39368572e90b9135738a613838f954987a0b44b6220889c171cbb76` | Same | Full-byte equivalence |
| Registry file-read buffer | Entire file (64 MiB fixture) | 64 KiB | Source-confirmed allocation bound |
| Retained subprocess text per stream | 12,000 UTF-16 code units | 12,001 | One-character overflow evidence; final content still bounded |
| Runtime/development dependency changes | — | 0 | No new dependency or supply-chain surface |

The measurement script creates and removes a disposable fixture and reports five JSON records. The original equivalent harness ran before the implementation change; the checked-in script preserves that workload. RSS is process-wide, not a heap-only measure. No claimed build-time, network-latency, package-size or token reduction is inferred from these numbers.

The token/context review found a small core set with optional packs, short skills/prompts, bounded model output and bounded UI rendering. Tool definitions and default activation were retained. No tokenizer-specific savings are claimed. Saturated stream buffers no longer repeatedly concatenate later output; this is source-supported work avoidance, not a separately measured throughput claim. Detailed command evidence is stored locally under `.kujo/audit/evidence/`, outside the distributed package and default tool context.

## Security and state review

Reviewed boundaries include project trust; approval binding and headless confirmation; workspace traversal and symlinks; configured executable/entrypoint trust; signed manifests and checksums; subprocess argument arrays and cancellation; configured-origin HTTPS/loopback rules; redirect rejection; per-attempt timeouts; service credentials; bounded payloads/responses; telemetry allowlists, salt publication, spool modes, retention and replay; receipt hashes; and release identity/provenance/permissions.

Fixes strengthen path validation, cancellation, telemetry trust transitions and shared-file safety. This does not create a filesystem sandbox: validation and later execution are separate operations, and trusted operators must prevent concurrent replacement of executable/workspace paths. Registry discovery remains a startup snapshot. Receipt artifact hashes remain bounded summaries rather than full-tree integrity proofs. Local same-user tampering and malicious trusted executables are outside the documented isolation boundary. No private key, credentials, remote service content or raw user telemetry was added to the report.

CI already pins action SHAs, uses `npm ci --ignore-scripts`, reviews dependency changes, tests Node 22/24 on Linux/macOS/Windows, and runs minimum/latest Pi compatibility checks. Publication uses environment gates, exact tarball checksums, an SBOM and provenance. External GitHub/npm settings and remote CI results were not re-certified by local source review.

## Contract receipt

- Public tool/API names and argument schemas: unchanged.
- Slash commands and downstream CLI argument arrays: unchanged; child stdin now explicitly closed and cancellation/output errors corrected.
- Result schema version/shape: unchanged; malformed successful Ability responses now correctly fail.
- Receipt, approval, spool and signed registry file formats: unchanged.
- Configuration and environment variables: unchanged.
- External consumers: no migration needed for valid behavior; consumers must honor corrected failure/truncation results.
- No dependency, package version, private signing key, sibling repository or service deployment was changed.

## Cross-repository follow-ups

None required to use these improvements. Watchdog remains responsible for receiver-side batch deduplication; this pass preserves existing IDs and does not change its ingestion protocol. Live provider/service behavior and the full ecosystem adapter matrix were not exercised or represented as verified.

## Remaining work

- P0/P1: no unresolved validated finding in this pass requiring an immediate fix.
- P2: KP-09 needs an ownership/lease-aware orphan-file recovery design. Deleting unknown `.tmp` files by count or age alone can destroy live writes; manual recovery is documented. SignalBox capture: `cap_dee95048-c26a-4704-ab03-f3b8f1fa82f4` (exact and concept retrieval passed; no Signal created because no production exhaustion was observed).
- P3: none admitted; style-only rewrites and dependency churn rejected.
- Needs more evidence: cross-process crash stress, adversarial same-user filesystem mutation, sustained telemetry backlog/queue measurements, full live adapters, remote supported-platform/canary runs. These are coverage limits, not claims of confirmed vulnerabilities.
- Not worth changing: small capability lookups, short skills/prompts, the compatibility shim, established versioned schemas and separate adapter modules.

## Verification receipt

Commands run from the repository root unless noted:

| Exact command | Outcome |
|---|---|
| `npm test > /tmp/kujo-pi-baseline.log 2>&1` | Passed before changes |
| `node /tmp/kujo-pi-measure.mjs > /tmp/kujo-pi-hash-before.jsonl` | Five baseline measurements |
| `node /tmp/kujo-pi-measure.mjs > /tmp/kujo-pi-hash-after.jsonl` | Five after measurements, identical digests |
| `node tests/core-contract.mjs` | Passed with new path, bound, cancellation and UTF-8 fixtures |
| `npm run test:extension` | Passed with child-process and Ability regression fixtures |
| `node tests/telemetry-contract.mjs` | Passed with privacy and shared-spool race fixtures |
| `node tests/registry-contract.mjs` | Passed, including multi-buffer checksum equivalence |
| `npm run typecheck` | Passed after implementation |
| `node .kujo/audit/baseline/tests/core-contract.mjs` | Expected failure against original source: valid `..cache` path |
| `./node_modules/.bin/tsx .kujo/audit/baseline/tests/extension-contract.ts` | Expected failure against original source: malformed Ability success |
| `node .kujo/audit/baseline/tests/telemetry-contract.mjs` | Expected failure against original source: untrusted transition |
| `npm test > /tmp/kujo-pi-final-latest.log 2>&1` | Final implementation suite passed |
| `npm run format:check` | Passed |
| `npm audit --json > /tmp/kujo-pi-audit.json` | Zero advisories across installed dependencies |
| `npm audit --omit=dev --audit-level=high` | Passed, zero advisories |
| `KUJO_PI_LIVE=1 KUJO_WATCHDOG_URL= KUJO_LEASH_URL= KUJO_PI_ECOSYSTEM_ROOT= npm run test:live` | Environment failure: `kujo` absent from PATH |
| `KUJO_BIN=/Users/robertdevore/2026/Kujolang/kujo-repos/kujo/target/release/kujo KUJO_PI_LIVE=1 KUJO_WATCHDOG_URL= KUJO_LEASH_URL= KUJO_PI_ECOSYSTEM_ROOT= npm run test:live` | Passed using installed explicit runtime; version smoke only |

The full gate includes release artifact creation and verification, real packaged Pi RPC startup, a separate fresh-profile install, local HTTP failure fixtures, all contract suites, type checking and whitespace checks. There is no additional standalone lint/build command to claim. Local verification used Node 26; supported Node 22/24 and other OSes remain covered by the existing remote matrix, not locally rerun here.
