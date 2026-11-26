# Security

Kujo Pi is a Pi extension. Installing it gives code in this repository the same local permissions as the Pi process, so review the source and pin a known Git revision when using it in a team or CI environment.

## Safety boundaries

- Startup is local-only and does not install Kujo, start daemons, or make network requests.
- Optional tools are inactive until enabled for a session.
- Every subprocess, network call, and project write refuses to run unless Pi reports the project as trusted.
- Interactive tools that execute privileged workflows or generate artifacts use Pi's approval UI, including Scout reports and RunLedger writes. Trusted headless callers may supply an explicit confirmation flag.
- Approval records bind a unique operation ID to the canonical command, entrypoint, workspace, Git revision, output root, and argument/payload digests. Raw arguments and payloads are not persisted in approval entries.
- The packaged integration registry is Ed25519-signed. Registry-discovered entrypoints must match their pinned SHA-256 checksum. Treat explicit binary and entrypoint overrides as operator-trusted code.
- Kujo workflow entrypoints must be configured as absolute existing files. The extension does not execute relative fallback entrypoints from the open repository.
- Workspace paths are contained before being passed to Kujo commands.
- Commands limit captured output during execution. The extension supervises its process groups on POSIX and uses the system process-tree utility for Windows cancellation.
- Canonical Kujo commands isolate imports from the project working directory and inherited module directories. Managed integrations use the signed cohort's verified package roots. Each approved command rechecks the target, arguments, workspace and Git revision before execution.
- Network attempts have bounded timeouts, reject redirects, and keep request paths on the configured origin.
- Watchdog and Leash require explicit URL configuration. Service requests read credentials from the environment and withhold responses that echo them.
- Watchdog lifecycle telemetry requires `KUJO_WATCHDOG_TELEMETRY=metadata` in a trusted project. Replay accepts bounded, regular, user-owned metadata files and quarantines rejected entries locally. The recorded fields cover lifecycle identifiers, timing, counts and outcomes.
- Dynamic correlation headers are restricted to the exact Pi provider ID configured by `KUJO_WATCHDOG_PROXY_PROVIDER`, preventing direct providers from receiving local trace metadata.
- Optional receipts use a versioned schema, hash the workspace identity, and contain operation and artifact digests rather than raw command output or file contents.
- Release workflows bind tags to package versions, require release commits to descend from `main`, pin actions to commit SHAs, and separate test, npm, and GitHub publication permissions.

## Reporting

Do not open a public issue for an active vulnerability. Use the repository's [private GitHub security advisory form](https://github.com/kujolang/kujo-pi/security/advisories/new), including reproduction steps, affected revision, and impact. Please do not include credentials or personal data in reports.
