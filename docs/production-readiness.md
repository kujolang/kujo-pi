# Production-readiness standard

Kujo Pi 1.x is production-ready within its documented boundary as a local Pi client integration. The Pi host, installed Kujo tools, remote services, operating system, and organization policy remain separate trust and compatibility boundaries.

## Required evidence

A release is ready only when all of the following describe the exact version being shipped:

- the offline release-readiness suite, type checking, package contract, and npm audit pass;
- the packed extension loads through a real Pi RPC host;
- fresh-profile installation, setup, packs, Doctor, session restoration, new-session defaults, and uninstall pass;
- CI passes on Linux, macOS, and Windows with supported Node versions;
- compatibility canaries pass against the minimum and newest supported Pi releases;
- the package version, protected Git tag, npm version, GitHub release, checksum, SBOM, and provenance agree;
- npm trusted publishing and the protected `npm-release` and `github-release` environments are active;
- no unresolved high-severity security issue, data-loss risk, install failure, or undocumented manual repair remains.

## Kujo Pi 1.0 evidence

Version 1.0.0 completed the repository, release-artifact, security, recovery, privacy, and performance gates. The exact 1.0 release candidate also passed ephemeral acceptance on Ubuntu 24.04 with Pi 0.84.3 and Fedora 43 with Pi 0.84.4, including provenance, Doctor remediation, persisted pack restoration, quiet new-session defaults, and clean uninstall. The project owner accepted the candidate for stable release on 2026-08-30.

## Operational boundary

Do not describe Kujo Pi as a universal enterprise platform. Describe it as a production-ready, local-first Pi integration whose optional capabilities remain independently installed, explicitly configured, and quiet until enabled.

See the [release controls](release-controls.md), [compatibility policy](compatibility.md), [support policy](support.md), and [v1 acceptance record](v1-acceptance.md).
