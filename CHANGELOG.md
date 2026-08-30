# Changelog

This project follows [Semantic Versioning](https://semver.org/). Release dates use UTC.

## 1.0.0-rc.1 - 2026-08-30

### Added

- Task-oriented `understand`, `review`, `ship`, `orchestrate`, `extend`, and `observe` packs.
- `/kujo setup` and `/kujo packs` onboarding commands.
- Pi-native task prompts and compact result rendering.
- A stable capability manifest and centralized integration command contracts.
- Fresh-profile, minimum/latest Pi, recovery, privacy, performance, and release-artifact gates.

### Changed

- Optional tools now persist within a Pi session and restore after reload or session-tree navigation.
- Doctor and setup give direct remediation for unavailable integrations.
- Dispatch approval now binds the exact arguments that execute.
- Telemetry spool initialization now supports concurrent Pi sessions safely.

### Compatibility

- Existing 0.3 tool names and v1 result, approval, and receipt schemas remain stable.
- See the [v1 migration guide](docs/migration-v1.md) and [compatibility policy](docs/compatibility.md).

## 0.3.2 - 2026-08-29

- First npm release with trusted publishing, provenance, checksums, an SBOM, and matching GitHub evidence.
- Added signed integration discovery, approval and receipt contracts, project-trust enforcement, bounded subprocess and network behavior, and Watchdog telemetry support.
