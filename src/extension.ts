import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Type } from "typebox";
import { OPTIONAL_TOOLS, boundedJson, boundedResponse, commandResult, configuredEntrypoint, errorResult, fetchWithRetry, meetsMinimumVersion, requestSignal, sameOriginUrl, versionFromOutput, workspacePath } from "./core.mjs";

async function exec(pi: ExtensionAPI, command: string, args: string[], cwd: string, signal?: AbortSignal, timeout = 120_000, onUpdate?: (result: any) => void) {
  const publishUpdate = (value: unknown) => { if (typeof onUpdate === "function") onUpdate(toolResult(value)); };
  publishUpdate({ ok: true, status: "running", label: command });
  if (onUpdate) return streamExec(command, args, cwd, signal, timeout, onUpdate);
  try {
    const started = Date.now();
    const result = { ...commandResult(await pi.exec(command, args, { cwd, signal, timeout }), command), durationMs: Date.now() - started };
    publishUpdate(result);
    return result;
  } catch (error) {
    const result = { label: command, ...errorResult(error) };
    publishUpdate(result);
    return result;
  }
}

function streamExec(command: string, args: string[], cwd: string, signal: AbortSignal | undefined, timeout: number, onUpdate: (result: any) => void) {
  return new Promise((resolve) => {
    const maxChars = 12_000;
    let stdout = "";
    let stderr = "";
    let killed = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let lastUpdate = 0;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, detached: process.platform !== "win32" });
    const publish = () => {
      const now = Date.now();
      if (now - lastUpdate < 200) return;
      lastUpdate = now;
      onUpdate(toolResult({ ok: true, status: "running", label: command, output: `${stdout}${stderr ? `\n${stderr}` : ""}`.slice(0, maxChars) }));
    };
    const finish = (result: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", cancel);
      onUpdate(toolResult(result));
      resolve(result);
    };
    const killChild = (signalName: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signalName);
        else child.kill(signalName);
      } catch {
        // The process may have exited between timeout/cancellation and cleanup.
      }
    };
    const terminate = (reason: "timeout" | "cancelled") => {
      if (settled) return;
      killed = true;
      timedOut = reason === "timeout";
      cancelled = reason === "cancelled";
      killChild("SIGTERM");
      killTimer = setTimeout(() => killChild("SIGKILL"), 1_000);
    };
    const cancel = () => terminate("cancelled");
    const timer = setTimeout(() => terminate("timeout"), timeout);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(0, maxChars); publish(); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(0, maxChars); publish(); });
    child.on("error", (error) => finish({ label: command, ...errorResult(error) }));
    child.on("close", (code) => finish(commandResult({ stdout, stderr, code, killed, timedOut, cancelled }, command)));
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function toolResult(value: unknown) {
  return { content: [{ type: "text" as const, text: text(value) }], details: value };
}

function renderResult(result: any, options: any, theme: any) {
  const details = result.details || {};
  const icon = details.ok ? "✓" : "✗";
  const status = details.status || (details.ok ? "success" : "failed");
  const summary = `${icon} ${details.label || "Kujo"} · ${status}`;
  if (!options.expanded) return new Text(theme.fg(details.ok ? "success" : "error", summary), 0, 0);
  const output = details.output || details.message || "No additional output.";
  return new Text(`${theme.fg(details.ok ? "success" : "error", summary)}\n${theme.fg("toolOutput", output)}`, 0, 0);
}

function recordReceipt(pi: ExtensionAPI, operation: string, workspace: string, result: any) {
  if (process.env.KUJO_PI_RECEIPTS !== "1") return;
  pi.appendEntry("kujo-receipt", {
    operation,
    workspace,
    ok: result.ok,
    status: result.status,
    code: result.code ?? null,
    durationMs: result.durationMs ?? null,
    recordedAt: new Date().toISOString(),
  });
}

async function approve(ctx: any, title: string, message: string, requested: boolean) {
  if (ctx.hasUI) return ctx.ui.confirm(title, message);
  return requested;
}

