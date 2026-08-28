---
name: kujo-review
description: Use when reviewing implementation changes and you need concise, evidence-producing Kujo reports.
---

# Kujo Review

Use the `kujo_review_changes` tool for a structured PatchBrief handoff. Follow it with the repository's relevant tests and, when the change is broad, a ChangeBucket report.

Report:

- what changed;
- what was checked;
- artifact paths;
- unresolved risks or external blockers.

Never claim a release gate passed unless the actual gate command ran successfully.
