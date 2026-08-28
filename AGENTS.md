# Kujo Pi agent instructions

Kujo Pi is a small, opt-in Pi client integration. Preserve the quiet-by-default boundary: no automatic background work, publishing, network calls, or mutations.

## Source of truth

- `extensions/kujo.ts` owns Pi tool and command behavior.
- `skills/` owns reusable agent guidance.
- `README.md` owns the user-facing installation and security contract.
- `tests/release-readiness.sh` owns the offline release-readiness smoke gate.

## Verification

Run `npm test` after changes. Keep commands argument-array based and preserve explicit side-effect descriptions.
