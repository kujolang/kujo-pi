# Kujo Pi v1 release-candidate acceptance

The stable release needs feedback from Pi developers who did not build Kujo Pi. Use the same release-candidate version for every tester and record only redacted results.

## Tester path

1. Use a fresh Pi profile and a disposable or clean repository.
2. Install the release candidate by its exact npm version.
3. Start Pi, trust the test repository, and run `/kujo setup`.
4. Run `/kujo packs` and enable one pack that matches a real task.
5. Complete that task or reach a clear dependency remediation.
6. Restart the same session and confirm the enabled pack is still active.
7. Start a new session and confirm it returns to the quiet core tool set.
8. Run `kujo_doctor` and confirm its advice is specific enough to follow.
9. Uninstall or roll back without editing Pi state by hand.

## Feedback to record

- Pi, Node, operating-system, and Kujo Pi versions;
- global or project-local install;
- time from install to first useful Kujo result;
- chosen pack and outcome;
- any warning, confusing term, dead end, or manual workaround;
- whether the tester would keep the package installed;
- release blockers, with secrets and project content removed.

Acceptance requires at least two independent Pi developers on two operating systems. Both must complete the install and first-use path. No high-severity security issue, data-loss risk, install failure, or undocumented manual repair may remain open. Minor wording or optional-integration requests may move to the post-1.0 backlog.

Maintainers run the exact published candidate through the automated fresh-profile check:

```bash
KUJO_PI_PACKAGE_SOURCE='npm:@kujolang/kujo-pi@<candidate-version>' npm run test:fresh-profile
```

The final 1.0 release repeats that check by package name after npm publication.
