# Kujo Pi

[![Version](https://img.shields.io/badge/version-0.3.0-black)](https://github.com/kujolang/kujo-pi)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)
[![CI](https://github.com/kujolang/kujo-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/kujolang/kujo-pi/actions)

An opt-in [Pi](https://pi.dev/) package that gives serious developers a quiet, reviewable bridge into the Kujo ecosystem.

Kujo Pi does not replace Pi's workflow. It adds Kujo only when it is useful: repository intelligence, scoped context, deterministic checks, workflow orchestration, approvals, receipts, telemetry, retrieval, and guarded MCP generation.

This is production-ready as a thin, local-first integration layer—not a universal guarantee that every Kujo service is installed, configured, or compatible with every organization. The `kujo_doctor` tool makes that boundary visible, while approvals and opt-in activation keep the package quiet until a developer asks for more.

## Install

Install from npm after the first registry release:

```bash
pi install npm:@kujolang/kujo-pi@0.3.0
```

Install directly from GitHub today:

```bash
pi install -l git:github.com/kujolang/kujo-pi@main
```

`-l` keeps the package in the project-local `.pi/settings.json`. This is the recommended team-sharing mode. Global installation is also supported:

```bash
pi install git:github.com/kujolang/kujo-pi@main
```

The Kujo CLI must be installed separately and available on `PATH` unless `KUJO_BIN` points to it. Kujo Pi never installs Kujo, starts daemons, or contacts a remote service during startup.

## First use

Start Pi in a repository and ask naturally:

```text
Use Kujo Scout to understand this repository, then prepare a scoped context pack for the task we discussed.
```

Useful commands and prompts:

```text
/kujo
/kujo list
/kujo enable kujo_scout kujo_scent
/kujo init
/kujo-finish
Use kujo_tools to see the available integrations.
Enable kujo_changebucket and review the current changes.
```

The package begins with side-effecting and service-backed integrations inactive. Ask Pi to enable a capability for the current session when you need it, or use `/kujo enable kujo_scout`.

`/kujo init` creates only `.kujo/pi/README.md`, refuses to overwrite it, and is useful for making project-local Kujo artifacts visible to a team.

## Included capabilities

| Capability | Default | Purpose | Side effects |
|---|---:|---|---|
| `kujo_tools` | active | Discover and enable integrations | Session-only tool activation |
| `kujo_doctor` | active | Check local tools, project trust, entrypoints, and network configuration | Read-only version probes |
| `kujo_status` | active | Check Kujo installation | Read-only |
| `kujo_check` | active | Validate `.kujo` source | Read-only |
| `kujo_scout` | opt-in | Map repository structure, dependencies, routes, and risks | Writes Scout output when configured |
| `kujo_scent` | opt-in | Prepare scoped context with provenance and redaction metadata | Dry-run by default |
| `kujo_review_changes` | opt-in | Generate a PatchBrief handoff | Writes a review artifact |
| `kujo_changebucket` | opt-in | Measure change footprint and blast radius | Writes a report |
| `kujo_shipcheck` | opt-in + approval | Run release-readiness checks | Executes project checks |
| `kujo_mcp_make` | opt-in + approval | Generate a guarded repo-specific MCP server | Writes scaffold and artifacts |
| `kujo_dispatch_run` | opt-in + approval | Run a resumable Dispatch workflow | Executes workflow and writes state |
| `kujo_agents_smoke` | opt-in + approval | Run deterministic Agents SDK fixtures | Executes fixture suite |
| `kujo_runledger` | opt-in | Start or finish a RunLedger receipt | Writes local ledger data |
| `kujo_watchdog` | opt-in | Read configured Watchdog health/telemetry | Network only when configured |
| `kujo_leash_approval` | opt-in + approval | Send an approval event to Leash | Network only when configured |
| `kujo_rag_query` | opt-in | Query a local RAG index with citations | Read-only query |

## Integration configuration

The package uses installed Kujo tools when available. Set entrypoint variables when a tool is not installed as a standalone binary:

| Variable | Meaning |
|---|---|
| `KUJO_BIN` | Kujo runtime executable; default `kujo` |
| `KUJO_SCOUT_BIN` / `KUJO_SCOUT_ENTRY` | Scout binary or `.kujo` entrypoint |
| `KUJO_SCENT_BIN` / `KUJO_SCENT_ENTRY` | Scent binary or `.kujo` entrypoint |
| `KUJO_PATCHBRIEF_BIN` | PatchBrief executable; default `patchbrief` |
| `KUJO_CHANGEBUCKET_BIN` | ChangeBucket executable; default `changebucket` |
| `KUJO_SHIPCHECK_BIN` | ShipCheck executable; default `shipcheck` |
| `KUJO_MCP_ENTRY` | MCP `mcp.kujo` path |
| `KUJO_DISPATCH_ENTRY` | Dispatch `dispatch.kujo` path |
| `KUJO_AGENTS_SMOKE_ENTRY` | Agents SDK fixture runner path |
| `KUJO_RAG_ENTRY` | RAG `main.kujo` path |
| `KUJO_RUNLEDGER_BIN` | RunLedger executable; default `runledger` |
| `KUJO_WATCHDOG_URL` | Optional local Watchdog base URL |
| `KUJO_WATCHDOG_TOKEN` / `KUJO_WATCHDOG_AUDIENCE` | Optional Watchdog bearer token and audience header |
| `KUJO_LEASH_URL` | Optional Leash daemon base URL |
| `KUJO_LEASH_TOKEN` | Leash bearer token; never logged |
| `KUJO_LEASH_AUDIENCE` | Optional Leash audience header |
| `KUJO_PI_MIN_KUJO_VERSION` | Optional minimum Kujo version for Doctor compatibility reporting |
| `KUJO_PI_RECEIPTS` | Set to `1` to persist redacted per-call receipts in the Pi session |

Example for a local Kujo checkout:

```bash
export KUJO_BIN="$HOME/src/kujo/target/release/kujo"
export KUJO_SCOUT_ENTRY="$HOME/src/scout/scout.kujo"
export KUJO_SCENT_ENTRY="$HOME/src/scent/scent.kujo"
export KUJO_MCP_ENTRY="$HOME/src/mcp/mcp.kujo"
export KUJO_DISPATCH_ENTRY="$HOME/src/dispatch/dispatch.kujo"
export KUJO_AGENTS_SMOKE_ENTRY="$HOME/src/agents-sdk/examples/examples_smoke_runner.kujo"
export KUJO_RAG_ENTRY="$HOME/src/rag/main.kujo"
```

## Safety model

- Optional integrations are inactive until enabled.
- Execution, release checks, MCP generation, Dispatch, Agents SDK runs, and Leash delivery require explicit approval.
- User paths are resolved inside Pi's current workspace and passed as argument-array values, never interpolated into shell strings.
- Command output is bounded before it is returned to the model.
- Tokens and secrets are taken from environment variables and are never included in tool output.
- Receipts are disabled by default; when enabled, they record only operation, workspace, status, exit code, duration, and timestamp.
- Network integrations are disabled unless their URL and credentials are explicitly configured.
- Configured HTTP integrations are restricted to the configured origin; user-supplied paths cannot redirect requests to another host.
- Existing symlink targets are resolved before a workspace path is accepted, preventing repository-local links from escaping the workspace.
- Kujo Pi does not claim to enforce Kujo or Pi permissions; the host, Kujo runtime, and configured external services remain authoritative.

Pi extensions run with the user's system permissions. Review this source before installing it. See [SECURITY.md](SECURITY.md) for the threat model and reporting process.

## Architecture

```text
Pi session
   │
   ├── kujo_tools ── discovers and enables capabilities
   ├── read-only tools ── check / Scout / Scent / PatchBrief / RAG
   ├── approved tools ── ShipCheck / MCP / Dispatch / Agents SDK
   ├── local receipts ── RunLedger
   └── opt-in network edges ── Watchdog / Leash
          │
          └── Kujo CLI, MCP, and workflow contracts
```

## Development

```bash
npm install
npm run typecheck
npm test
```

The test suite is offline and validates the package manifest, TypeScript extension contract, path containment, output bounds, and safety-oriented integration metadata.

The prioritized hardening and expansion backlog is documented in [docs/enterprise-roadmap.md](docs/enterprise-roadmap.md).

Recommended local and remote service profiles are documented in [docs/service-profiles.md](docs/service-profiles.md). The Kujo CLI and service checks are available with `KUJO_PI_LIVE=1 npm run test:live`; add `KUJO_PI_ECOSYSTEM_ROOT=/path/to/kujo-repos` to exercise the full local adapter matrix. Live checks never run in the default offline test suite.

## Scope boundary

Kujo Pi is a client integration layer. It does not duplicate Kujo runtime logic, provider adapters, workflow engines, MCP authorization, mobile approval policy, or RAG storage. Those remain in the canonical Kujo repositories:

- [Kujo Skills](https://github.com/kujolang/kujo-skills)
- [Agents SDK](https://github.com/kujolang/agents-sdk)
- [Dispatch](https://github.com/kujolang/dispatch)
- [MCP](https://github.com/kujolang/mcp)
- [RAG](https://github.com/kujolang/rag)
- [RunLedger](https://github.com/kujolang/runledger)
- [Watchdog](https://github.com/kujolang/watchdog)
- [Leash](https://github.com/kujolang/leash)

## License

MIT
