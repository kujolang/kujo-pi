# Kujo Pi hardening audit — second pass

Repository: `kujolang/kujo-pi`; branch: `main`; date: 2026-09-25 (America/Detroit).
Starting SHA: `407d0b8c50d4642936899ef02f0206cab0e08471` (clean checkout).
Ending implementation SHA: `5595dcffda03e6bf958821d44fe8389b2dcdd56c`. The following documentation commit records this audit; its identity is available through `git log -1 -- docs/audits/repository-hardening-round2.md`.

This pass builds on the [first audit](repository-hardening.md), preserving its history and measurements. It targets fresh evidence rather than repeating resolved findings.

## Scope and contracts reviewed

Kujo Pi is an opt-in Pi client adapter. Eight runtime modules cover extension registration, CLI arguments, signed discovery, filesystem/network boundaries, receipts, presentation, capabilities and telemetry. The package compatibility shim, manifests, schemas, tests, benchmarks, skills/prompts, agent instructions, release scripts, CI and documentation were reviewed against current behavior. Important users are Pi developers and agents consuming versioned tools/results, optional task packs, slash commands, environment configuration and external Kujo CLI/service contracts.

Primary dependencies remain Pi coding-agent/TUI, TypeBox, TypeScript/tsx tooling, and Node's standard library. Optional runtime integrations remain Scout, Scent, PatchBrief, ChangeBucket, ShipCheck, RunLedger, MCP, RAG, Agents SDK, Dispatch, Watchdog, Leash and Ability gateways. Only `kujo-pi` was modified. RunLedger's sibling entrypoint and CLI source were read to verify `kujo run runledger.kujo -- <command>` and unchanged start/finish flags.

## Baseline

`npm test` passed before edits on macOS with Node `v26.7.0` and npm `11.19.0`. It includes type checking, core/service/registry/schema/telemetry/extension/operation contracts, real packed Pi RPC lifecycle, fresh-profile installation, performance budgets, package validation, release tarball/checksum/SBOM verification and docs/repository checks. No baseline gate failure was observed. The pre-existing npm `python` configuration warning remains external to the repository.

`npm audit --json` reported zero advisories for the installed dependency tree (192 dependency entries; no dependency changes). Baseline probes demonstrated that a missing Scout override throws out of registry inspection and that receipt persistence failure turns a completed successful command into `configuration_error` with no operation ID.

Five independent processes hashed a 10,000,000-byte artifact fixture. A later five-process before/after repeat measured host variability using the original contracts module preserved from the starting SHA. Raw measurements are linked below. This is an opt-in receipt path, not default startup work.

## Findings

| ID | Priority | Area | Finding | Evidence | Action | Status |
|---|---|---|---|---|---|---|
| KP2-01 | P1 | Discovery | One missing configured entrypoint aborts all integration inspection | Baseline missing-Scout probe; isolation regression | Isolate per-integration errors; retain global signature rejection | Fixed |
| KP2-02 | P1 | Contracts | Discovery selects/hashes a PATH binary even when execution uses an explicit entrypoint; binary overrides and bad entrypoints disagree | Precedence fixture fails on original source | Apply binary override → entrypoint override → PATH → signed entrypoint consistently; no fallback for broken explicit override | Fixed |
| KP2-03 | P2 | Recovery | Setup/Doctor reuse startup state despite telling users to repair configuration and retry | Repair-in-place fixture fails on original extension | Refresh on explicit setup/Doctor; clear stale registry errors; return structured invalid-workspace results | Fixed |
| KP2-04 | P1 | Failure semantics | Receipt or digest errors misreport completed side effects as command failure, encouraging duplicate execution | Before/after injected disk-full probe; one-command count assertion | Preserve outcome and operation ID; return visible bounded warning; retain partial receipt when only digest fails | Fixed |
| KP2-05 | P1 | Resources/integrity | Artifact digest buffers up to 10 MB, ignores partial-read counts, and traverses arbitrary empty-directory trees recursively | Five-process benchmark; partial-read/EOF fixtures; traversal-budget fixture | Reusable buffer up to 1 MiB, complete short reads, iterative bounded traversal and explicit errors | Fixed |
| KP2-06 | P1 | RunLedger | Discovered `.kujo` entrypoint is executed as a standalone binary; explicit entrypoint path is bypassed | Adapter source vs RunLedger wrapper/CLI; extension argument assertions | Reuse canonical operation dispatch for binary and entrypoint execution | Fixed |
| KP2-07 | P2 | Observability | Network failure receipts lose approval operation IDs; streamed commands omit duration | Failed approved POST and streaming fixtures | Preserve descriptors across catch boundaries; include duration; UUID fallback identifiers | Fixed |
| KP2-08 | P2 | Configuration | Relative registry/key paths are accepted after realpath despite documented absolute-only contract | Override-path regression | Reject relative inputs before canonicalization | Fixed |
| KP-09 | P2 | Crash recovery | Prior orphan telemetry temporary-file recovery concern remains | Existing first-pass evidence and SignalBox item | Keep documented stopped-writer recovery; deduplicate existing capture | Open, unchanged |

