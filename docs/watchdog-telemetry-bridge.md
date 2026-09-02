# Send Pi lifecycle telemetry to Watchdog

Kujo Pi can emit metadata-only lifecycle telemetry for trusted projects. This
bridge is separate from the Watchdog model proxy: the proxy observes provider
requests, while the bridge observes Pi agent, turn, tool, shell-request, model,
and session lifecycle events.

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

Each metadata bundle is written atomically before delivery. If Watchdog is
unavailable, later Pi events and session shutdown retry the queued files.
Successful `2xx` intake removes a file. Permanent `4xx` rejections are retained
with a `.rejected` suffix for bounded local diagnosis.

Defaults:

| Variable | Default | Purpose |
|---|---:|---|
| `KUJO_PI_TELEMETRY_SPOOL_DIR` | `~/.pi/kujo/telemetry-spool` | Local spool root |
| `KUJO_PI_TELEMETRY_SPOOL_MAX_BYTES` | `5242880` | Maximum queued bytes per Watchdog origin |
| `KUJO_PI_TELEMETRY_SPOOL_MAX_FILES` | `2000` | Maximum queued bundles per origin |
| `KUJO_PI_TELEMETRY_TIMEOUT_MS` | `2000` | Per-delivery network timeout |

The spool directory is mode `0700`; salt and bundle files are mode `0600`.
Oldest queued bundles are removed first when a bound is exceeded. The spool is
partitioned by a one-way hash of the Watchdog origin.

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
