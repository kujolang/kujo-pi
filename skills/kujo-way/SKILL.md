---
name: kujo-way
description: Use when working in a Kujo repository and you need the smallest reviewable path from context to checked changes.
---

# Kujo Way

Use the narrowest useful Kujo capability. Start with repository context, keep host effects explicit, prefer VM-first commands, and leave evidence that another person can inspect.

Suggested sequence:

1. Ask whether Scout or Scent would reduce uncertainty.
2. Check the relevant `.kujo` source before running it.
3. Use offline fixtures when provider access is not required.
4. Summarize changed files and verification artifacts before claiming completion.

Do not imply that this skill enforces permissions. Pi extensions and Kujo runtime flags remain responsible for actual execution boundaries.
