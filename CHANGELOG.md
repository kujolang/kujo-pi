# Changelog

This project follows [Semantic Versioning](https://semver.org/). Release dates use UTC.

## 1.1.0 - 2026-09-01

### Added

- Opt-in `kujo_ability_list` discovery for principal-visible application Abilities.
- Approval-gated `kujo_ability_call` execution with canonical invocation IDs, idempotency keys, server-bound approvals, and receipt preservation.
- Local and HTTPS Ability gateway profiles with least-privilege bearer and audience configuration.

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
