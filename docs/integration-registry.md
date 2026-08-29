# Signed integration registry

Kujo Pi ships `integrations/registry.v1.json` with an Ed25519 detached signature and pinned public key. The registry maps Kujo capabilities to standalone commands, environment overrides, canonical ecosystem entrypoints, source revisions, and SHA-256 checksums.

Set one environment variable to let Doctor discover a local Kujo ecosystem checkout:

```bash
export KUJO_ECOSYSTEM_ROOT=/absolute/path/to/kujo-repos
```

Doctor verifies the registry signature before using it. For registry-discovered entrypoints, it also verifies the file checksum before reporting the integration as available. A mismatched file fails closed. Standalone commands found on `PATH` and explicit environment overrides are reported with their actual SHA-256 digest so operators can compare them with their own release policy.

Explicit overrides retain precedence:

```bash
export KUJO_SCOUT_BIN=/absolute/path/to/scout
export KUJO_SCENT_ENTRY=/absolute/path/to/scent.kujo
```

Organizations may provide another signed registry:

```bash
export KUJO_INTEGRATION_REGISTRY=/absolute/path/to/registry.json
export KUJO_INTEGRATION_REGISTRY_SIGNATURE=/absolute/path/to/registry.json.sig
export KUJO_INTEGRATION_REGISTRY_PUBLIC_KEY=/absolute/path/to/trusted-registry-key.pem
```

All three paths must be absolute. Supplying another public key is an explicit trust decision by the operator; Kujo Pi does not fetch registry keys or manifests from the network.

## Registry updates and key rotation

The committed private signing key is intentionally not present in this repository. Update the manifest only through the release owner that controls the signing key. Sign the canonical JSON representation used by `src/contracts.mjs`, replace the detached signature, and run `node tests/registry-contract.mjs`.

If the signing key must rotate, review the new public key as a separate security-sensitive change. Do not combine an unexplained key rotation with integration metadata changes.
