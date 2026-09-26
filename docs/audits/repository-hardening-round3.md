# Kujo Pi hardening — remaining-item closure

Repository: `kujolang/kujo-pi`; branch: `main`; date: 2026-09-25 (America/Detroit).
Starting SHA: `df509eee8bf00588cfbcedb4e1a8aeba0f173421` (clean checkout).
Ending implementation SHA: `cfb6597c72d0fd92e64979223795183079deea01`.
The following documentation commit records this receipt; use `git log -1 -- docs/audits/repository-hardening-round3.md` for its SHA.

This follow-up closes the actionable remaining items from the [second pass](repository-hardening-round2.md). Kujo Pi remains an opt-in Pi client using Node filesystem/process primitives, Pi lifecycle hooks, and optional Watchdog metadata intake. No sibling repository, dependency, release version, external service data, or capability activation changed.

## Baseline

The clean starting checkout passed `npm test` locally on macOS, Node 26.7.0. The preceding commit's [CI run 36205962992](https://github.com/kujolang/kujo-pi/actions/runs/36205962992) also passed all six Node 22/24 Linux/macOS/Windows jobs and both Pi 0.84.3/latest compatibility jobs. The PR-only dependency-review job was correctly skipped on push. No baseline failure was observed in this follow-up.

A deterministic blocked-writer fixture submitted 10,000 independent batches with a ten-batch/65,536-byte configured limit. The original implementation scheduled all 10,000 writes; its disk retention settings did not bound the pending promise chain. This demonstrates queue amplification without claiming a production incident or inferring RSS from serialized size.

## Findings and actions

| ID | Priority | Area | Finding/evidence | Action | Status |
|---|---|---|---|---|---|
| KP-09 | P2 | Crash recovery | Unpublished salt/bundle files outlive killed processes; old formats have no reliable owner scope | Scoped temporary names; recover only provably absent local owners on initialization | Fixed for new local files; legacy migration boundary documented |
| KP3-01 | P1 | Resource bounds | Blocked writer accepted 10,000 pending batches despite ten-file setting | Bound pending count and UTF-8 bytes; reject newest overflow; expose cumulative loss counters in Doctor | Fixed |
| KP3-02 | P2 | Failure cleanup | Salt write/sync errors bypassed the previous publication cleanup block | Enclose complete salt write/publication lifetime in cleanup; injected failure test | Fixed |
| KP3-03 | P2 | Artifact enumeration | `readdirSync` allocated/sorted arbitrarily wide directories before the visit budget applied | Stream names within the existing entry budget, sort only the bounded set, fail explicitly on overflow | Fixed |
| KP3-05 | P1 | Cross-platform recovery | Windows Node 22 returned `EPERM` for a competing orphan unlink, aborting initialization | Preserve busy/inaccessible orphans, report deferred cleanup, retain propagation of unexpected I/O errors | Fixed; regression fixture added |
| KP3-04 | P2 | Verification | Previous audit did not inspect remote matrix evidence; timing failure lacked measured duration | Inspect previous and new CI; keep all timing budgets, add duration to failure diagnostic | Verified below |

## Implementation and regression proof

### Telemetry ownership, state and pressure

`src/telemetry-files.mjs` supplies random temporary names bound to hostname/PID; Linux additionally binds boot identity and PID namespace. Scope resolution is lazy and cached, so disabled telemetry performs no new filesystem work. Missing Linux `/proc` identity deliberately disables automatic recovery while preserving telemetry writes with unowned names.

Recovery streams directory entries. It only unlinks a recognized regular file after the owning local PID probe returns `ESRCH`. Live/reused PIDs, `EPERM` or other uncertain probes, foreign scopes, symlinks and legacy names survive. Cleanup is idempotent under competing reapers. Permission/busy errors during orphan cleanup preserve the file and increment a visible `deferredTemporaries` counter rather than disabling an otherwise writable spool; unexpected I/O errors still propagate. Doctor reports deferred cleanup for operator inspection and the next initialization retries it. Some filesystems acknowledge both concurrent unlinks; each process counts its own successful cleanup calls rather than claiming a globally unique total. The same helper serves salt and bundle writes; all ordinary write failures clean their owned temporary file.

