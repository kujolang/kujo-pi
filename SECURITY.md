# Security

Kujo Pi is a Pi extension. Installing it gives code in this repository the same local permissions as the Pi process, so review the source and pin a known Git revision when using it in a team or CI environment.

## Safety boundaries

- Startup is local-only and does not install Kujo, start daemons, or make network requests.
- Optional tools are inactive until enabled for a session.
- Every subprocess, network call, and project write refuses to run unless Pi reports the project as trusted.
- Interactive tools that execute privileged workflows or generate artifacts always use Pi's approval UI. Trusted headless callers may supply an explicit confirmation flag.
- Approval records bind a unique operation ID to the canonical command, entrypoint, workspace, Git revision, output root, and argument/payload digests. Raw arguments and payloads are not persisted in approval entries.
- The packaged integration registry is Ed25519-signed. Registry-discovered entrypoints must match their pinned SHA-256 checksum or they are rejected; explicit binary and entrypoint overrides remain an operator trust decision.
- Kujo workflow entrypoints must be configured as absolute existing files. The extension does not execute relative fallback entrypoints from the open repository.
- Workspace paths are contained before being passed to Kujo commands.
- Command output is bounded before it is returned to the model.
- Network attempts have bounded timeouts, reject redirects, and keep request paths on the configured origin.
- Watchdog and Leash are disabled until their URLs are configured. Leash tokens are read from the environment and are never returned in tool output.
- Watchdog lifecycle telemetry is separately disabled until `KUJO_WATCHDOG_TELEMETRY=metadata` is set in a trusted project. Its durable spool stores allowlisted metadata only, never prompts, tool arguments/results, shell text/output, file paths/content, or credentials.
- Dynamic correlation headers are restricted to the exact Pi provider ID configured by `KUJO_WATCHDOG_PROXY_PROVIDER`, preventing direct providers from receiving local trace metadata.
- Optional receipts use a versioned schema, hash the workspace identity, and contain operation and artifact digests rather than raw command output or file contents.
- Release workflows bind tags to package versions, require release commits to descend from `main`, pin actions to commit SHAs, and separate test, npm, and GitHub publication permissions.

## Reporting

Do not open a public issue for an active vulnerability. Use the repository's [private GitHub security advisory form](https://github.com/kujolang/kujo-pi/security/advisories/new), including reproduction steps, affected revision, and impact. Please do not include credentials or personal data in reports.