function trustFailure(ctx: any) {
  if (ctx.isProjectTrusted?.() === true) return null;
  return toolResult({
    ok: false,
    status: "project_untrusted",
    message: "Trust this project in Pi before running Kujo tools.",
  });
}

const shortText = (description: string) => Type.String({ minLength: 1, maxLength: 256, description });
const taskText = (description: string) => Type.String({ minLength: 1, maxLength: 8_192, description });
const workspaceText = Type.String({ maxLength: 1_024, description: "Workspace subdirectory relative to Pi's current project" });
const optionalWorkspacePath = (description: string) => Type.Optional(Type.String({ minLength: 1, maxLength: 1_024, description }));

function configuredCommand(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function withWorkspace(parameters: any) {
  return Type.Intersect([Type.Object({ workspace: Type.Optional(workspaceText) }), parameters]);
}

function serviceHeaders(prefix: string) {
  const headers: Record<string, string> = { accept: "application/json" };
  const token = process.env[`${prefix}_TOKEN`];
  const audience = process.env[`${prefix}_AUDIENCE`];
  if (token) headers.authorization = `Bearer ${token}`;
  if (audience) headers["x-kujo-audience"] = audience;
  return headers;
}

function commandFor(operation: string, params: any, cwd: string): [string, string[]] {
  const entry = (name: string) => process.env[name];
  const requiredEntry = (name: string) => configuredEntrypoint(entry(name), name);
  const cli = (name: string, fallback: string, args: string[]) => [entry(name) || fallback, args] as [string, string[]];
  switch (operation) {
    case "status": return cli("KUJO_BIN", "kujo", ["--version"]);
    case "check": return cli("KUJO_BIN", "kujo", ["check", workspacePath(cwd, params.file)]);
    case "scout": return entry("KUJO_SCOUT_BIN") ? cli("KUJO_SCOUT_BIN", "scout", [workspacePath(cwd, params.path || "."), ...(params.quick ? ["--quick"] : [])]) : cli("KUJO_BIN", "kujo", ["run", requiredEntry("KUJO_SCOUT_ENTRY"), "--", workspacePath(cwd, params.path || "."), ...(params.quick ? ["--quick"] : [])]);
    case "scent": return entry("KUJO_SCENT_BIN") ? cli("KUJO_SCENT_BIN", "scent", ["pack", workspacePath(cwd, params.path || "."), "--task", params.task, "--dry-run", "--json"]) : cli("KUJO_BIN", "kujo", ["run", requiredEntry("KUJO_SCENT_ENTRY"), "--", "pack", workspacePath(cwd, params.path || "."), "--task", params.task, "--dry-run", "--json"]);
    case "review": return cli("KUJO_PATCHBRIEF_BIN", "patchbrief", ["handoff"]);
    case "changebucket": return cli("KUJO_CHANGEBUCKET_BIN", "changebucket", ["report", "--format", "json"]);
    case "shipcheck": return cli("KUJO_SHIPCHECK_BIN", "shipcheck", ["check", "--format", "json"]);
    case "mcp": return cli("KUJO_BIN", "kujo", ["run", requiredEntry("KUJO_MCP_ENTRY"), "--interpreter", "make", workspacePath(cwd, params.path || "."), "--artifacts", workspacePath(cwd, params.artifacts || ".kujo/pi/mcp")]);
    case "rag": return cli("KUJO_BIN", "kujo", ["run", requiredEntry("KUJO_RAG_ENTRY"), "--interpreter", "query", "--question", params.question, ...(params.namespace ? ["--namespace", params.namespace] : [])]);
    case "agents": return cli("KUJO_BIN", "kujo", ["run", requiredEntry("KUJO_AGENTS_SMOKE_ENTRY"), "--interpreter"]);
    case "dispatch": return cli("KUJO_BIN", "kujo", ["run", requiredEntry("KUJO_DISPATCH_ENTRY"), "demo", params.task, "--workflow", params.workflow || "research-report", "--output-root", workspacePath(cwd, params.output || ".kujo/pi/dispatch"), ...(params.confirm ? ["--yes"] : [])]);
    default: throw new Error(`Unsupported Kujo operation: ${operation}`);
  }
}

function commandTarget(command: string, args: string[]) {
  return args[0] === "run" && args[1] ? `${command} run ${args[1]}` : command;
}

export default function kujoPi(pi: ExtensionAPI) {
  const allTools = ["kujo_doctor", "kujo_status", "kujo_check", ...OPTIONAL_TOOLS]
    .filter((name, index, names) => names.indexOf(name) === index);

  pi.registerCommand("kujo", {
    description: "List, enable, or disable Kujo capabilities",
    handler: async (args, ctx) => {
      const requested = args.trim();
      if (!requested) {
        ctx.ui.notify("Kujo tools are available. Use /kujo list or /kujo enable <tool>.", "info");
        return;
      }
      const [action, ...names] = requested.split(/\s+/);
      if (action === "list") {
        ctx.ui.notify(`Kujo tools: ${allTools.join(", ")}`, "info");
        return;
      }
      if (action === "init") {
        if (ctx.isProjectTrusted?.() !== true) {
          ctx.ui.notify("Trust this project in Pi before creating Kujo project files.", "warning");
          return;
        }
        const target = workspacePath(ctx.cwd, ".kujo/pi");
        const readme = workspacePath(ctx.cwd, ".kujo/pi/README.md");
        if (existsSync(readme)) {
          ctx.ui.notify("Kujo project setup already exists; no files were changed.", "info");
          return;
        }
        mkdirSync(target, { recursive: true });
        writeFileSync(readme, "# Kujo Pi project data\n\nThis directory is managed by explicitly enabled Kujo Pi integrations.\n", { flag: "wx" });
        ctx.ui.notify("Initialized .kujo/pi without overwriting existing files.", "info");
        return;
      }
      if (action === "enable" || action === "disable") {
        if (action === "enable" && ctx.isProjectTrusted?.() !== true) {
          ctx.ui.notify("Trust this project in Pi before enabling optional Kujo tools.", "warning");
          return;
        }
        const selected = names.filter((name) => allTools.includes(name));
        const unknown = names.filter((name) => !allTools.includes(name));
        const active = new Set(pi.getActiveTools());
        for (const name of selected) action === "enable" ? active.add(name) : active.delete(name);
        pi.setActiveTools([...active]);
        ctx.ui.notify(`${action}d ${selected.join(", ") || "no tools"}${unknown.length ? `; unknown: ${unknown.join(", ")}` : ""}`, "info");
        return;
      }
      ctx.ui.notify("Usage: /kujo list | /kujo enable <tool> | /kujo disable <tool> | /kujo init", "warning");
    },
  });

  pi.registerTool({
    name: "kujo_tools", label: "Kujo tools",
    description: "List Kujo Pi capabilities and enable optional integrations for this session.",
    parameters: Type.Object({ enable: Type.Optional(Type.Array(shortText("Registered Kujo tool name"), { maxItems: 32, uniqueItems: true })) }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const all = allTools;
      const unknown = (params.enable || []).filter((name: string) => !all.includes(name));
      const enabled = (params.enable || []).filter((name: string) => all.includes(name));
      if (enabled.some((name: string) => OPTIONAL_TOOLS.includes(name)) && ctx.isProjectTrusted?.() !== true) {
        return toolResult({ ok: false, status: "project_untrusted", available: all, active: pi.getActiveTools(), enabled: [], optional: OPTIONAL_TOOLS, unknown, message: "Trust this project in Pi before enabling optional Kujo tools." });
      }
      if (enabled.length) pi.setActiveTools([...new Set([...pi.getActiveTools(), ...enabled])]);
      return toolResult({ available: all, active: pi.getActiveTools(), enabled, optional: OPTIONAL_TOOLS, unknown, note: "Optional tools are inactive until explicitly enabled." });
    },
  });

  const registerKujoCliTool = (name: string, label: string, description: string, parameters: any, operation: string, requiresApproval = false) => {
    pi.registerTool({
      name, label, description, parameters,
      renderResult,
      async execute(_id, params: any, signal, onUpdate, ctx) {
        try {
          const cwd = workspacePath(ctx.cwd, params.workspace || ".");
          const trustError = trustFailure(ctx);
          if (trustError) return trustError;
          const [command, args] = commandFor(operation, { ...params, confirm: params.confirm === true }, cwd);
          const approved = requiresApproval && await approve(ctx, `${label} approval`, `Allow ${commandTarget(command, args)} to run in ${cwd}?`, params.confirm === true);
          if (requiresApproval && !approved) {
            return toolResult({ ok: false, status: "approval_required", message: "No approval was granted." });
          }
          if (approved) {
            const confirmIndex = args.indexOf("--yes");
            if (confirmIndex === -1 && operation === "dispatch") args.push("--yes");
          }
          const result = await exec(pi, command, args, cwd, signal, 120_000, onUpdate);
          recordReceipt(pi, operation, cwd, result);
          return toolResult(result);
        } catch (error) {
          return toolResult({ ok: false, status: "configuration_error", message: String(error) });
        }
      },
    });
  };

  pi.registerTool({
    name: "kujo_doctor", label: "Kujo doctor", description: "Inspect Kujo Pi configuration and local tool availability without running project workflows.",
    parameters: withWorkspace(Type.Object({})),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const trustError = trustFailure(ctx);
      if (trustError) return trustError;
      const workspace = workspacePath(ctx.cwd, params.workspace || ".");
      const binaries = {
        kujo: configuredCommand("KUJO_BIN", "kujo"),
        patchbrief: configuredCommand("KUJO_PATCHBRIEF_BIN", "patchbrief"),
        changebucket: configuredCommand("KUJO_CHANGEBUCKET_BIN", "changebucket"),
        shipcheck: configuredCommand("KUJO_SHIPCHECK_BIN", "shipcheck"),
        runledger: configuredCommand("KUJO_RUNLEDGER_BIN", "runledger"),
      };
      const availability = Object.fromEntries(await Promise.all(Object.entries(binaries).map(async ([name, binary]) => [
        name, { command: binary, ...(await exec(pi, binary, ["--version"], workspace, signal, 10_000) as any) },
      ]))) as Record<string, unknown>;
      const kujoResult: any = availability.kujo;
      const actualVersion = versionFromOutput(kujoResult.output || "");
      const minimumText = process.env.KUJO_PI_MIN_KUJO_VERSION;
      const minimumVersion = minimumText ? versionFromOutput(minimumText) : null;
      return toolResult({
        ok: true,
        workspace,
        projectTrusted: ctx.isProjectTrusted?.() ?? "unknown",
        availability,
        compatibility: {
          actualVersion,
          minimumVersion,
          meetsMinimum: meetsMinimumVersion(actualVersion, minimumVersion),
          configuration: minimumText ? "KUJO_PI_MIN_KUJO_VERSION" : "not configured",
        },
        network: {
          watchdog: Boolean(process.env.KUJO_WATCHDOG_URL),
          leash: Boolean(process.env.KUJO_LEASH_URL && process.env.KUJO_LEASH_TOKEN),
        },
        entrypoints: {
          scout: process.env.KUJO_SCOUT_BIN || process.env.KUJO_SCOUT_ENTRY || "not configured",
          scent: process.env.KUJO_SCENT_BIN || process.env.KUJO_SCENT_ENTRY || "not configured",
          mcp: process.env.KUJO_MCP_ENTRY || "not configured",
          dispatch: process.env.KUJO_DISPATCH_ENTRY || "not configured",
          agents: process.env.KUJO_AGENTS_SMOKE_ENTRY || "not configured",
          rag: process.env.KUJO_RAG_ENTRY || "not configured",
        },
      });
    },
  });

  registerKujoCliTool("kujo_status", "Kujo status", "Check that the Kujo CLI is installed.", withWorkspace(Type.Object({})), "status");
  registerKujoCliTool("kujo_check", "Kujo check", "Validate a Kujo source file without changing it.", withWorkspace(Type.Object({ file: shortText("Kujo source path inside the selected workspace") })), "check");
  registerKujoCliTool("kujo_scout", "Kujo Scout", "Create a repository intelligence report.", withWorkspace(Type.Object({ path: optionalWorkspacePath("Repository path inside the selected workspace"), quick: Type.Optional(Type.Boolean()) })), "scout");
  registerKujoCliTool("kujo_scent", "Kujo Scent", "Prepare scoped context with provenance and redaction metadata.", withWorkspace(Type.Object({ task: taskText("Task to scope the context pack around"), path: optionalWorkspacePath("Repository path inside the selected workspace") })), "scent");
  registerKujoCliTool("kujo_review_changes", "Kujo review changes", "Generate a PatchBrief handoff for current changes.", withWorkspace(Type.Object({})), "review");
  registerKujoCliTool("kujo_changebucket", "Kujo ChangeBucket", "Measure current change footprint and blast radius.", withWorkspace(Type.Object({})), "changebucket");
  registerKujoCliTool("kujo_shipcheck", "Kujo ShipCheck", "Run release-readiness checks; use only when explicitly requested.", withWorkspace(Type.Object({ confirm: Type.Optional(Type.Boolean()) })), "shipcheck", true);
  registerKujoCliTool("kujo_mcp_make", "Kujo MCP make", "Generate a guarded, repo-specific MCP server and review artifacts.", withWorkspace(Type.Object({ path: optionalWorkspacePath("Repository path inside the selected workspace"), artifacts: optionalWorkspacePath("Artifact directory inside the selected workspace"), confirm: Type.Optional(Type.Boolean()) })), "mcp", true);
  registerKujoCliTool("kujo_agents_smoke", "Kujo Agents SDK smoke", "Run the deterministic offline Agents SDK example suite.", withWorkspace(Type.Object({ confirm: Type.Optional(Type.Boolean()) })), "agents", true);
  registerKujoCliTool("kujo_rag_query", "Kujo RAG query", "Query a configured local Kujo RAG index and return citations.", withWorkspace(Type.Object({ question: taskText("Question for the configured RAG index"), namespace: Type.Optional(shortText("RAG namespace")) })), "rag");
  registerKujoCliTool("kujo_dispatch_run", "Kujo Dispatch run", "Run a resumable, reviewable Dispatch workflow after explicit approval.", withWorkspace(Type.Object({ task: taskText("Task for the Dispatch workflow"), workflow: Type.Optional(shortText("Dispatch workflow name")), output: optionalWorkspacePath("Dispatch output directory inside the selected workspace"), confirm: Type.Optional(Type.Boolean()) })), "dispatch", true);

  pi.registerTool({
    name: "kujo_runledger", label: "Kujo RunLedger", description: "Start or finish a local RunLedger receipt using the installed RunLedger CLI.",
    parameters: withWorkspace(Type.Union([
      Type.Object({ action: Type.Literal("start"), task: Type.Optional(taskText("Task associated with the run")), provider: Type.Optional(shortText("Model provider")), model: Type.Optional(shortText("Model name")) }),
      Type.Object({ action: Type.Literal("finish"), runId: Type.String({ minLength: 1, maxLength: 96, pattern: "^[a-zA-Z0-9._-]+$" }), status: Type.Optional(shortText("Final run status")), verdict: Type.Optional(taskText("Final run verdict")) }),
    ])),
    renderResult,
    async execute(_id, params: any, signal, _onUpdate, ctx) {
      const trustError = trustFailure(ctx);
      if (trustError) return trustError;
      try {
        const cwd = workspacePath(ctx.cwd, params.workspace || ".");
        const args = params.action === "start"
          ? ["start", "--provider", params.provider || "unknown", "--model", params.model || "unknown", "--task", params.task || "Pi task", "--repo", cwd]
          : ["finish", params.runId, "--status", params.status || "partial", "--verdict", params.verdict || "Pi session finished", "--repo", cwd];
        const result = await exec(pi, process.env.KUJO_RUNLEDGER_BIN || "runledger", args, cwd, signal, 120_000, _onUpdate);
        recordReceipt(pi, "runledger", cwd, result);
        return toolResult(result);
      } catch (error) {
        return toolResult({ ok: false, status: "configuration_error", message: String(error) });
      }
    },
  });

  pi.registerTool({
    name: "kujo_watchdog", label: "Kujo Watchdog", description: "Read optional local Watchdog telemetry; network calls require an explicit configured URL.",
    parameters: Type.Object({ path: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048, pattern: "^/", description: "Absolute path on the configured Watchdog origin" })) }),
    renderResult,
    async execute(_id, params: any, signal, _onUpdate, ctx) {
      const trustError = trustFailure(ctx);
      if (trustError) return trustError;
      const base = process.env.KUJO_WATCHDOG_URL;
      if (!base) return toolResult({ ok: false, status: "not_configured", message: "Set KUJO_WATCHDOG_URL to opt into Watchdog telemetry." });
      try {
        const endpoint = sameOriginUrl(base, params.path || "/health");
        const response = await fetchWithRetry((requestSignal) => fetch(endpoint, { signal: requestSignal, redirect: "error", headers: serviceHeaders("KUJO_WATCHDOG") }), signal);
        const result = { ok: response.ok, status: response.status >= 500 ? "remote_failure" : response.ok ? "success" : "remote_rejected", code: response.status, body: await boundedResponse(response) };
        recordReceipt(pi, "watchdog", ctx.cwd, result);
        return toolResult(result);
      } catch (error) {
        const result = errorResult(error);
        recordReceipt(pi, "watchdog", ctx.cwd, result);
        return toolResult(result);
      }
    },
  });

  pi.registerTool({
    name: "kujo_leash_approval", label: "Kujo Leash approval", description: "Send an explicit approval request to a configured local Leash daemon.",
    parameters: Type.Object({ event: Type.Record(Type.String({ minLength: 1, maxLength: 256 }), Type.Unknown()), confirm: Type.Optional(Type.Boolean()) }),
    renderResult,
    async execute(_id, params: any, signal, _onUpdate, ctx) {
      const trustError = trustFailure(ctx);
      if (trustError) return trustError;
      if (!(await approve(ctx, "Leash approval", "Send this approval request to the configured Leash daemon?", params.confirm === true))) return toolResult({ ok: false, status: "approval_required" });
      const base = process.env.KUJO_LEASH_URL;
      const token = process.env.KUJO_LEASH_TOKEN;
      if (!base || !token) return toolResult({ ok: false, status: "not_configured", message: "Set KUJO_LEASH_URL and KUJO_LEASH_TOKEN to opt into Leash." });
      try {
        const headers = { ...serviceHeaders("KUJO_LEASH"), authorization: `Bearer ${token}`, "content-type": "application/json" };
        const response = await fetch(sameOriginUrl(base, "/v1/intervention-events"), { method: "POST", signal: requestSignal(signal), redirect: "error", headers, body: boundedJson(params.event) });
        const result = { ok: response.ok, status: response.status >= 500 ? "remote_failure" : response.ok ? "success" : "remote_rejected", code: response.status, body: await boundedResponse(response) };
        recordReceipt(pi, "leash", ctx.cwd, result);
        return toolResult(result);
      } catch (error) {
        const result = errorResult(error);
        recordReceipt(pi, "leash", ctx.cwd, result);
        return toolResult(result);
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("kujo", "Kujo: opt-in tools available");
    const active = pi.getActiveTools();
    pi.setActiveTools(active.filter((name) => !OPTIONAL_TOOLS.includes(name)));
  });
}
