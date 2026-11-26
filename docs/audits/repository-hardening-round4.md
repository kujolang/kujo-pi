# Kujo Pi repository hardening, November 26, 2026

Audited public `kujolang/kujo-pi` on `main` from `fe15c9ac0c8a4d854833730e833b698a78127604` through code commit `8c46d4a`. Kujo Pi is an opt-in Pi extension. The packaged Ed25519 registry binds ten independently versioned integrations and the Kujo 1.8.1 setup cohort.

| Priority | Finding and correction |
|---|---|
| P0 | Telemetry replay accepted arbitrary JSON-like files from the spool. Replay now opens bounded, regular, user-owned files, validates the metadata-only schema and emits only the decoded metadata object. Invalid owned files move into existing bounded quarantine. Valid older batches still replay. Doctor exposes the quarantine count. |
| P0 | Scout reports and local RunLedger writes lacked the approval required by the documented artifact policy. Both tools now use Pi confirmation or explicit headless consent. Approved local commands recheck the target, arguments, workspace and Git revision. Gateway requests include the exact payload and idempotency key in approval evidence, and service responses that echo credentials are withheld. |
| P0 | Some canonical commands inherited project module resolution and Kujo script-argument overrides. Canonical, signed-registry and managed invocations now use isolated imports and verified source roots. The project working directory still provides data. Explicit integrations keep the nearest Kennel package root. |
| P1 | Nonstreaming actions relied on Pi's buffered command runner, and child cleanup could leave descendants after the command completed. All actions now bound capture while executing and use the same supervised process path. Setup identifies cancellations and timeouts, cleans locks on failure, and writes installer and receipt files atomically. |
| P1 | Ordinary tool execution verified and hashed every installed integration. It now verifies the entire signed manifest and hashes only the selected entrypoint or binary. Signed registry files, keys, Kennel state and integration hashing use bounded regular-file reads. Doctor retains the full inventory. |
| P1 | The Pi development graph included three affected dependency entries. The lock now uses Undici 8.13.1 and minimatch 11.0.9 on affected paths. [Undici release notes](https://github.com/nodejs/undici/releases) · [Minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) |

## Coverage

- Reviewed the Pi extension and CLI entry points, capability contracts, default tool exposure, prompts and Skills, signed registry, setup planning, subprocesses, service adapters, telemetry, receipts, packaging, CI and release controls.
- Stable result, approval, receipt and registry schemas retain their versions. New confirmation fields are optional in the tool schema and required for headless authorization of the two previously unguarded writes. The extension preserves short result presentation, bounded output and progressive updates. Model token consumption was outside the measured workload.
- Reviewed startup, session trust, host permission checks, workspace containment, private install roots, child cleanup, offline retry behavior, concurrency and spool retention. Existing no-inference and no-background-work defaults remain supported.
- Reviewed dependencies, provenance checks and generated artifacts. Repository tests cover the offline adapter and real packaged Pi profiles. No signed cohort was changed, and no release was published.

## Verification

- Baseline `npm ci --ignore-scripts` and `npm test` passed on Node 22.23.4. Final `npm test` passed on Node 22.23.4, 24.22.1 and 26.12.1, including type checking, packaged host lifecycle, fresh profile, performance budgets, archive contents, release artifact integrity and SBOM checks. `npm audit --json` reports zero affected dependency entries.
- Real Pi v0.84.3 and v1.6.0 both passed `test:host` and `test:fresh-profile`. Tests used disposable workspaces and no model calls.
- `KUJO_PI_LIVE=1 npm run test:live` passed all ten adapters on signature-pinned source archives and released Kujo 1.8.1. Dispatch, Agents SDK and RAG used offline fixtures. Separate execution through the adapter confirmed the signed Agents SDK entrypoint resolves its own package root from a disposable project.
- Valid 1.2.1 telemetry retained its structure on replay. Local fixtures covered oversized data, unsupported content, symlinks, concurrent pruning and recovery, missing approval, stale Git revisions, process descendants, chunked UTF-8 and echoed credentials. Setup fixtures covered cancelled and successful plan execution.
- Fifteen warmed samples on Intel macOS, Node 22.23.4, with ten configured integrations backed by a 12 MiB fixture returned the same selected integration digest. Median verification for that action fell from 346.061 ms to 34.474 ms. Full Doctor inventory timing was outside this comparison.

## Published runtime transport

The signed bootstrap matched the live Kennel installer's SHA-256. The private `kujo-pi-setup apply review` fixture installed its pinned npm runtime, then stopped at the first Kennel release metadata HTTPS request. The setup lock was cleaned. On this Intel macOS host, released Kujo 1.6.0, the signed cohort's npm Kujo 1.8.1, and checksum-verified Kujo 1.10.0 all returned a transport error for that same bounded HTTPS request. The local Kujo 1.10.0 development build and system curl returned HTTP 200. A retry with system CA roots and a direct DNS-pinned probe also failed on released Kujo 1.8.1. This leaves the full public automatic setup path unverified on this host. The failure is below Pi's setup wrapper and reproducible outside it.