`src/telemetry.mjs` reserves queue count and serialized UTF-8 bytes before scheduling disk work, releases reservations on success/failure, and exposes pending count/bytes, rejected batches, write failures and recovery counts. Queue overload rejects newest batches rather than retaining unbounded waiting payloads. Loss counters survive subsequent successes within the process. Flush notification callbacks no longer each adopt the same potentially slow network promise. Existing committed-file retention and at-least-once delivery remain unchanged.

`src/extension.ts` adds a compact `telemetry` diagnostic object to Doctor, plus a remediation when loss counters are nonzero. No paths, credentials, raw payloads or raw error strings are added to that diagnostic. No network action is added to Doctor.

`tests/telemetry-pressure-contract.mjs` and its child-process fixture exercise two actual OS processes sharing a salt, live-file preservation, a `SIGKILL` orphan, competing cleanup, successful publication by the survivor, automatic initialization recovery, legacy/foreign preservation, permission-denied liveness, symlink preservation on supported test hosts, a 10,000-event burst, independent byte limits using multibyte text, reservation release after disk failure, failed-salt cleanup, deferred `EPERM` cleanup without losing spool availability, and propagated `EIO` failures. IPC readiness and explicit promise gates replace timing sleeps. The full release-readiness gate now runs these tests; package tests assert the helper ships. Extension tests verify additive Doctor diagnostics.

### Bounded artifact enumeration

`src/contracts.mjs` uses a directory handle to enumerate names, counts root plus discovered entries against the existing 4,096-entry default, and closes the handle even on overflow. Only a bounded name list is sorted. One extra entry is read to detect overflow. Existing v1 lexical ordering, hash framing, file/byte caps and 1 MiB content buffer remain intact for in-budget trees.

`tests/schema-contract.mjs` compares a 130-file directory against the legacy digest, verifies explicit wide-directory overflow even with a one-file selection limit, and supplies an unlimited directory iterator to prove enumeration stops on the 4,096th child read and closes its handle. Existing short-read, EOF, nested-tree and digest-equivalence tests still pass. Overflow continues to become a receipt warning, preserving the completed operation outcome.

## Measured efficiency

| Deterministic blocked-writer fixture | Before | After |
|---|---:|---:|
| Submitted batches | 10,000 | 10,000 |
| Queued writes | 10,000 | 10 |
| Reported overflow rejections | Unavailable | 9,990 |
| Retained pending UTF-8 bytes | Unavailable | 10,500 |

Reproduce with `node scripts/benchmark-telemetry-pressure.mjs [baseline-module]`. The checked-in [before](round3/queue-before.json) and [after](round3/queue-after.json) outputs preserve exact measurements. The baseline module is copied from the starting SHA with its original core/capability imports under `.kujo/audit/round3/baseline/`.

These are queue counts and serialized bytes, not measured heap/RSS or token savings. There is no claimed runtime speedup, dependency reduction or model-context reduction. Directory memory is now bounded by the existing entry budget; the structural regression test proves bounded enumeration without a noisy memory threshold. Timing gates retain every original budget; the large-output assertion now includes its actual duration if it fails. No timing failure occurred in this follow-up's local full gates.

## Security and compatibility

The reviewed boundary is local trusted-process telemetry storage and bounded optional artifact inspection. Recovery is not an authorization mechanism against a malicious same-user process with spool write access. Spools must be local, not shared by hosts with colliding hostnames/PID identities. New orphan cleanup does not promote partial data or follow symlinks. Quiet-by-default and project-trust gates remain intact.

- Public tool names, CLI flags, input schemas, environment names, network schema and required receipt fields: unchanged.
- Doctor result: additive telemetry counters and a loss remediation.
- Temporary file names: internal format changed; committed JSON/salt files remain compatible. Legacy, unowned and foreign-scope temporary files require stopped-writer manual cleanup. Linux files from older boots are conservatively preserved.
- Queue settings: existing file/byte limits now independently bound per-process pending work as well as committed retention. Under sustained overload, newest batches can be rejected and loss is explicitly reported. Aggregate usage still scales with the number of processes.
- Artifact helper: same signature and entry-limit setting; the limit now includes enumerated names. Very wide directories can return a digest warning sooner than before, even if the file limit would select a small subset. Supported in-budget hashes remain identical.
- External consumers: tolerate the additive Doctor field; telemetry remains best effort, with existing receiver-side batch deduplication. No ecosystem migration is required.