## Changes and proof

### Discovery, configuration and RunLedger

`src/registry.mjs` catches individual executable/entrypoint failures and reports `available: false` plus an additive `error`, preserving usable siblings. Invalid signatures or manifests still reject discovery globally. Checksums now describe the selected target. Explicit binary configuration wins even when an unused entrypoint is broken; an explicit entrypoint wins over PATH. Registry/signature/key overrides must be absolute before resolution.

`src/extension.ts` refreshes discovery only at startup and explicit setup/Doctor actions, with no new background polling or installation. Doctor exposes errors/remediations rather than claiming environment/PATH binaries have signed checksum verification. RunLedger argument generation moved into `src/operations.mjs`; both modes use the existing resolver and preserve standalone start/finish flags. The previously declared `KUJO_RUNLEDGER_ENTRY` now works through the runtime rather than direct execution.

`tests/registry-contract.mjs`, `tests/operations-contract.mjs` and `tests/extension-contract.ts` cover invalid-sibling isolation, repair without restart, entrypoint/binary precedence, missing explicit binaries, absolute-path policy, structured Doctor errors and RunLedger's exact argv. Public tool inputs are unchanged. The unused private `commandTarget` function was removed; exported helpers with uncertain outside use were preserved.

### Receipt failures and correlation

`recordReceipt` now separates operation outcome, artifact snapshot failure and receipt persistence failure. A successful command remains successful; `receiptWarning` reports unavailable bookkeeping. If only the snapshot fails, a receipt is still attempted with `artifactDigest: null` and `artifactDigestError`. The presentation layer puts that warning before long command output and explicitly discourages rerunning solely for receipt repair. Warnings are bounded; errors are not silently swallowed.

Ability, Watchdog and Leash failure paths retain the operation descriptor when one exists. Approved POST failures keep matching result/approval/receipt IDs, with no added retries. Streamed subprocess completion now includes measured `durationMs`, matching the non-streaming path. Result and receipt schemas document the additive warning/error fields; their versions and required fields stay unchanged.

Tests inject a receipt-only disk-full error and prove exactly one target invocation, a preserved successful outcome, and a retained ID. A 4,096-directory fixture triggers the traversal limit while proving the completed MCP operation remains successful with an explicit partial-receipt diagnostic. Another fixture proves a failed approved POST is attempted once and keeps the approval ID. UI tests ensure warnings remain visible even beside a maximum-length output and do not turn real command failures into success.

### Artifact snapshots

