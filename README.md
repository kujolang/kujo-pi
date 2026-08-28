# Kujo Pi

An opt-in [Pi](https://pi.dev/) package for Kujo skills, repository intelligence, and review artifacts.

Kujo Pi is intentionally quiet. It does not start background agents, install tools, change files, publish releases, or make network calls automatically. It gives Pi a small set of discoverable Kujo tools and lets the user choose when to use them.

## Install

From npm after publication:

```bash
pi install npm:@kujolang/kujo-pi
```

For a project-local install from GitHub:

```bash
pi install -l git:github.com/kujolang/kujo-pi@main
```

The Kujo CLI must be available on `PATH`. The package does not bundle the Kujo runtime.

## Included tools

| Tool | Purpose | Side effects |
|---|---|---|
| `kujo_status` | Check the installed Kujo CLI | Read-only |
| `kujo_check` | Validate a `.kujo` source file | Read-only |
| `kujo_scout` | Profile a repository for structure, dependencies, routes, and risks | Writes Scout output according to the command configuration |
| `kujo_scent` | Prepare scoped context with provenance and redaction metadata | Dry-run by default |
| `kujo_review_changes` | Generate a PatchBrief handoff for current changes | Produces a review artifact |

The package also includes three small skills: `kujo-way`, `kujo-review`, and `kujo-release`, plus the `/kujo-finish` prompt template.

## Design boundary

This package is a client integration layer. Kujo remains responsible for its own CLI, runtime, capabilities, tools, and workflow contracts. Pi remains responsible for extension loading, user interaction, project trust, and tool activation.

The first release deliberately does not include Dispatch, Agents SDK, MCP, Leash, Watchdog, or RAG adapters. Those should be added as separately opt-in layers after this small bridge has proven useful.

## Development

```bash
npm test
```

The extension is TypeScript loaded by Pi at runtime. Pi's extension dependencies are peer dependencies and are not bundled.

## Security

Pi extensions run with the user's system permissions. Review this source before installing it. Kujo Pi passes user-provided paths as argument-array values and does not construct shell command strings, but the Kujo commands themselves may execute project code when explicitly invoked.

## License

MIT
