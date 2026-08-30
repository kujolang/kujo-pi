# Kujo Pi post-1.0 roadmap

Kujo Pi 1.0 establishes the stable capability contract, task packs, onboarding path, safety boundary, and release discipline. Post-1.0 work should deepen those foundations without making normal Pi sessions noisy or coupling the package to every Kujo implementation.

## Priorities

### Adoption and usability

- Measure time from installation to first useful result and remove avoidable setup steps.
- Add short, task-based demos for each pack and keep Doctor remediation copy-ready.
- Improve package discovery and examples for developers who know Pi but not Kujo.
- Gather upgrade, retention, and failure-recovery feedback from real projects.

### Reliability and efficiency

- Keep startup, Doctor, telemetry delivery, and result rendering within explicit performance budgets.
- Expand minimum/latest Pi compatibility canaries when the host contract changes.
- Add regression fixtures for every production failure mode before fixing it.
- Reduce repeated subprocess probes and redundant context without introducing hidden background work.

### Universal Kujo workflows

- Add broadly useful Kujo capabilities through task-oriented packs, beginning with deterministic specification, evaluation, architecture-boundary, drift, and failure-evidence workflows.
- Prefer a stable capability adapter over one bespoke Pi tool per Kujo repository.
- Let independently installed Kujo tools advertise compatible capabilities and versions through the signed registry.
- Keep optional integrations independently useful outside Pi.

### Local observability

- Improve the complete-run Watchdog view across model, tool, shell, approval, receipt, and persistence spans.
- Reuse the metadata-only telemetry contract across other Kujo harnesses.
- Keep local spooling bounded and exporters disabled until explicitly configured.

### Maintainer and organization controls

- Add a second release maintainer before disabling environment self-review.
- Publish a clear deprecation calendar for every 1.x contract change.
- Expand live integration testing for operator-selected Kujo services without adding secrets to default CI.
- Continue independent security review of approval binding, path containment, telemetry redaction, and release provenance.

## Selection rule

A roadmap item belongs in Kujo Pi only when it improves a common Pi task, preserves the quiet core experience, has a deterministic compatibility contract, and can fail without destabilizing Pi. Niche or stateful implementation logic belongs in the canonical Kujo tool, not in this package.

See the [v1 release standard](v1-roadmap.md) for compatibility guarantees and the [production-readiness standard](production-readiness.md) for release evidence.