## Remaining work and cross-repository follow-ups

- P0/P1/P2: no remaining validated actionable defect from this follow-up.
- Operational boundaries: legacy/unowned/foreign temporary files still require stopped-writer removal; recovery of new owned files happens at initialization, not continuously. Arbitrary shared network filesystems and hostile same-user filesystem replacement are outside the supported local-spool model.
- Needs more evidence: production workload sizing and unconstrained concurrent filesystem mutation are not established by finite fixtures. These are limits on claims, not a reason to add speculative locks/caches or change contracts.
- P3/not worth changing: no cosmetic rewrite or benchmark threshold adjustment.
- Cross-repository changes: none required.
- SignalBox: no new captures warranted. Historical `cap_dee95048-c26a-4704-ab03-f3b8f1fa82f4` supplied the orphan-recovery task; this report and the new Strata handoff record the implementation without creating a duplicate capture or mutating its historical evidence.

## Verification receipt

Verbose local evidence is retained under `.kujo/audit/round3/`.

| Exact command | Result |
|---|---|
| `npm test > .kujo/audit/round3/baseline.log 2>&1` | Passed before edits |
| `node scripts/benchmark-telemetry-pressure.mjs .kujo/audit/round3/baseline/telemetry.mjs` | 10,000 queued writes on original source |
| `node scripts/benchmark-telemetry-pressure.mjs` | 10 queued writes, 9,990 visible rejections, 10,500 pending UTF-8 bytes |
| `node tests/telemetry-pressure-contract.mjs` | Passed real process crash/recovery, pressure and failure cleanup |
| `node tests/telemetry-contract.mjs` | Passed existing lifecycle/privacy/replay contracts |
| `node tests/schema-contract.mjs` | Passed legacy hash equivalence and bounded enumeration |
| `npm run test:extension` | Passed extension/Doctor contracts |
| `npm run typecheck` | Passed |
| `node tests/performance-contract.mjs` | Passed unchanged budgets |
| `npm test > .kujo/audit/round3/final.log 2>&1` | Passed full gate |
| `npm test > .kujo/audit/round3/final-verified.log 2>&1` | Passed full gate after final regression additions |
| `npm test > .kujo/audit/round3/windows-fix-verified.log 2>&1` | Passed after cross-platform recovery correction |
| `npm audit --json > .kujo/audit/round3/dependencies.json` | Zero advisories; no dependency changes |
| `node tests/docs-contract.mjs` | Passed |
| `git diff --check` | Passed |

Development diagnostics retained: the first concurrent-reaper test incorrectly assumed only one successful unlink acknowledgment; an isolated two-unlink fixture demonstrated that macOS can acknowledge both. The corrected assertion requires orphan removal, preserved live publication, and bounded per-process counts. An initial baseline benchmark invocation omitted the original `capabilities.mjs` import; copying the missing baseline module corrected the harness, with no runtime fallback or changed production behavior.

The first new remote run, [36209244907](https://github.com/kujolang/kujo-pi/actions/runs/36209244907), passed seven jobs and exposed the Windows Node 22 competing-unlink `EPERM` issue above. Its raw job log is `.kujo/audit/round3/windows-node22.log`, retrieved with `gh api repos/kujolang/kujo-pi/actions/jobs/108312173175/logs`. This was an introduced failure and was fixed, not classified as expected or retried unchanged.

Corrected implementation [CI run 36209480479](https://github.com/kujolang/kujo-pi/actions/runs/36209480479) passed all six Node 22/24 Linux/macOS/Windows jobs and both Pi minimum/latest compatibility jobs. `gh run watch 36209480479 --exit-status` exited zero; its evidence is retained in `.kujo/audit/round3/ci-corrected.log`. The PR-only dependency-review job was skipped as configured. No performance thresholds, assertions, timeouts or platform coverage were weakened.
