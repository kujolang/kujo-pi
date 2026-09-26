# Result, approval, and receipt contracts

Every Kujo Pi tool result includes `schemaVersion: "kujo.pi.result.v1"` and an operation ID when execution began. The JSON Schema is `schemas/result-v1.schema.json`.

Approval-gated operations create a `kujo-approval` Pi session entry using `kujo.pi.approval.v1`. The binding records:

- a unique operation ID;
- canonical executable and configured entrypoint;
- workspace and Git revision when available;
- output root;
- SHA-256 digests of arguments and payload;
- whether approval came from the interactive Pi UI or the trusted headless `confirm: true` contract.

Raw task text, tool output, credentials, and file contents are not persisted in the approval entry. The interactive dialog shows the operation, command, workspace, revision, output root, and argument digest before execution.

When `KUJO_PI_RECEIPTS=1`, invocation receipts use `kujo.pi.receipt.v1`. Receipts contain the matching operation ID, hashed workspace identity, status, duration, revision, argument digest, and a bounded artifact-tree digest when the operation has an output root. They do not contain raw command output or secrets. See `schemas/approval-v1.schema.json` and `schemas/receipt-v1.schema.json`.

In a headless Pi session, `confirm: true` is accepted only after the existing trusted-project gate passes. It binds the same operation descriptor and records `approvalSource: "trusted_headless_confirm"`.

Ability discovery and execution return `ok: false`, `status: "invalid_response"` when an HTTP-success response cannot be parsed as bounded JSON (including oversized responses). The HTTP code and nested diagnostic body remain available. Failed HTTP statuses retain `remote_rejected`.

## Receipt failures and artifact limits

Receipt bookkeeping does not change the completed operation's `ok`, `status`, exit code or operation ID. If persistence fails, the tool returns an additive `receiptWarning` and the UI shows a warning. Do not retry an operation solely to repair its receipt: the side effect may already have succeeded. A failed artifact snapshot still allows a receipt with `artifactDigest: null` and `artifactDigestError`. Approved network failures retain the original approval operation ID in their result and receipt. Streaming command results include `durationMs`.

Artifact digests keep the v1 byte ordering for stable files. Snapshots cover at most 128 files and 10,000,000 content bytes, with a 1 MiB read buffer. Traversal enumerates at most 4,096 entries (including the root) and fails explicitly beyond that bound rather than implying a complete snapshot. The internal `digestArtifacts` helper accepts a fourth positive integer argument to deliberately adjust that traversal budget. File, byte and traversal budgets must all be positive safe integers. Symlinks are skipped; short reads are completed, and premature EOF is reported. These remain bounded diagnostic summaries, not full-tree integrity proofs. Directory names are streamed into the bounded budget before sorting. A wide directory that exceeds the budget now produces an explicit digest warning even if the 128-file limit could have selected a smaller subset; no arbitrary filesystem-order subset is hashed.
