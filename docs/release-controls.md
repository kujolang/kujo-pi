# Release controls

The repository release workflow is ready for protected npm and GitHub publication. It verifies the exact tag on Linux, macOS, and Windows with Node 22 and 24, builds one tarball, generates a checksum and CycloneDX SBOM, creates GitHub build provenance, publishes that exact tarball to npm, and attaches all evidence to the GitHub release.

Before creating the first version tag, configure these external controls.

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

## Final release rehearsal

1. Confirm both GitHub environments have the intended reviewers.
2. Confirm the tag ruleset is active.
3. Confirm npm trusted publishing points to the exact repository and workflow.
4. Bump `package.json` and `package-lock.json` together.
5. Run `npm ci --ignore-scripts`, `npm test`, and `npm audit --omit=dev --audit-level=high`.
6. Create the protected version tag.
7. Approve the protected environments.
8. Verify the npm provenance, GitHub attestation, SBOM, checksum, tag, and package version all describe the same artifact.
9. Install the published package in a fresh Pi profile and run `kujo_doctor` before promotion.