`src/contracts.mjs` retains v1 path ordering and hash framing. A compatibility reference checks 12 file-count/byte-budget combinations including empty files and a partial final chunk. The buffer grows as needed, reuses capacity, and never exceeds 1 MiB; no buffer is allocated for absent content. Reads honor returned byte counts and report premature EOF. Open descriptors are closed in `finally`; opened targets must be regular files, with no-follow/nonblocking flags where available. This does not create a sandbox against all ancestor-path races.

Traversal is iterative and defaults to at most 4,096 visited entries in addition to the established 128-file/10,000,000-byte snapshot bounds. Over-budget traversal fails visibly instead of returning a misleading new partial digest. `digestArtifacts` adds an optional fourth positive-integer traversal limit; malformed limits reject immediately. Directory-name enumeration remains sorted and can allocate a large single-directory listing. Snapshots remain bounded diagnostics, not complete integrity attestations.

## Performance, context and output efficiency

The checked-in `scripts/benchmark-artifacts.mjs` reproduces the fixture and accepts an optional original contracts module for comparison. All runs returned SHA-256 `5ec896066d13911a8e243c356eac39c4b1b483fb1cb08ce770f8f7623f09af0c`.

| Five-process measurement | Before median | After median |
|---|---:|---:|
| Initial comparison, peak RSS | 48,324 KiB | 39,536 KiB |
| Initial comparison, elapsed | 66.337 ms | 136.995 ms |
| Repeat comparison, peak RSS | 48,236 KiB | 39,484 KiB |
| Repeat comparison, elapsed | 116.820 ms | 96.264 ms |

The consistent evidence is lower peak memory, approximately 8.5 MiB for this fixture. Timing changes direction between runs; **no latency improvement is claimed**. The first 64 KiB-buffer experiment is retained in local evidence; the final implementation uses up to 1 MiB to limit read-call overhead. The later lazy-allocation refinement leaves this large-file allocation and byte sequence unchanged.

Raw data: [initial before](round2/artifacts-before.jsonl), [initial after](round2/artifacts-after.jsonl), [repeat before](round2/artifacts-before-repeat.jsonl), [repeat after](round2/artifacts-after-repeat.jsonl).

Tool schemas, optional capability activation, short agent skills/prompts and bounded model output remain intact. No token reduction, build speed or package-size reduction is claimed. New diagnostics add only failure-specific data, keep underlying operation evidence, and avoid a false failure that might cause expensive repeated side effects. No new dependency, cache or external service was introduced.

## Security, concurrency and compatibility

Reviewed project-trust and approval gates, argv dispatch, configured paths/keys, workspace validation, network origins/redirects/timeouts, credential handling, receipt binding, file reads, telemetry salt/spool concurrency, subprocess lifetime, schemas, dependency pins and release permissions. Changes target the correct discovery/receipt boundaries. README wording now distinguishes Kujo Pi's credential handling from content controlled by external commands/services.

The prior telemetry fix and tests remain; automatic orphan cleanup is not introduced without an ownership model. Startup/explicit discovery is still a snapshot, and operator-trusted executable replacement is not prevented by a process sandbox. Directory enumeration, prolonged telemetry backlog and broad concurrent filesystem mutation remain limitations needing workload evidence.

- Public tool names, slash commands, input schemas and external CLI flags: unchanged.
- Internal operation dispatcher: additive RunLedger route; artifact helper adds an optional traversal bound.
- Results: additive receipt warning and streaming duration; a completed operation no longer falsely fails for a receipt-only error.
- Approval/receipt/result versions and required file fields: unchanged; optional error fields added compatibly.
- Artifact digests: identical for supported stable snapshots; traversal overflow and invalid bounds now fail explicitly.
- Environment variables: none added or removed; documented absolute-path requirements now enforced, so undocumented relative registry overrides must be made absolute.
- Outside consumers: ignore optional fields as required by the 1.x policy; do not assume receipt availability from command success alone.

## Cross-repository follow-ups

None required. RunLedger's existing wrapper and CLI were sufficient; no sibling changes, live provider calls, remote service writes, releases or dependency upgrades were performed.

