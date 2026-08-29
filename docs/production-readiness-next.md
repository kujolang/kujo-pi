# Kujo Pi Production-Readiness Work List

This is the next-session list after the August 2026 repository review. Kujo Pi now has a clean source layout, explicit trusted entrypoints, project-trust enforcement, bounded subprocess and network behavior, SHA-pinned CI, a least-privilege release pipeline, package and documentation contracts, and an offline test gate.

That does not make any client integration universally enterprise-ready. The Pi host, Kujo tools, remote services, operating system, and organization policy remain separate trust and compatibility boundaries.

## Readiness status

| Rank | Work item | Type | Estimate | Acceptance criteria |
|---:|---|---|---:|---|
| 1 | Configure and rehearse npm trusted publishing | External release | pending owner action | A protected version tag publishes the exact verified tarball with provenance; npm, tag, and GitHub release versions match. |
| 2 | Activate protected GitHub environments and tag rules | External governance | configured; solo-owner review policy | `npm-release` and `github-release` require owner approval and accept only `v*.*.*` tags; the active release-tag ruleset restricts creation, updates, deletion, and force pushes. Self-review remains allowed until a second maintainer is designated. |
| 3 | Signed integration registry | Security / onboarding | implemented | Doctor verifies an Ed25519-signed versioned manifest and registry-discovered entrypoint checksums; environment overrides retain precedence. |
| 4 | Approval detail binding | Security | implemented | Approval entries bind operation ID, executable, entrypoint, workspace, revision, argument and payload digests, and output root. |
| 5 | Supported-platform matrix | Compatibility | implemented and passing | CI and release workflows cover Linux, macOS, and Windows with Node 22 and 24; main CI run `33272349037` passed all six cells. |
| 6 | Real Pi host lifecycle contracts | Integration | implemented | The default gate packs the package, loads it through Pi RPC, and combines host lifecycle coverage with trust, approval, cancellation, rendering, and receipt contracts. |
| 7 | Service contract fixtures | Network | implemented | Offline fixtures cover TLS policy, authorization, audience, redirects, retries, timeouts, cancellation, large bodies, and malformed responses. |
| 8 | Versioned result and receipt schemas | Functionality | implemented | Results, approvals, and receipts have documented v1 schemas, stable operation IDs, and artifact digests without raw output or secrets. |
| 9 | Performance budgets | Performance | implemented | The default gate covers registry startup, large-workspace checks, output truncation, and retry duration. |
| 10 | Supply-chain attestations | Supply chain | implemented; release run required | Releases produce a checksum, CycloneDX SBOM, verification record, and GitHub provenance; Dependency graph is enabled and all four initial Dependabot pull-request matrices pass dependency review. |
| 11 | First-run diagnostics | Onboarding | implemented | Doctor distinguishes configuration states, verifies registry integrity, reports checksums, and returns copy-ready remediations. |
| 12 | Capability-specific examples | Adoption | implemented | Every tool has a reproducible example with expected behavior, side effects, and cleanup guidance. |

## External finalization questions

- Should a second maintainer be added so environment self-review can be disabled?
- Has npm trusted publishing been bound to this repository and release workflow?
- Did the first remote six-cell platform matrix and protected release rehearsal pass for the exact version?

## Exit standard

Do not call the package universally enterprise-ready. Call a release production-ready only when the repository tests, remote supported-platform matrix, packaged Pi host suite, protected release rehearsal, npm provenance verification, and documented external controls all pass for the exact version being shipped. See [release controls](release-controls.md).
