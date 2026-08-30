# Support policy

## Supported releases

The latest 1.x minor release receives bug fixes. The previous minor release receives critical security fixes for 90 days after the next minor release ships. Prereleases receive no support commitment and may change before the stable release.

Before reporting a problem, update to the latest stable Kujo Pi and run `/kujo setup` plus `kujo_doctor`. Include the Kujo Pi version, Pi version, Node version, operating system, failing capability, and redacted Doctor result. Do not include API keys, tokens, prompts, file contents, or private command output.

- Report reproducible bugs through [GitHub Issues](https://github.com/kujolang/kujo-pi/issues).
- Report vulnerabilities through the private process in [SECURITY.md](../SECURITY.md).

## Known limits

Kujo Pi cannot guarantee the behavior of Pi providers, external Kujo tools, remote services, the operating system, or commands run outside Pi. It does not install the Kujo runtime, start daemons, provide tenant isolation, pin service certificates, or replace organization policy.

Lifecycle telemetry is near-complete application telemetry, not complete system telemetry. It cannot record events lost in a process crash, provider internals, OS activity, or work outside Pi. Content capture stays off unless a user explicitly enables it.

Pi extensions run with the user's system permissions. Project trust, Kujo Pi approval gates, and service policy reduce risk but do not create a sandbox.
