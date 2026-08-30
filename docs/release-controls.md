# Release controls

The repository uses protected npm and GitHub publication. The workflow verifies the exact tag on Linux, macOS, and Windows with Node 22 and 24, builds one tarball, generates a checksum and CycloneDX SBOM, creates GitHub build provenance, publishes that exact tarball to npm, and attaches all evidence to the GitHub release.

These external controls must remain enabled for every stable release.

## Dependency graph

Enable **Settings → Advanced Security → Dependency graph**. Pull-request dependency review is deliberately required and will fail closed until the repository dependency graph is enabled.

## GitHub environments

Create environments named exactly:

- `npm-release`
- `github-release`

Add designated release reviewers to both. Disable administrator bypass if that matches the organization policy. The workflow already assigns npm publication and GitHub release creation to these environments.

## Tag rules

Create a repository ruleset for `refs/tags/v*.*.*` that:

- restricts tag creation, update, and deletion to release maintainers;
- prevents force updates;
- requires the release workflow and CI matrix to pass;
- requires signed tags if the organization signing policy is established.

## npm trusted publisher

Configure `@kujolang/kujo-pi` to trust the `kujolang/kujo-pi` repository and `.github/workflows/release.yml`. The workflow uses GitHub OIDC and does not require a long-lived npm token.

## Stable release procedure

1. Confirm the dependency graph is enabled and dependency review passes on a pull request.
2. Confirm both GitHub environments have the intended reviewers.
3. Confirm the tag ruleset is active.
4. Confirm npm trusted publishing points to the exact repository and workflow.
5. Bump `package.json` and `package-lock.json` together.
6. Run `npm ci --ignore-scripts`, `npm test`, and `npm audit --omit=dev --audit-level=high`.
7. Create the protected version tag.
8. Approve the protected environments.
9. Verify the npm provenance, GitHub attestation, SBOM, checksum, tag, and package version all describe the same artifact.
10. Install the published package by exact version in a fresh Pi profile and run `kujo_doctor` before announcing it.

See the [production-readiness standard](production-readiness.md) for the evidence required to call a release production-ready.
