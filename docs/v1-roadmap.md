# Kujo Pi v1 readiness

Kujo Pi reaches 1.0 when a Pi developer can install it, understand it, use a focused Kujo workflow, and recover from failure without repository-specific knowledge. Version 1.0 is a compatibility and product-quality commitment, not a count of bundled tools.

## Release gates

### First use

- A fresh Pi profile can install `@kujolang/kujo-pi` by package name and load it without warnings.
- `/kujo setup` reports trust, signed-registry health, available integrations, and one useful next action.
- `/kujo packs` explains task-oriented packs; optional tools stay inactive until enabled.
- Enabled packs survive session reload and session-tree navigation.
- `kujo_doctor` provides a concrete remediation for every required dependency or invalid policy.

### Stable capability contract

- Every exposed tool is declared once in `src/capabilities.mjs` with its pack, default state, approval policy, side effect, and model-facing prompt.
- Capability names, result schemas, approval schemas, and receipt schemas remain backward compatible throughout the 1.x line.
- Integrations are discovered through the signed registry or explicit overrides; consumers do not need a Kujo monorepo checkout.
- New ecosystem tools enter through the capability contract and a user-centered pack, not an unbounded default tool list.

### Compatibility and resilience

- CI passes on macOS, Linux, and Windows with supported Node versions.
- Weekly canaries pass against the minimum supported and latest Pi host releases.
- Cancellation, timeout, missing dependency, invalid configuration, unavailable service, and session recovery paths have deterministic tests.
- Startup and core read-only operations stay within the documented performance budgets.

### Safety and privacy

- Project mutations, workflow execution, and service writes require project trust and explicit approval where declared.
- Telemetry remains opt-in, metadata-only by default, locally spooled, bounded, and redacted.
- Network integrations enforce configured origins, reject redirects, bound responses, and never expose secrets in results or receipts.
- Release workflows use immutable actions, trusted npm publishing, provenance, checksums, SBOMs, protected environments, and protected tags.

### Release acceptance

- `npm test`, type checking, package contents, the host harness, and a fresh-profile smoke test pass from the exact release tarball.
- The package version, Git tag, GitHub release, npm version, provenance, and dist-tag agree.
- The 0.9 release candidate receives external Pi-developer feedback with no unresolved release blocker.
- The v1 compatibility policy, migration notes, support policy, and known blind spots are published.

## Delivery sequence

1. **0.4 — Foundation:** release identity guard, current dependencies, Pi compatibility canaries, capability manifest, packs, setup UX, and persisted activation.
2. **0.5 — Universal integrations:** registry-driven command contracts, consistent structured results, useful per-capability rendering, and actionable doctor output.
3. **0.6 — Pi-native workflows:** compact prompts for understand, review, ship, orchestrate, extend, and observe tasks with clear approval boundaries.
4. **0.7 — Reliability:** recovery, offline behavior, retry policy, telemetry spool hardening, performance budgets, and security regression coverage.
5. **0.8 — Adoption:** fresh-profile installer checks, upgrade/migration tests, example repositories, short demos, and maintainer feedback.
6. **0.9 — Freeze:** API and schema freeze, compatibility audit, documentation freeze, release candidate, and external acceptance.
7. **1.0 — Stable:** publish only after every release gate above is evidenced from the exact signed tarball.

## Product boundary

Kujo Pi should make Kujo capabilities feel native inside Pi. It should not embed every Kujo implementation, start background services automatically, or turn Pi into a monolithic Kujo distribution. The plugin stays small; signed integrations remain independently installable and useful; task packs provide the coherent experience.
