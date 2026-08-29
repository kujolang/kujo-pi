# Kujo Pi Production-Readiness Work List

This is the next-session list after the August 2026 repository review. Kujo Pi now has a clean source layout, explicit trusted entrypoints, project-trust enforcement, bounded subprocess and network behavior, SHA-pinned CI, a least-privilege release pipeline, package and documentation contracts, and an offline test gate.

That does not make any client integration universally enterprise-ready. The Pi host, Kujo tools, remote services, operating system, and organization policy remain separate trust and compatibility boundaries.

## Next priorities

| Rank | Work item | Type | Estimate | Acceptance criteria |
|---:|---|---|---:|---|
| 1 | Configure and rehearse npm trusted publishing | Release | 1 day | A protected test tag publishes the exact verified tarball with provenance; npm, tag, and GitHub release versions match. |
| 2 | Add protected GitHub release environments and tag rules | Governance | 1 day | npm and GitHub publication require designated reviewers; only approved actors can create or update release tags. |
| 3 | Add a signed integration registry | Security / onboarding | 3–5 days | Doctor can discover installed Kujo integrations from a versioned manifest with canonical paths, versions, capabilities, and checksums; environment variables remain an override. |
| 4 | Bind approvals to operation details | Security | 3–5 days | Pi approval records bind the canonical executable, entrypoint, workspace, revision, arguments, output root, and payload digest; headless approval has a documented equivalent. |
| 5 | Build a supported-platform matrix | Compatibility | 3–5 days | CI and release candidates pass on Linux, macOS, and Windows with Node 22 and 24 and the documented Pi peer range. |
| 6 | Test real Pi host lifecycle contracts | Integration | 3–5 days | Tests load the packaged extension through Pi, verify session activation reset, project trust, UI approval, cancellation, rendering, and session receipt persistence. |
| 7 | Add service contract fixtures | Network | 3–5 days | Local fixtures cover TLS policy, authorization failures, audience headers, redirects, retryable status codes, timeouts, cancellation, large bodies, and malformed responses. |
| 8 | Define versioned result and receipt schemas | Functionality | 2–4 days | Every adapter returns a documented schema version; receipts include stable operation IDs and artifact digests without raw output or secrets. |
| 9 | Add performance budgets | Performance | 2–4 days | Benchmarks enforce limits for startup work, Doctor latency, streaming memory, large output truncation, retry duration, and large-workspace path checks. |
| 10 | Add supply-chain attestations | Supply chain | 2–3 days | Releases include an SBOM, tarball checksum, provenance verification result, dependency review, and automated pull requests for pinned Action updates. |
| 11 | Improve first-run diagnostics | Onboarding | 2–3 days | Doctor reports one copy-ready fix per missing or incompatible dependency and distinguishes missing binary, missing entrypoint, unsupported version, untrusted project, and service-policy errors. |
| 12 | Publish capability-specific examples | Adoption | 3–5 days | Each tool has one small, reproducible example with expected output, side effects, trust requirements, cleanup, and a link to the Kujo language or canonical component. |

## Review questions for the next session

- Does Pi expose an approval token or event that can be bound to exact tool arguments?
- Can the Kujo CLI provide a signed machine-readable capability manifest and version negotiation command?
- Which Pi versions are intentionally supported before `1.0`, and how long will each range receive fixes?
- Which Windows path, process-group, and signal behaviors need platform-specific implementations?
- What external npm, GitHub environment, tag-protection, and trusted-publisher settings are already configured?
- Which metrics can remain local and opt-in while still proving reliability and performance?

## Exit standard

Do not call the package universally enterprise-ready. Call a release production-ready only when the repository tests, supported-platform matrix, live Pi contract suite, release rehearsal, provenance verification, and documented external controls all pass for the exact version being shipped.
