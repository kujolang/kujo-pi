import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { OPTIONAL_TOOLS, commandResult, workspacePath } from "../src/core.mjs";

async function exec(pi: ExtensionAPI, command: string, args: string[], cwd: string, signal?: AbortSignal, timeout = 120_000) {
  return commandResult(await pi.exec(command, args, { cwd, signal, timeout }), command);
}

function text(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function toolResult(value: unknown) {
  return { content: [{ type: "text" as const, text: text(value) }], details: value };
}

async function approve(ctx: any, title: string, message: string, requested: boolean) {
  if (requested) return true;
  if (!ctx.hasUI) return false;
  return ctx.ui.confirm(title, message);
}

function configuredCommand(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function commandFor(operation: string, params: any, cwd: string): [string, string[]] {
  const entry = (name: string) => process.env[name];
  const cli = (name: string, fallback: string, args: string[]) => [entry(name) || fallback, args] as [string, string[]];
  switch (operation) {
    case "status": return cli("KUJO_BIN", "kujo", ["--version"]);
    case "check": return cli("KUJO_BIN", "kujo", ["check", workspacePath(cwd, params.file)]);
    case "scout": return entry("KUJO_SCOUT_BIN") ? cli("KUJO_SCOUT_BIN", "scout", [workspacePath(cwd, params.path || "."), ...(params.quick ? ["--quick"] : [])]) : cli("KUJO_BIN", "kujo", ["run", entry("KUJO_SCOUT_ENTRY") || "scout.kujo", "--", workspacePath(cwd, params.path || "."), ...(params.quick ? ["--quick"] : [])]);
    case "scent": return entry("KUJO_SCENT_BIN") ? cli("KUJO_SCENT_BIN", "scent", ["pack", workspacePath(cwd, params.path || "."), "--task", params.task, "--dry-run", "--json"]) : cli("KUJO_BIN", "kujo", ["run", entry("KUJO_SCENT_ENTRY") || "scent.kujo", "--", "pack", workspacePath(cwd, params.path || "."), "--task", params.task, "--dry-run", "--json"]);
    case "review": return cli("KUJO_PATCHBRIEF_BIN", "patchbrief", ["handoff"]);
    case "changebucket": return cli("KUJO_CHANGEBUCKET_BIN", "changebucket", ["report", "--format", "json"]);
    case "shipcheck": return cli("KUJO_SHIPCHECK_BIN", "shipcheck", ["check", "--format", "json"]);
    case "mcp": return cli("KUJO_BIN", "kujo", ["run", entry("KUJO_MCP_ENTRY") || "mcp.kujo", "--interpreter", "make", workspacePath(cwd, params.path || "."), "--artifacts", workspacePath(cwd, params.artifacts || ".kujo/pi/mcp")]);
    case "rag": return cli("KUJO_BIN", "kujo", ["run", entry("KUJO_RAG_ENTRY") || "main.kujo", "--interpreter", "query", "--question", params.question, ...(params.namespace ? ["--namespace", params.namespace] : [])]);
    case "agents": return cli("KUJO_BIN", "kujo", ["run", entry("KUJO_AGENTS_SMOKE_ENTRY") || "examples/examples_smoke_runner.kujo", "--interpreter"]);
    case "dispatch": return cli("KUJO_BIN", "kujo", ["run", entry("KUJO_DISPATCH_ENTRY") || "dispatch.kujo", "--interpreter", "demo", params.task, "--workflow", params.workflow || "research-report", "--output-root", workspacePath(cwd, params.output || ".kujo/pi/dispatch"), ...(params.confirm ? ["--yes"] : [])]);
    default: throw new Error(`Unsupported Kujo operation: ${operation}`);
  }
}

export default function kujoPi(pi: ExtensionAPI) {
  pi.registerCommand("kujo", {
    description: "Inspect or enable Kujo capabilities",
    handler: async (args, ctx) => {
      const requested = args.trim();
      if (!requested) {
        ctx.ui.notify("Kujo tools are available. Ask Pi to use kujo_tools to discover or enable them.", "info");
        return;
      }
      ctx.ui.notify(`Kujo request noted: ${requested}`, "info");
    },
  });

  pi.registerTool({
    name: "kujo_tools", label: "Kujo tools",
    description: "List Kujo Pi capabilities and enable optional integrations for this session.",
    parameters: Type.Object({ enable: Type.Optional(Type.Array(Type.String())) }),
    async execute(_id, params) {
      const all = ["kujo_doctor", "kujo_status", "kujo_check", "kujo_scout", "kujo_scent", "kujo_review_changes", "kujo_changebucket", "kujo_shipcheck", ...OPTIONAL_TOOLS];
      const unknown = (params.enable || []).filter((name: string) => !all.includes(name));
      const enabled = (params.enable || []).filter((name: string) => all.includes(name));
      if (enabled.length) pi.setActiveTools([...new Set([...pi.getActiveTools(), ...enabled])]);
      return toolResult({ available: all, enabled, unknown, note: "Optional tools are inactive until explicitly enabled." });
    },
  });

  const registerKujoCliTool = (name: string, label: string, description: string, parameters: any, operation: string, requiresApproval = false) => {
    pi.registerTool({
      name, label, description, parameters,
      async execute(_id, params: any, signal, _onUpdate, ctx) {
        const cwd = ctx.cwd;
        const approved = requiresApproval && await approve(ctx, `${label} approval`, `Allow ${label} to run in ${cwd}?`, params.confirm === true);
        if (requiresApproval && !approved) {
          return toolResult({ ok: false, status: "approval_required", message: "No approval was granted." });
        }
        try {
          const [command, args] = commandFor(operation, { ...params, confirm: params.confirm === true || approved }, cwd);
          const result = await exec(pi, command, args, cwd, signal);
          return toolResult(result);
        } catch (error) {
          return toolResult({ ok: false, status: "configuration_error", message: String(error) });
        }
      },
    });
  };

  pi.registerTool({
    name: "kujo_doctor", label: "Kujo doctor", description: "Inspect Kujo Pi configuration and local tool availability without running project workflows.",
    parameters: Type.Object({}),
    async execute(_id, _params, signal, _onUpdate, ctx) {
      const binaries = {
        kujo: configuredCommand("KUJO_BIN", "kujo"),
        patchbrief: configuredCommand("KUJO_PATCHBRIEF_BIN", "patchbrief"),
        changebucket: configuredCommand("KUJO_CHANGEBUCKET_BIN", "changebucket"),
        shipcheck: configuredCommand("KUJO_SHIPCHECK_BIN", "shipcheck"),
        runledger: configuredCommand("KUJO_RUNLEDGER_BIN", "runledger"),
      };
      const availability = {} as Record<string, unknown>;
      for (const [name, binary] of Object.entries(binaries)) {
        const result = await pi.exec(binary, ["--version"], { cwd: ctx.cwd, signal, timeout: 10_000 });
        availability[name] = { command: binary, ...commandResult(result, binary) };
      }
      return toolResult({
        ok: true,
        workspace: ctx.cwd,
        projectTrusted: ctx.isProjectTrusted?.() ?? "unknown",
        availability,
        network: {
          watchdog: Boolean(process.env.KUJO_WATCHDOG_URL),
          leash: Boolean(process.env.KUJO_LEASH_URL && process.env.KUJO_LEASH_TOKEN),
        },
        entrypoints: {
          scout: process.env.KUJO_SCOUT_ENTRY || "scout.kujo",
          scent: process.env.KUJO_SCENT_ENTRY || "scent.kujo",
          mcp: process.env.KUJO_MCP_ENTRY || "mcp.kujo",
          dispatch: process.env.KUJO_DISPATCH_ENTRY || "dispatch.kujo",
          rag: process.env.KUJO_RAG_ENTRY || "main.kujo",
        },
      });
    },
  });

  registerKujoCliTool("kujo_status", "Kujo status", "Check that the Kujo CLI is installed.", Type.Object({}), "status");
  registerKujoCliTool("kujo_check", "Kujo check", "Validate a Kujo source file without changing it.", Type.Object({ file: Type.String() }), "check");
  registerKujoCliTool("kujo_scout", "Kujo Scout", "Create a repository intelligence report.", Type.Object({ path: Type.Optional(Type.String()), quick: Type.Optional(Type.Boolean()) }), "scout");
  registerKujoCliTool("kujo_scent", "Kujo Scent", "Prepare scoped context with provenance and redaction metadata.", Type.Object({ task: Type.String(), path: Type.Optional(Type.String()) }), "scent");
  registerKujoCliTool("kujo_review_changes", "Kujo review changes", "Generate a PatchBrief handoff for current changes.", Type.Object({}), "review");
  registerKujoCliTool("kujo_changebucket", "Kujo ChangeBucket", "Measure current change footprint and blast radius.", Type.Object({}), "changebucket");
  registerKujoCliTool("kujo_shipcheck", "Kujo ShipCheck", "Run release-readiness checks; use only when explicitly requested.", Type.Object({ confirm: Type.Optional(Type.Boolean()) }), "shipcheck", true);
  registerKujoCliTool("kujo_mcp_make", "Kujo MCP make", "Generate a guarded, repo-specific MCP server and review artifacts.", Type.Object({ path: Type.Optional(Type.String()), artifacts: Type.Optional(Type.String()), confirm: Type.Optional(Type.Boolean()) }), "mcp", true);
  registerKujoCliTool("kujo_agents_smoke", "Kujo Agents SDK smoke", "Run the deterministic offline Agents SDK example suite.", Type.Object({ confirm: Type.Optional(Type.Boolean()) }), "agents", true);
  registerKujoCliTool("kujo_rag_query", "Kujo RAG query", "Query a configured local Kujo RAG index and return citations.", Type.Object({ question: Type.String(), namespace: Type.Optional(Type.String()) }), "rag");
  registerKujoCliTool("kujo_dispatch_run", "Kujo Dispatch run", "Run a resumable, reviewable Dispatch workflow after explicit approval.", Type.Object({ task: Type.String(), workflow: Type.Optional(Type.String()), output: Type.Optional(Type.String()), confirm: Type.Optional(Type.Boolean()) }), "dispatch", true);

  pi.registerTool({
    name: "kujo_runledger", label: "Kujo RunLedger", description: "Start or finish a local RunLedger receipt using the installed RunLedger CLI.",
    parameters: Type.Object({ action: Type.Union([Type.Literal("start"), Type.Literal("finish")]), runId: Type.Optional(Type.String()), task: Type.Optional(Type.String()), status: Type.Optional(Type.String()), verdict: Type.Optional(Type.String()), provider: Type.Optional(Type.String()), model: Type.Optional(Type.String()) }),
    async execute(_id, params: any, signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      const args = params.action === "start"
        ? ["start", "--provider", params.provider || "unknown", "--model", params.model || "unknown", "--task", params.task || "Pi task", "--repo", cwd]
        : ["finish", params.runId || "", "--status", params.status || "partial", "--verdict", params.verdict || "Pi session finished", "--repo", cwd];
      const result = await exec(pi, process.env.KUJO_RUNLEDGER_BIN || "runledger", args, cwd, signal);
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "kujo_watchdog", label: "Kujo Watchdog", description: "Read optional local Watchdog telemetry; network calls require an explicit configured URL.",
    parameters: Type.Object({ path: Type.Optional(Type.String()) }),
    async execute(_id, params: any, signal, _onUpdate, ctx) {
      const base = process.env.KUJO_WATCHDOG_URL;
      if (!base) return toolResult({ ok: false, status: "not_configured", message: "Set KUJO_WATCHDOG_URL to opt into Watchdog telemetry." });
      const endpoint = new URL(params.path || "/health", base);
      const response = await fetch(endpoint, { signal });
      return toolResult({ ok: response.ok, status: response.status, body: await response.text() });
    },
  });

  pi.registerTool({
    name: "kujo_leash_approval", label: "Kujo Leash approval", description: "Send an explicit approval request to a configured local Leash daemon.",
    parameters: Type.Object({ event: Type.Record(Type.String(), Type.Unknown()), confirm: Type.Optional(Type.Boolean()) }),
    async execute(_id, params: any, signal, _onUpdate, ctx) {
      if (!(await approve(ctx, "Leash approval", "Send this approval request to the configured Leash daemon?", params.confirm === true))) return toolResult({ ok: false, status: "approval_required" });
      const base = process.env.KUJO_LEASH_URL;
      const token = process.env.KUJO_LEASH_TOKEN;
      if (!base || !token) return toolResult({ ok: false, status: "not_configured", message: "Set KUJO_LEASH_URL and KUJO_LEASH_TOKEN to opt into Leash." });
      const response = await fetch(new URL("/v1/intervention-events", base), { method: "POST", signal, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(params.event) });
      return toolResult({ ok: response.ok, status: response.status, body: await response.text() });
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("kujo", "Kujo: opt-in tools available");
    const active = pi.getActiveTools();
    pi.setActiveTools(active.filter((name) => !OPTIONAL_TOOLS.includes(name)));
  });
}
