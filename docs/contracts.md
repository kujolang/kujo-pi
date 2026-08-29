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