## Remaining work

- P0/P1: no unresolved validated new defect in this pass.
- P2: prior ownership-safe orphan spool recovery remains `cap_dee95048-c26a-4704-ab03-f3b8f1fa82f4`. Exact ID and concept retrieval confirmed the duplicate; no new Capture or Signal was created. Completed fixes and routine test output were rejected from SignalBox.
- Needs more evidence: sustained telemetry queue pressure, crash recovery under multiple processes, very wide directory enumeration, and CI timing variance. Local Node 26 verification is not a rerun of the remote Node 22/24 OS/canary matrix.
- P3/not worth changing: no cosmetic rewrites, removal of public-looking helpers, dependency substitutions, or capability/schema redesigns.

## Verification receipt

Verbose logs and baseline-source reproductions are local in `.kujo/audit/round2/`.

| Command | Result |
|---|---|
| `npm test > /tmp/kujo-pi-round2-baseline.log 2>&1` | Passed before edits |
| `npm audit --json > .kujo/audit/round2/dependencies.json` | Zero advisories |
| `node .kujo/audit/round2/measure-artifacts.mjs` | Five baseline and five after fixture samples; repeat also run with `.kujo/audit/round2/contracts-before.mjs` |
| `node tests/schema-contract.mjs` | Passed digest compatibility, short-read, EOF, invalid bounds and traversal checks |
| `node tests/registry-contract.mjs` | Passed discovery/signature/precedence/error-isolation checks |
| `node tests/operations-contract.mjs` | Passed unchanged CLI plus RunLedger entrypoint argv |
| `node tests/presentation-contract.mjs` | Passed warning visibility and failure tone |
| `npm run test:extension` | Passed setup repair, receipt injection, network ID correlation and real child-process checks |
| `npm run typecheck` | Passed |
| `node .kujo/audit/round2/baseline/tests/schema-contract.mjs` | Expected failure on original source: invalid budget accepted |
| `node .kujo/audit/round2/baseline/tests/registry-contract.mjs` | Expected failure on original source: wrong selected binary |
| `./node_modules/.bin/tsx .kujo/audit/round2/baseline/tests/extension-contract.ts` | Expected failure on original source: stale/broken discovery |
| `./node_modules/.bin/tsx .kujo/audit/round2/receipt-probe.mts .kujo/audit/round2/baseline/src/extension.ts` | Reproduced false `configuration_error` after successful command |
| `./node_modules/.bin/tsx .kujo/audit/round2/receipt-probe.mts src/extension.ts` | Successful outcome retained; receipt warning and operation ID present; same command count |
| `npm test > .kujo/audit/round2/final.log 2>&1` | Intermediate run hit unchanged 250 ms large-output gate after host/fresh-profile tests passed |
| `node tests/performance-contract.mjs` | Isolated repeat also hit the same budget; no threshold or assertion changed |
| `node .kujo/audit/round2/baseline/tests/performance-contract.mjs` | Original-source comparison passed; core output code and performance test are unchanged in this round |
| `node .kujo/audit/round2/output-timing.mjs` | Diagnostic: truncate 6.538 ms, Response fixture 86.403 ms, bounded read 6.415 ms; total 99.356 ms |
| `npm test > .kujo/audit/round2/final-verified.log 2>&1` | Passed full release-readiness suite, including unchanged performance budgets |
| `node scripts/benchmark-artifacts.mjs` | Final checked-in fixture harness passed with identical digest |
| `node tests/package-contract.mjs` and `node tests/docs-contract.mjs` | Passed after report additions |
| `npm run check:version` and `npm run format:check` | Passed |
| `git diff --check` | Passed |

Timing failures and measurements are retained rather than hidden or reclassified as expected successes. No sleep, timeout increase, assertion relaxation, or performance-gate removal was used. The full gate includes the actual package/release artifact generation path; there is no separate lint/build command beyond the repository's declared scripts.
