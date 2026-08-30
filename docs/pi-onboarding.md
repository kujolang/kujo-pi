# Kujo Pi onboarding guide

Kujo Pi adds optional Kujo tools to [Pi](https://pi.dev/). It gives Pi a local-first way to inspect repositories, prepare agent context, review changes, run guarded checks, and connect to Kujo services when you choose to configure them.

It does not replace Pi, install the Kujo runtime, start background daemons, or contact a service during startup.

## Is it usable today?

Yes. Kujo Pi 1.0 is the stable line within its documented client-integration boundary. Stable releases are published on npm with provenance and matching GitHub release evidence.

Kujo Pi is a thin integration layer. It is not a guarantee that every Kujo component is installed, configured, or compatible with every organization. Use `kujo_doctor` to inspect the current environment.

## What it adds to Pi

| Tool | What it helps with | Default behavior |
|---|---|---|
| `kujo_tools` | Discover and enable Kujo integrations | Active |
| `kujo_doctor` | Check the CLI, optional binaries, entrypoints, versions, and service configuration | Active; read-only |
| `kujo_status` | Confirm that the Kujo CLI is available | Active; read-only |
| `kujo_check` | Validate a Kujo source file | Active; read-only |
| `kujo_scout` | Map a repository's structure, dependencies, routes, and risks | Opt-in |
| `kujo_scent` | Build a scoped, provenance-aware context pack for an agent task | Opt-in; dry-run |
| `kujo_review_changes` | Create a PatchBrief handoff for current changes | Opt-in |
| `kujo_changebucket` | Measure change size, risk, and blast radius | Opt-in |
| `kujo_shipcheck` | Run release-readiness checks | Opt-in; approval required |
| `kujo_mcp_make` | Generate a guarded, repository-specific MCP server | Opt-in; approval required |
| `kujo_dispatch_run` | Run a resumable Dispatch workflow | Opt-in; approval required |
| `kujo_agents_smoke` | Run deterministic Agents SDK examples | Opt-in; approval required |
| `kujo_runledger` | Start or finish a local execution receipt | Opt-in |
| `kujo_watchdog` | Read configured Watchdog telemetry | Opt-in; URL required |
| `kujo_leash_approval` | Send an explicit approval event to Leash | Opt-in; approval and token required |
| `kujo_rag_query` | Query a local Kujo RAG index with citations | Opt-in |

Optional tools stay inactive until you enable them. Pi must also report the open project as trusted before Kujo Pi enables or runs repository-scoped tools. This keeps normal sessions quiet and prevents installation alone from creating side effects.

## Install

### Recommended: stable npm release

Install the published release:

```bash
pi install npm:@kujolang/kujo-pi
```

The package currently requires Node.js 22.19 or newer.

### Alternative: pinned project-local Git install

Run this from the repository where you use Pi:

```bash
pi install -l git:github.com/kujolang/kujo-pi@<full-commit-sha>
```

The `-l` flag keeps the package in the project's `.pi/settings.json`, which makes the installation visible and repeatable for a team.

You can install globally instead:

```bash
pi install git:github.com/kujolang/kujo-pi@<full-commit-sha>
```

## Prerequisites

Install the Kujo CLI separately and make sure it is on `PATH`:

```bash
kujo --version
```

If the binary is elsewhere, configure it for the Pi process:

```bash
export KUJO_BIN="$HOME/src/kujo/target/release/kujo"
```

If you have a standard Kujo ecosystem checkout, configure its root once. Doctor verifies the packaged registry signature and checksums canonical entrypoints before using them:

```bash
export KUJO_ECOSYSTEM_ROOT="$HOME/src/kujo-repos"
```

Kujo Pi can also call ecosystem entrypoints directly through environment variables. Entrypoints must be absolute existing file paths; the extension does not execute repository-local fallback names. A typical local checkout looks like this:

```bash
export KUJO_SCOUT_ENTRY="$HOME/src/scout/scout.kujo"
export KUJO_SCENT_ENTRY="$HOME/src/scent/scent.kujo"
export KUJO_MCP_ENTRY="$HOME/src/mcp/mcp.kujo"
export KUJO_DISPATCH_ENTRY="$HOME/src/dispatch/dispatch.kujo"
export KUJO_AGENTS_SMOKE_ENTRY="$HOME/src/agents-sdk/examples/examples_smoke_runner.kujo"
export KUJO_RAG_ENTRY="$HOME/src/rag/main.kujo"
```

If you use standalone commands instead, set the relevant `*_BIN` variables listed in the [configuration reference](#configuration).

## First five minutes

1. Start Pi in the repository you want to work on.
2. Confirm that Pi marks the project as trusted.
3. Run the setup summary:

   ```text
   /kujo setup
   ```

   It verifies the signed registry, reports available local integrations, and gives one next action. Use `kujo_doctor` when you need the full diagnostic record and per-dependency remediations:

   ```text
   Use kujo_doctor to check my Kujo Pi setup.
   ```

   Doctor returns one copy-ready remediation for every missing dependency and reports the signed-registry and checksum state.

4. Inspect the task-oriented packs:

   ```text
   /kujo packs
   ```

   Run `/kujo active` at any time to see which optional integrations are active in the current session.

5. Enable only what you need:

   ```text
   Enable the understand pack.
   ```

   You can also use the slash command:

   ```text
   /kujo enable understand
   ```

6. Ask Pi to work with the enabled tools:

   ```text
   Use Kujo Scout to understand this repository, then use Kujo Scent to prepare context for fixing the authentication bug.
   ```

To create a visible project marker for Kujo artifacts, run:

```text
/kujo init
```

This creates only `.kujo/pi/README.md` and does not overwrite an existing file.

## Useful workflows

### Understand an unfamiliar repository

Enable Scout, then ask Pi for an evidence-based map:

```text
/kujo enable kujo_scout
Use Kujo Scout to map this repository. Focus on the runtime entrypoints, external services, and test commands.
```

Scout writes the report according to its own configuration. Review generated files before committing them.

### Prepare focused agent context

Scent is useful when a repository is too large or noisy to place in one prompt:

```text
/kujo enable kujo_scent
Prepare a dry-run Kujo Scent pack for implementing the cache invalidation task.
```

The tool scopes context and reports provenance and redaction metadata. It does not modify the project by default.

### Review a change before asking for implementation

```text
/kujo enable kujo_review_changes kujo_changebucket
Review the current changes with PatchBrief, then report the change footprint and blast radius.
```

This is useful for handoffs, pull-request preparation, and deciding whether a change is small enough to ship safely.

### Run release checks

ShipCheck can execute project checks and therefore requires explicit approval:

```text
/kujo enable kujo_shipcheck
Run Kujo ShipCheck for this repository after I approve the operation.
```

Treat the result as release evidence, not as a replacement for human review or organization-specific controls.

### Generate a repository-specific MCP server

```text
/kujo enable kujo_mcp_make
Generate the guarded MCP server for this repository and show me the files before anything is committed.
```

MCP generation is approval-gated and remains governed by the canonical Kujo MCP repository.

### Run a Dispatch workflow

```text
/kujo enable kujo_dispatch_run
Run the Dispatch workflow for producing a dependency-upgrade report, but wait for my approval before execution.
```

Dispatch writes resumable workflow state and artifacts. Use a project-local output directory and review the resulting files.

### Query a local RAG index

```text
/kujo enable kujo_rag_query
Query the local Kujo RAG index: where is the retry policy defined? Include citations.
```

RAG availability depends on an index and the configured Kujo RAG entrypoint.

## Configuration

Set these variables in the environment inherited by Pi. Do not put secrets in `.pi/settings.json`, project files, or shell history.

| Variable | Purpose |
|---|---|
| `KUJO_BIN` | Kujo runtime executable; default `kujo` |
| `KUJO_ECOSYSTEM_ROOT` | Discover and verify canonical entrypoints through the signed registry |
| `KUJO_SCOUT_BIN` / `KUJO_SCOUT_ENTRY` | Scout executable or `.kujo` entrypoint |
| `KUJO_SCENT_BIN` / `KUJO_SCENT_ENTRY` | Scent executable or `.kujo` entrypoint |
| `KUJO_PATCHBRIEF_BIN` | PatchBrief executable; default `patchbrief` |
| `KUJO_CHANGEBUCKET_BIN` | ChangeBucket executable; default `changebucket` |
| `KUJO_SHIPCHECK_BIN` | ShipCheck executable; default `shipcheck` |
| `KUJO_MCP_ENTRY` | Required absolute MCP entrypoint |
| `KUJO_DISPATCH_ENTRY` | Required absolute Dispatch entrypoint |
| `KUJO_AGENTS_SMOKE_ENTRY` | Required absolute Agents SDK fixture runner |
| `KUJO_RAG_ENTRY` | Required absolute RAG entrypoint |
| `KUJO_RUNLEDGER_BIN` | RunLedger executable; default `runledger` |
| `KUJO_PI_MIN_KUJO_VERSION` | Optional minimum Kujo version checked by Doctor |
| `KUJO_PI_RECEIPTS` | Set to `1` to record redacted session receipts |

### Optional Watchdog and Leash services

The `KUJO_WATCHDOG_URL` setting enables Kujo Pi's read-only Watchdog tool; it
does not reroute Pi's model provider. To capture Pi model traffic in Watchdog,
configure a Watchdog-backed Pi provider as described in
[the Watchdog proxy guide](watchdog-pi-proxy.md).

For local services:

```bash
export KUJO_WATCHDOG_URL=http://127.0.0.1:4318
export KUJO_LEASH_URL=http://127.0.0.1:4319
export KUJO_LEASH_TOKEN='local-token-from-your-secret-manager'
```

For remote services, use HTTPS and configure the service audience:

```bash
export KUJO_WATCHDOG_URL=https://watchdog.example.internal
export KUJO_WATCHDOG_TOKEN='read-from-your-secret-manager'
export KUJO_WATCHDOG_AUDIENCE=kujo-watchdog
export KUJO_LEASH_URL=https://leash.example.internal
export KUJO_LEASH_TOKEN='read-from-your-secret-manager'
export KUJO_LEASH_AUDIENCE=kujo-leash
```

These integrations are disabled until their URLs are configured. The extension rejects remote HTTP, does not follow redirects, bounds response bodies, and never contacts a service during startup.

## Safety and trust model

- Read-only tools can inspect the current workspace, but they do not grant Pi or Kujo permissions.
- Every subprocess, network call, and project write requires a project Pi reports as trusted.
- Side-effecting tools are opt-in. ShipCheck, MCP generation, Dispatch, Agents SDK runs, and Leash delivery also require approval. Interactive sessions always show Pi's approval UI.
- Workflow entrypoints are explicit absolute files; missing or relative entrypoint configuration fails closed.
- Workspace paths are checked for lexical escapes and existing symlink escapes before they are passed to a command.
- Commands use argument arrays with shell execution disabled.
- Subprocess output and service responses are bounded before they reach the model.
- Network attempts retain a per-attempt timeout even when the caller provides a cancellation signal.
- Receipts are off by default and contain operation metadata, not credentials or raw output.
- Pi extensions run with the user's system permissions. Review the source and your project trust settings before installing any extension.

Kujo Pi does not provide tenant isolation, certificate pinning, service authorization, or a second permission system. Keep those controls at the Pi host, Kujo runtime, service, and organization layers.

## Troubleshooting

### `kujo_doctor` reports a missing dependency

Use the `remediations` returned by Doctor. Run `kujo --version`, confirm the binary is on `PATH`, set `KUJO_BIN` to its absolute path, or configure `KUJO_ECOSYSTEM_ROOT`. For an individual integration, set the matching entrypoint or standalone binary variable.

See the [signed registry contract](integration-registry.md), [versioned result and receipt contracts](contracts.md), and [capability examples](capability-examples.md).

### An optional tool is not available to Pi

Enable it for the current session:

```text
/kujo enable kujo_scout
```

Optional tools are inactive in a new session. Once enabled, their activation is stored in that Pi session and restored after reload or session-tree navigation. Use `/kujo disable <tool|pack>` to turn them off persistently for the session.

### A service check fails

Confirm the URL, protocol, token, and audience. Local HTTP is allowed only for loopback addresses. Remote services must use HTTPS. See [service profiles](service-profiles.md).

### You want to test the package itself

From a checkout of Kujo Pi:

```bash
npm install
npm test
npm audit --omit=dev --audit-level=high
```

The opt-in live smoke check requires an installed Kujo CLI:

```bash
KUJO_PI_LIVE=1 npm run test:live
```

To exercise the local ecosystem adapter matrix, also set `KUJO_PI_ECOSYSTEM_ROOT` to the directory containing the Kujo repositories.

## Where to go next

- Read the [Kujo Pi README](../README.md) for the complete capability and environment reference.
- Read the [service profiles](service-profiles.md) before connecting Watchdog or Leash.
- Read the [compatibility policy](compatibility.md), [v1 migration guide](migration-v1.md), and [support policy](support.md) before adopting the stable 1.x line.
- Read the [v1 release standard](v1-roadmap.md) for the stable compatibility and safety guarantees.
- Browse the canonical Kujo repositories linked in the README when you need runtime-specific documentation.
