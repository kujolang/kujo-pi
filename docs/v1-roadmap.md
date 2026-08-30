# Kujo Pi v1 release standard

Kujo Pi 1.0 is the stable compatibility and product-quality line. It gives Pi developers a predictable way to install Kujo Pi, understand its boundaries, enable a focused workflow, and recover from missing dependencies without repository-specific knowledge.

## Stable guarantees

### First use

- A fresh Pi profile installs `@kujolang/kujo-pi` by package name and loads it without manual state edits.
- `/kujo setup` reports signed-registry health, available integrations, and one useful next action.
- `/kujo packs` explains task-oriented packs while optional tools remain inactive until enabled.
- Enabled packs restore with their persisted Pi session; a new session starts with the quiet core set.
- `kujo_doctor` provides a concrete remediation for every required dependency or invalid policy.

### Capability contract

- Every exposed tool is declared in `src/capabilities.mjs` with its pack, default state, approval policy, side effect, and model guidance.
- Capability names, task-pack names, result schemas, approval schemas, receipt schemas, commands, and documented environment variables remain backward compatible throughout 1.x.
- Integrations are discovered through the signed registry or explicit absolute overrides.
- New ecosystem tools enter through the capability contract and a user-centered pack, not an unbounded default tool list.

### Compatibility and resilience

- CI covers macOS, Linux, and Windows with supported Node versions.
- Scheduled canaries cover the minimum supported and newest published Pi host releases.
- Cancellation, timeout, missing dependency, invalid configuration, unavailable service, and session recovery paths have deterministic tests.
- Startup and core read-only operations stay within documented performance budgets.

### Safety and privacy

- Project mutations, workflow execution, and service writes require project trust and explicit approval where declared.
- Telemetry is opt-in, metadata-only by default, locally spooled, bounded, and redacted.
- Network integrations enforce configured origins, reject redirects, bound responses, and exclude secrets from results and receipts.
- Release workflows use immutable actions, trusted npm publishing, provenance, checksums, SBOMs, protected environments, and protected tags.

## 1.0 acceptance

Version 1.0.0 passed the repository gate, supported-platform matrix, minimum/latest Pi canaries, exact-package fresh-profile test, release-artifact verification, npm signature and provenance verification, and two-distribution VM acceptance. The project owner accepted `1.0.0-rc.1` for stable release on 2026-08-30. The detailed record is in [v1 acceptance](v1-acceptance.md).

## Product boundary

Kujo Pi makes Kujo capabilities feel native inside Pi. It does not embed every Kujo implementation, silently install dependencies, start background services, or turn Pi into a monolithic Kujo distribution. The package stays small, local-first, and quiet by default; signed integrations remain independently installable and useful.

Future compatible work belongs in the [post-1.0 roadmap](enterprise-roadmap.md). Release evidence remains governed by the [production-readiness standard](production-readiness.md).
