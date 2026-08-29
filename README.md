# Kujo Pi

[![Version](https://img.shields.io/badge/version-0.3.0-black)](https://github.com/kujolang/kujo-pi)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)
[![CI](https://github.com/kujolang/kujo-pi/actions/workflows/ci.yml/badge.svg)](https://github.com/kujolang/kujo-pi/actions)

An opt-in [Pi](https://pi.dev/) package that gives developers a quiet, reviewable bridge into the Kujo ecosystem.

New to Kujo Pi? Start with the [Pi onboarding guide](docs/pi-onboarding.md).

To route Pi model requests through the local Watchdog observability proxy, see
[Route Pi model traffic through Watchdog](docs/watchdog-pi-proxy.md).
To add opt-in agent, turn, tool, shell-request, and session telemetry, see
[Send Pi lifecycle telemetry to Watchdog](docs/watchdog-telemetry-bridge.md).

Kujo Pi does not replace Pi's workflow. It adds Kujo only when it is useful: repository intelligence, scoped context, deterministic checks, workflow orchestration, approvals, receipts, telemetry, retrieval, and guarded MCP generation.

Kujo Pi is designed for production use within a clear boundary: it is a local client integration, not a universal enterprise platform. Enterprise readiness also depends on the Pi host, the installed Kujo tools, service policy, release controls, and organization-specific testing. `kujo_doctor`, project-trust checks, explicit entrypoint configuration, and approval gates make those dependencies visible.

The default test suite is offline. It covers supported Node versions, package contents, documentation links, path and origin containment, bounded I/O, project trust, approval behavior, entrypoint provenance, and release-workflow invariants.

## Install

The package is not published to npm yet. After the first registry release, install the released version:

```bash
pi install npm:@kujolang/kujo-pi@<version>
```

Install directly from GitHub today. Pin a reviewed full commit for team and CI use:

```bash
pi install -l git:github.com/kujolang/kujo-pi@<full-commit-sha>
```

`-l` keeps the package in the project-local `.pi/settings.json`. This is the recommended team-sharing mode. Use `@main` only when you intentionally want the latest unreleased code. Global installation is also supported:

```bash
pi install git:github.com/kujolang/kujo-pi@<full-commit-sha>
```

The Kujo CLI must be installed separately and available on `PATH` unless `KUJO_BIN` points to it. Workflow entrypoints must be configured as absolute paths; Kujo Pi never executes a same-named `.kujo` file merely because it exists in the open repository. Kujo Pi never installs Kujo, starts daemons, or contacts a remote service during startup.

## First use

Configure the Kujo workflow you want to use. For example:

```bash
export KUJO_SCOUT_ENTRY="/absolute/path/to/scout/scout.kujo"
export KUJO_SCENT_ENTRY="/absolute/path/to/scent/scent.kujo"
```

Then start Pi in a trusted repository and ask naturally:

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

The package begins with optional and service-backed integrations inactive. A project must be trusted in Pi before these tools can be enabled or run. Ask Pi to enable a capability for the current session when you need it, or use `/kujo enable kujo_scout`.

`/kujo init` creates only `.kujo/pi/README.md`, refuses to overwrite it, and is useful for making project-local Kujo artifacts visible to a team.

## Included capabilities

| Capability | Default | Purpose | Side effects |
|---|---:|---|---|
| `kujo_tools` | active | Discover and enable integrations | Session-only tool activation; optional activation requires project trust |
| `kujo_doctor` | active | Check local tools, project trust, entrypoints, and network configuration | Version probes in trusted projects only |
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
| `KUJO_SCOUT_BIN` / `KUJO_SCOUT_ENTRY` | Scout binary, or required absolute `.kujo` entrypoint when no binary is configured |
| `KUJO_SCENT_BIN` / `KUJO_SCENT_ENTRY` | Scent binary, or required absolute `.kujo` entrypoint when no binary is configured |
| `KUJO_PATCHBRIEF_BIN` | PatchBrief executable; default `patchbrief` |
| `KUJO_CHANGEBUCKET_BIN` | ChangeBucket executable; default `changebucket` |
| `KUJO_SHIPCHECK_BIN` | ShipCheck executable; default `shipcheck` |
| `KUJO_MCP_ENTRY` | Required absolute MCP `mcp.kujo` path |
| `KUJO_DISPATCH_ENTRY` | Required absolute Dispatch `dispatch.kujo` path |
| `KUJO_AGENTS_SMOKE_ENTRY` | Required absolute Agents SDK fixture runner path |
| `KUJO_RAG_ENTRY` | Required absolute RAG `main.kujo` path |
| `KUJO_RUNLEDGER_BIN` | RunLedger executable; default `runledger` |
| `KUJO_WATCHDOG_URL` | Optional local Watchdog base URL |
| `KUJO_WATCHDOG_TOKEN` / `KUJO_WATCHDOG_AUDIENCE` | Optional Watchdog bearer token and audience header |
| `KUJO_WATCHDOG_TELEMETRY` | Set to `metadata` to enable the trusted-project lifecycle bridge |
| `KUJO_WATCHDOG_PROXY_PROVIDER` | Pi provider ID eligible for Watchdog correlation headers; default `kujo-watchdog` |
| `KUJO_PI_TELEMETRY_SPOOL_DIR` | Optional durable telemetry spool root |
| `KUJO_PI_TELEMETRY_SPOOL_MAX_BYTES` / `KUJO_PI_TELEMETRY_SPOOL_MAX_FILES` | Bounded spool limits |
| `KUJO_PI_TELEMETRY_TIMEOUT_MS` | Per-delivery timeout; default `2000` |
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

Kujo Pi canonicalizes configured entrypoints and refuses missing, relative, or non-file paths. `kujo_doctor` reports `not configured` when an integration still needs setup.

## Safety model

- Optional integrations are inactive until enabled.
- Every subprocess, network call, and project write requires a project that Pi reports as trusted.
- Release checks, MCP generation, Dispatch, Agents SDK runs, and Leash delivery require explicit approval. Interactive sessions always show the approval UI; `confirm: true` is accepted only in trusted headless sessions.
- Kujo workflow entrypoints must be absolute, operator-configured files. Repository-local fallback names are not executed.
- User paths are resolved inside Pi's current workspace and passed as argument-array values, never interpolated into shell strings.
- Command output is bounded before it is returned to the model.
- Tokens and secrets are taken from environment variables and are never included in tool output.
- Receipts are disabled by default; when enabled, they record only operation, workspace, status, exit code, duration, and timestamp.
- Network integrations are disabled unless their URL is explicitly configured; Leash also requires a token, while Watchdog credentials are optional.
- Lifecycle telemetry additionally requires `KUJO_WATCHDOG_TELEMETRY=metadata` and a trusted project. Its local spool contains only allowlisted metadata, uses restrictive file modes, and never stores service credentials.
- Watchdog correlation headers are added only when the active Pi provider exactly matches `KUJO_WATCHDOG_PROXY_PROVIDER`; direct providers never receive them.
- Configured HTTP integrations are restricted to the configured origin; user-supplied paths cannot redirect requests to another host.
- Every network attempt has its own timeout, including calls that also carry a caller cancellation signal.
- Existing symlink targets are resolved before a workspace path is accepted, preventing repository-local links from escaping the workspace.
- Kujo Pi does not claim to enforce Kujo or Pi permissions; the host, Kujo runtime, and configured external services remain authoritative.

Pi extensions run with the user's system permissions. Review this source before installing it. See [SECURITY.md](SECURITY.md) for the threat model and reporting process.

## Architecture

```text
Pi session
   │
   ├── kujo_tools ── discovers and enables capabilities
   ├── repository tools ── check / Scout / Scent / PatchBrief / RAG
   ├── approved tools ── ShipCheck / MCP / Dispatch / Agents SDK
   ├── local receipts ── RunLedger
   └── opt-in network edges ── Watchdog / Leash
          ├── Watchdog proxy ── model requests and provider telemetry
          ├── metadata bridge ── agent / turn / tool / shell lifecycle
          └── Kujo CLI, MCP, and workflow contracts
```

Runtime implementation lives in `src/`. `extensions/kujo.ts` is intentionally a two-line compatibility entrypoint required by Pi's package manifest. Skills, prompts, documentation, tests, and workflow configuration stay in their conventional top-level directories.

## Development

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
```

The test suite is offline and validates the package manifest, TypeScript extension contract, source layout, documentation links, path containment, trusted entrypoint selection, approval and project-trust gates, output bounds, network timeouts, and release workflow.

The prioritized hardening and expansion backlog is documented in [docs/enterprise-roadmap.md](docs/enterprise-roadmap.md).

The next production-readiness work list is in [docs/production-readiness-next.md](docs/production-readiness-next.md).

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
