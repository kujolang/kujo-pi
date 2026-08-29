# Capability examples

These examples assume Pi is running in a trusted disposable repository. Optional tools must be enabled first. Expected results include `schemaVersion: "kujo.pi.result.v1"`.

## Discovery and diagnostics

### `kujo_tools`

```text
Use kujo_tools to list the available integrations.
```

Expected: registered, active, optional, and unknown tool names. Side effects: none unless `enable` is requested. Cleanup: none.

### `kujo_doctor`

```text
Use kujo_doctor and give me each copy-ready remediation.
```

Expected: signed-registry status, discovered paths and checksums, compatibility, service state, and fixes. Side effects: bounded version probes. Cleanup: none.

### `kujo_status`

```text
Use kujo_status to verify the Kujo runtime.
```

Expected: Kujo version output and `success`. Side effects: read-only process. Cleanup: none.

### `kujo_check`

```text
Use kujo_check on main.kujo.
```

Expected: validation result. Side effects: read-only. Cleanup: none.

## Repository workflows

### `kujo_scout`

```text
/kujo enable kujo_scout
Use kujo_scout in quick mode on this repository.
```

Expected: repository intelligence output. Side effects: Scout may write its documented report. Cleanup: review or remove the generated Scout output.

### `kujo_scent`

```text
/kujo enable kujo_scent
Create a dry-run Scent pack for understanding the authentication flow.
```

Expected: scoped context and provenance metadata. Side effects: dry-run by default. Cleanup: none.

### `kujo_review_changes`

```text
/kujo enable kujo_review_changes
Create a PatchBrief handoff for the current changes.
```

Expected: review artifact information. Side effects: may write a PatchBrief artifact. Cleanup: review or remove that artifact.

### `kujo_changebucket`

```text
/kujo enable kujo_changebucket
Measure the current change footprint.
```

Expected: file, churn, category, and risk counts. Side effects: report generation only. Cleanup: remove an unwanted report.

### `kujo_shipcheck`

```text
/kujo enable kujo_shipcheck
Run ShipCheck after showing me the bound operation and asking for approval.
```

Expected: an approval dialog followed by release-readiness results. Side effects: executes project checks. Cleanup: tool-specific generated reports only.

### `kujo_mcp_make`

```text
/kujo enable kujo_mcp_make
Generate an MCP profile under .kujo/pi/mcp after approval.
```

Expected: an approval binding and MCP artifacts. Side effects: writes `.kujo/pi/mcp`. Cleanup: remove that directory if the scaffold is not adopted.

### `kujo_dispatch_run`

```text
/kujo enable kujo_dispatch_run
Run a research-report Dispatch workflow into .kujo/pi/dispatch after approval.
```

Expected: progress, resumable state, and output artifacts. Side effects: writes `.kujo/pi/dispatch`. Cleanup: archive or remove that run directory.

### `kujo_agents_smoke`

```text
/kujo enable kujo_agents_smoke
Run the offline Agents SDK fixtures after approval.
```

Expected: deterministic fixture results. Side effects: executes local fixtures. Cleanup: remove fixture output if the configured runner retains it.

### `kujo_runledger`

```text
/kujo enable kujo_runledger
Start a RunLedger receipt for this Pi task.
```

Expected: a run ID. Side effects: writes RunLedger state. Cleanup: finish the run; use RunLedger's reviewed cleanup command only when intended.

### `kujo_rag_query`

```text
/kujo enable kujo_rag_query
Query the local RAG index for the retry policy and include citations.
```

Expected: cited local results. Side effects: read-only query. Cleanup: none.

## Optional services

### `kujo_watchdog`

```text
/kujo enable kujo_watchdog
Read the configured Watchdog health endpoint.
```

Expected: bounded service response. Side effects: one configured-origin network request. Cleanup: none.

### `kujo_leash_approval`

```text
/kujo enable kujo_leash_approval
Send a disposable approval fixture to Leash after showing the bound payload digest.
```

Expected: an approval dialog and bounded service response. Side effects: writes an event to the configured Leash service. Cleanup: use only a disposable fixture environment.
