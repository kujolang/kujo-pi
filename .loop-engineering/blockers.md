# External Blockers

blockers:
  - id: remote-ssh-unavailable
    command: "git push origin HEAD"
    evidence: "[main (root-commit) e36132f] Loop engineering: Build and verify the first opt-in Kujo Pi package with curated skills, safe CLI bridge tools, and reviewable documentation.
 19 files changed, 348 insertions(+)
 create mode 100644 .gitignore
 create mode 100644 .loop-engineering/SUMMARY.md
 create mode 100644 .loop-engineering/blockers.md
 create mode 100644 .loop-engineering/iterations/001/action.md
 create mode 100644 .loop-engineering/iterations/001/context.md
 create mode 100644 .loop-engineeri"
    status: external-blocked
    next_action: "Restore SSH/Git remote access."
