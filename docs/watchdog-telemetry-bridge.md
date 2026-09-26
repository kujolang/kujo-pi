# Send Pi lifecycle telemetry to Watchdog

Kujo Pi can emit metadata-only lifecycle telemetry for trusted projects. This
bridge is separate from the Watchdog model proxy: the proxy observes provider
requests, while the bridge observes Pi agent, turn, tool, shell-request, model,
and session lifecycle events.

Entering an untrusted session revokes the active run and correlation headers, even when Pi reuses the bridge. Previously queued trusted-session batches remain eligible for delivery.

The bridge is disabled unless all of these conditions are true:

- `KUJO_WATCHDOG_TELEMETRY=metadata` is set;
- `KUJO_WATCHDOG_URL` is configured;
- Pi reports the current project as trusted.

## Enable metadata-only telemetry

```bash
export KUJO_WATCHDOG_URL=http://127.0.0.1:7700
export KUJO_WATCHDOG_TELEMETRY=metadata
```

If Watchdog uses API token authentication:

```bash
export KUJO_WATCHDOG_TOKEN='load-from-your-secret-manager'
export KUJO_WATCHDOG_AUDIENCE=kujo-watchdog
```

Kujo Pi posts metadata-only `watchdog.telemetry.v2` batches to
`/telemetry/v2/batches`. It never stores the Watchdog token in the spool. The
stable Pi lifecycle vocabulary is preserved as source provenance and
namespaced attributes while Watchdog owns canonical persistence, redaction,
retention, and export.

## Correlate proxied model requests

When Pi uses the Watchdog-backed provider from
[the proxy guide](watchdog-pi-proxy.md), keep its provider ID as
`kujo-watchdog`, or configure the exact custom ID:

```bash
export KUJO_WATCHDOG_PROXY_PROVIDER=kujo-watchdog
```

Kujo Pi then adds session, project-hash, trace, correlation, and parent-span
headers only to that provider. It does not add those headers to direct provider
traffic. Watchdog attaches the proxied model span to the active Pi turn, giving
the dashboard one run containing workflow, model, tool, and shell spans.

## Durable local spool

Accepted metadata bundles are written atomically before delivery. If Watchdog is
unavailable, later Pi events and session shutdown retry the queued files.
Successful `2xx` intake removes a file. Permanent `4xx` rejections are retained
with a `.rejected` suffix for bounded local diagnosis.

Defaults:

| Variable | Default | Purpose |
|---|---:|---|
| `KUJO_PI_TELEMETRY_SPOOL_DIR` | `~/.pi/kujo/telemetry-spool` | Local spool root |
| `KUJO_PI_TELEMETRY_SPOOL_MAX_BYTES` | `5242880` | Committed bytes and per-process pending UTF-8 bytes |
| `KUJO_PI_TELEMETRY_SPOOL_MAX_FILES` | `2000` | Committed bundles and per-process pending bundles |
| `KUJO_PI_TELEMETRY_TIMEOUT_MS` | `2000` | Per-delivery network timeout |

The spool directory is mode `0700`; salt and bundle files are mode `0600`.
Oldest committed queued bundles are removed first when a bound is exceeded.
The same limits independently cap each process's pending write queue. When
that queue is full, the newest batch is rejected immediately. This best-effort
telemetry policy keeps lifecycle handlers nonblocking; it does not retry or
claim persistence for rejected batches. `kujo_doctor` exposes cumulative
`droppedBatches` and `writeFailures`, current `pendingBatches`/`pendingBytes`,
and successful local `recoveredTemporaries` cleanup calls. Loss counters remain
visible until the Pi process restarts and produce a Doctor remediation.

At initialization, recovery removes recognized temporary files only when their
owning local PID no longer exists. Both salt and bundle writes use random,
owner-scoped temporary names. Live or reused PIDs, permission-denied/uncertain
liveness, foreign host scopes, symlinks, and legacy names are preserved. Linux
scope includes boot ID and PID namespace; if `/proc` identity is unavailable,
writes continue with unowned names and automatic recovery is disabled. Recovery
never promotes partial data to a committed bundle. Normal failures clean up
their own temporary files, including salt write failures.

Use a local spool, not a network filesystem shared across hosts. Hostnames must
remain distinct for separate machines. Legacy/unowned/foreign-scope temporary
files (including older Linux boots) need manual removal after all relevant
writers stop. Recovery occurs on the next spool initialization; committed-byte
limits do not include live temporary files. Concurrent cleanup counts can
overlap across processes when a filesystem acknowledges both unlink calls.
Concurrent delivery is at-least-once; stable batch IDs allow the receiver to
deduplicate replays. The spool is partitioned by a one-way hash of the configured
Watchdog URL.


## Privacy contract

Metadata mode uses allowlisted fields. It includes IDs, timestamps, durations,
status, provider/model names, token counts, tool names, a salted workspace hash,
and a bounded shell-command classification.

It does not include:

- prompts or response bodies;
- tool arguments, partial results, or result bodies;
- shell command text or shell output;
- file paths or file contents;
- API keys, bearer tokens, or service credentials.

`user_bash` exposes only a pre-execution event in Pi. Kujo Pi therefore records
`shell_requested` with a classification, not an invented duration or outcome.
Agent runs close on `agent_settled`, because `agent_end` may still be followed
by an automatic retry, compaction, or queued continuation.

Kujo Pi does not implement content capture. If an operator explicitly enables
Watchdog proxy summaries with `WDG_CONTENT_CAPTURE_MODE=summaries`, that is a
separate Watchdog persistence policy outside the bridge's metadata payload.

## Blind spots

The bridge provides near-complete Pi application and agent lifecycle telemetry,
not operating-system tracing. It cannot observe a hard process crash, commands
run outside Pi, provider internals, or failures that occur before Pi emits an
event. A hard crash may leave the last trace in a running state until retention
or later operational review handles it.
