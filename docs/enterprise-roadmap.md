# Kujo Pi Enterprise Roadmap

This is the next-session work list for making `@kujolang/kujo-pi` a shining example of a Pi package and a frictionless gateway into Kujo. Items are ranked by user value, risk reduction, and how much they improve the first five minutes after installation.

| Rank | Work item | Type | Estimate | Build complexity | Value / acceptance criteria |
|---:|---|---|---:|---:|---|
| 1 | Pi-native result renderers for Scout, PatchBrief, ChangeBucket, ShipCheck, and RunLedger | Extension UI | 3–5 days | High | Reports become scannable in the TUI; raw JSON remains available for automation. |
| 2 | Contract-fixture matrix for every Kujo adapter | Tests | 3–5 days | Medium | Deterministic fixtures cover success, timeout, cancellation, missing binary, malformed output, and non-zero exit paths. |
| 3 | Version/capability negotiation with Kujo CLI and service contracts | Extension core | 2–4 days | Medium | `kujo_doctor` reports compatible versions and disables incompatible capabilities with actionable remediation. |
| 4 | Structured error taxonomy and retry policy | Extension core | 2–3 days | Medium | Errors distinguish configuration, approval, cancellation, timeout, unavailable dependency, protocol, and remote failure. |
| 5 | Streaming progress for long-running Dispatch, ShipCheck, MCP, and Scout calls | Extension runtime | 3–5 days | High | Users see bounded progress updates and can cancel safely without waiting for a silent timeout. |
| 6 | Signed or pinned release provenance | Supply chain | 1–2 days | Low | README documents immutable Git installs; CI verifies lockfile integrity and release artifacts. |
| 7 | Dedicated least-privilege service profiles | Security | 3–5 days | High | Watchdog and Leash configurations can enforce localhost, TLS, audience, and request-size policy. |
| 8 | Redacted structured receipts for every adapter invocation | Observability | 2–4 days | Medium | RunLedger-compatible receipts include operation, duration, exit state, artifact paths, and no credentials. |
| 9 | Optional project bootstrap command | Onboarding | 2–3 days | Medium | `/kujo init` creates only reviewed, minimal project configuration and never overwrites existing files. |
| 10 | Full live-service integration suite | CI / integration | 1–2 weeks | High | Opt-in CI exercises real Kujo CLI, MCP, Dispatch, RAG, Watchdog, Leash, and Agents SDK contracts. |
| 11 | Multi-workspace and monorepo targeting | Functionality | 3–5 days | High | Tools can target a validated workspace root while retaining containment and project-trust checks. |
| 12 | npm publication and release automation | Distribution | 1–2 days | Low | Versioned npm install works, GitHub release notes are generated, and package contents are reproducible. |

Current implementation status: ranks 1–11 have local implementations, including safe subprocess streaming. The opt-in local integration matrix now passes all 10 deterministic ecosystem adapters; Watchdog and Leash health checks remain available when service URLs are supplied. Rank 12 has release automation but npm publication remains pending an interactive registry one-time password.

## Review findings addressed in the current pass

- Side-effecting tools are opt-in rather than merely approval-gated.
- Missing binaries now return structured tool results instead of uncaught failures.
- Doctor probes run concurrently and remain bounded by per-command timeouts.
- HTTP response bodies are bounded and configured-origin constrained.
- Workspace checks reject lexical escapes and symlink escapes.
- `/kujo list`, `/kujo enable`, and `/kujo disable` provide a usable manual control surface.
- `/kujo init` creates a minimal project-local marker without overwriting existing files.
- Pi-native compact result renderers and start/end progress updates keep long-running calls legible without flooding the model context.
- Command failures now carry a stable status taxonomy such as `dependency_unavailable`, `timeout`, `cancelled`, and `command_failed`.
- Doctor reports parsed Kujo version compatibility when `KUJO_PI_MIN_KUJO_VERSION` is configured.
- CLI integrations accept a validated workspace subdirectory for monorepos and nested packages.
- Optional redacted session receipts are available through `KUJO_PI_RECEIPTS=1`.
- Local and remote service profiles document HTTPS, audience, token, and loopback requirements.
- `npm run test:live` provides an opt-in smoke harness for an installed Kujo CLI, configured service health endpoints, and (when `KUJO_PI_ECOSYSTEM_ROOT` is set) the local deterministic adapter matrix.
- The local integration matrix uses a temporary git fixture and Dispatch's reviewed routed workflow, so it exercises canonical entrypoints without mutating ecosystem repositories or requiring provider credentials.
- Release automation publishes provenance-bearing npm releases from immutable version tags when organization credentials are present.
- npm publication was attempted for `@kujolang/kujo-pi@0.3.0`; npm authentication succeeded but publication requires an interactive one-time password, so no package was published.
- The fixture matrix executes every local CLI adapter through success, missing-dependency, timeout, approval, and path-containment cases.

## Explicit non-goals

Kujo Pi should not duplicate Kujo runtimes, become a second permission system, silently install dependencies, run background agents, or turn telemetry on by default. Those behaviors would make the package less trustworthy and less Pi-like.
