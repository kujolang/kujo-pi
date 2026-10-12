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

The initial signing key was not retained. On 2026-10-12 the key was rotated in a dedicated commit, re-signing the unchanged registry before updating integration metadata. The replacement Ed25519 private key is held outside the repository in the release operator's protected local key store; it is never included in npm packages or CI artifacts. Maintainers must back up that key through their private key-custody process.

Public-key file SHA-256 fingerprints:

- Retired: `e570d4728f941a59fbce25e41ed8424f9d75293de62fecf3477d447da2226795`
- Current: `b0529ce9c508ebb43030f52ee01edde053f8efb3476252d32fba728ac4f16729`

This is an explicit trust-root rotation, not a signature from the unavailable old key. Review this commit separately from the following release-cohort update. Later registry updates must be signed with the protected current key over the canonical JSON representation from `src/contracts.mjs`; run `node tests/registry-contract.mjs` after signing.

If the signing key must rotate, review the new public key as a separate security-sensitive change. Do not combine an unexplained key rotation with integration metadata changes.

Executable checksums read every byte through a reusable 64 KiB buffer. Run `node scripts/benchmark-registry.mjs` from the checkout root for five isolated-process measurements using a 64 MiB fixture; this opt-in benchmark reports elapsed time, peak RSS, and the checksum without a machine-specific timing gate.

## Discovery recovery and precedence

`/kujo setup` and `kujo_doctor` refresh local discovery, so a repaired or newly installed integration can be detected without restarting Pi. Discovery does not install tools or execute workflows. An invalid registry signature still rejects the whole manifest. An unavailable executable or invalid entrypoint instead marks only that integration unavailable, with an `error` detail; other integrations remain usable.

Selection order matches execution: explicit `KUJO_*_BIN`, explicit `KUJO_*_ENTRY`, the command on `PATH`, then a matching signed-registry entrypoint. A broken explicit override does not silently select another target. RunLedger uses this same selection path: entrypoints run through `kujo run <entrypoint> -- <arguments>`, while binaries keep their existing CLI arguments. Registry, signature and public-key overrides must be absolute before canonicalization.
