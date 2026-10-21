# Changelog

This project follows [Semantic Versioning](https://semver.org/). Release dates use UTC.

## 1.2.1 - 2026-10-21

### Fixed

- Require patched Node.js security releases and reserve a new package version for the changed release contents.

## 1.2.0 - 2026-10-12

### Added

- Explicit versioned setup previews and approval-bound installation of private released Kujo/Kennel tools, without ecosystem checkouts.
- Pack readiness diagnostics, a headless digest-approved setup CLI, and a credential-free `/kujo demo` change-footprint workflow.
- Fresh consumer acceptance using normal npm peer resolution, packaged setup, signed discovery and a real Pi operation; the release artifact must pass this gate.

### Fixed

- Preserve Dispatch, MCP and RAG binary arguments and align Scent, ChangeBucket and ShipCheck commands with their released CLIs.
- Refresh the signed integration registry to a released cohort, including Kennel archive/provenance identities and isolated module discovery.
- Rotate the unavailable original registry signing key in a separate change; see the registry documentation for trust-root fingerprints and custody.


### Changed

- Support Pi 1.x and use Pi 1.1.0 for development, retaining the minimum-host compatibility checks.
- Refresh development dependencies and pinned CI/release actions flagged by Dependabot.
- Allow host acceptance tests to verify a separate local Pi installation with `KUJO_PI_BINARY`.

### Security

- Replace the vulnerable Undici 8.9.0 dependency with Pi's patched Undici 8.10.2 dependency.

## 1.1.0 - 2026-09-26

### Added

- Opt-in `kujo_ability_list` discovery for principal-visible application Abilities.
- Approval-gated `kujo_ability_call` execution with canonical invocation IDs, idempotency keys, server-bound approvals, and receipt preservation.
- Local and HTTPS Ability gateway profiles with least-privilege bearer and audience configuration.

### Changed

- Pi lifecycle metadata uses the canonical Watchdog v2 batch schema, with opt-in delivery and provider-scoped correlation.
- Doctor refreshes discovery and reports pending telemetry, dropped batches, and deferred orphan cleanup.
- Integration precedence consistently honors explicit binaries and entrypoints; RunLedger entrypoints use `kujo run`.

### Fixed

- Receipt persistence failures preserve completed operation outcomes and expose actionable warnings.
- Streamed commands handle pre-abort, closed stdin, UTF-8 boundaries and bounded output; failed requests retain operation IDs.
- Workspace and registry path validation fail closed at their documented boundaries.
- Telemetry revokes trust on reused sessions, bounds pending writes, and recovers owned crash-orphan files without deleting live writers' files.
- Registry checksums and artifact digests use bounded buffers; artifact enumeration is bounded and short reads are handled correctly.

### Compatibility

- Existing tool inputs, CLI flags and required v1 receipt/result fields remain compatible; Ability tools and Doctor diagnostics are additive.
- Very wide artifact trees return an explicit receipt warning. Legacy or foreign telemetry temporary files still require stopped-writer cleanup.

### Security

- Ability execution requires Pi project trust and an independent Pi approval while retaining the application gateway's authorization, request-bound approval, idempotency, and audit controls.
- Remote Ability gateways require HTTPS; request paths remain on the configured origin and responses stay bounded.

## 1.0.0 - 2026-08-30

### Added

- Task-oriented `understand`, `review`, `ship`, `orchestrate`, `extend`, and `observe` packs.
- `/kujo setup` and `/kujo packs` onboarding commands.
- Pi-native task prompts and compact result rendering.
- A stable capability manifest and centralized integration command contracts.
- Fresh-profile, minimum/latest Pi, recovery, privacy, performance, and release-artifact gates.
- Verified npm provenance and cross-platform acceptance on Linux, macOS, and Windows.

### Changed

- Optional tools now persist within a Pi session and restore after reload or session-tree navigation.
- Doctor and setup give direct remediation for unavailable integrations.
- Dispatch approval now binds the exact arguments that execute.
- Telemetry spool initialization now supports concurrent Pi sessions safely.
- The 1.x capability, result, approval, receipt, command, and environment contracts are now stable.

### Compatibility

- Existing 0.3 tool names and v1 result, approval, and receipt schemas remain stable.
- See the [v1 migration guide](docs/migration-v1.md) and [compatibility policy](docs/compatibility.md).

## 0.3.2 - 2026-08-29

- First npm release with trusted publishing, provenance, checksums, an SBOM, and matching GitHub evidence.
- Added signed integration discovery, approval and receipt contracts, project-trust enforcement, bounded subprocess and network behavior, and Watchdog telemetry support.
