# Kujo Pi v1 acceptance record

Kujo Pi 1.0 was accepted for stable release on 2026-08-30 after repository, supply-chain, compatibility, and fresh-install verification of `1.0.0-rc.1`.

## Accepted user path

1. Install the exact package in a fresh Pi profile and disposable repository.
2. Start Pi, trust the repository, and run `/kujo setup`.
3. Run `/kujo packs` and enable a pack for the current task.
4. Complete the task or reach a specific dependency remediation.
5. Reopen the persisted session and confirm its enabled pack returns.
6. Start a new session and confirm it uses the quiet core tool set.
7. Run `kujo_doctor` and confirm every missing dependency has a useful remediation.
8. Uninstall without editing Pi state by hand.

## Evidence

- The full offline release-readiness suite, type checking, npm audit, and security review passed.
- CI passed on Linux, macOS, and Windows with Node 22 and 24.
- Pi compatibility tests passed against the minimum supported and newest published host versions.
- The release-candidate npm package had a verified registry signature and SLSA provenance and matched the GitHub release artifact checksum.
- The exact published candidate passed the fresh-profile test.
- Ephemeral Ubuntu 24.04 and Fedora 43 VMs passed install, setup, packs, Doctor, persisted-session restoration, quiet new-session defaults, and uninstall with Pi 0.84.3 and 0.84.4 respectively.
- The project owner completed final verification and approved promotion to stable 1.0.

## Stable publication check

After `@kujolang/kujo-pi@1.0.0` is published, maintainers repeat the exact-package check:

```bash
KUJO_PI_PACKAGE_SOURCE='npm:@kujolang/kujo-pi@1.0.0' npm run test:fresh-profile
```

The npm `latest` tag, protected Git tag, GitHub release, checksum, SBOM, provenance, and package version must all resolve to 1.0.0 before announcing the stable release.
