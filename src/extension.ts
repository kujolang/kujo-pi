import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Type } from "typebox";
import { CAPABILITIES, CAPABILITY_PACKS, OPTIONAL_TOOLS, capabilityByTool, capabilitySummaries, expandCapabilitySelection } from "./capabilities.mjs";
import { boundedJson, boundedResponse, commandResult, configuredEntrypoint, errorResult, fetchWithRetry, meetsMinimumVersion, requestSignal, sameOriginUrl, versionFromOutput, workspacePath } from "./core.mjs";
import { APPROVAL_SCHEMA_VERSION, RECEIPT_SCHEMA_VERSION, createOperationDescriptor, digestArtifacts, sha256, versionedResult, workspaceDigest } from "./contracts.mjs";
import { findExecutable, inspectIntegrations, integrationById } from "./registry.mjs";
import { presentResult } from "./presentation.mjs";
import { operationArguments, operationContract } from "./operations.mjs";
import { PiTelemetryBridge } from "./telemetry.mjs";

async function exec(pi: ExtensionAPI, command: string, args: string[], cwd: string, signal?: AbortSignal, timeout = 120_000, onUpdate?: (result: any) => void) {
  const publishUpdate = (value: unknown) => { if (typeof onUpdate === "function") onUpdate(toolResult(value)); };
  publishUpdate({ ok: true, status: "running", label: command });
  if (onUpdate) return runStreamingCommand(command, args, cwd, signal, timeout, onUpdate);
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

export function runStreamingCommand(command: string, args: string[], cwd: string, signal: AbortSignal | undefined, timeout: number, onUpdate: (result: any) => void) {
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

function toolResult(value: unknown, operationId: string | null = null) {
  const details = versionedResult(value, operationId);
  return { content: [{ type: "text" as const, text: text(details) }], details };
}

function renderResult(result: any, options: any, theme: any) {
  const view = presentResult(result.details || {});
  if (!options.expanded) return new Text(theme.fg(view.tone, view.summary), 0, 0);
  return new Text(`${theme.fg(view.tone, view.summary)}\n${theme.fg("toolOutput", view.output)}`, 0, 0);
}

function recordReceipt(pi: ExtensionAPI, operation: string, workspace: string, result: any, descriptor?: any) {
  if (process.env.KUJO_PI_RECEIPTS !== "1") return;
  pi.appendEntry("kujo-receipt", {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    operationId: descriptor?.operationId || `op_${sha256(`${operation}:${workspace}:${Date.now()}`)}`,
    operation,
    workspaceHash: workspaceDigest(workspace),
    ok: result.ok,
    status: result.status,
    code: result.code ?? null,
    durationMs: result.durationMs ?? null,
    revision: descriptor?.revision ?? null,
    argumentsDigest: descriptor?.argumentsDigest ?? null,
    artifactDigest: digestArtifacts(descriptor?.outputRoot),
    recordedAt: new Date().toISOString(),
  });
}

async function approve(pi: ExtensionAPI, ctx: any, title: string, descriptor: any, requested: boolean) {
  const message = [
    `Operation: ${descriptor.operation}`,
    `Command: ${descriptor.command}`,
    `Entrypoint: ${descriptor.entrypoint || "none"}`,
    `Workspace: ${descriptor.workspace}`,
    `Revision: ${descriptor.revision || "unversioned"}`,
    `Arguments digest: ${descriptor.argumentsDigest}`,
    `Payload digest: ${descriptor.payloadDigest}`,
    `Output: ${descriptor.outputRoot || "none"}`,
  ].join("\n");
  const approved = ctx.hasUI ? await ctx.ui.confirm(title, message) : requested;
  if (approved) {
    pi.appendEntry("kujo-approval", {
      ...descriptor,
      schemaVersion: APPROVAL_SCHEMA_VERSION,
      approvalSource: ctx.hasUI ? "interactive_ui" : "trusted_headless_confirm",
      approvedAt: new Date().toISOString(),
    });
  }
  return approved;
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

function integrationTarget(registry: ReturnType<typeof inspectIntegrations> | null, id: string) {
  const integration = registry ? integrationById(registry, id) : null;
  if (!integration?.available) return null;
  if (integration.binaryPath) return { mode: "binary", path: integration.binaryPath };
  if (integration.entrypointPath) return { mode: "entrypoint", path: integration.entrypointPath };
  return null;
}

function commandFor(operation: string, params: any, cwd: string, registry: ReturnType<typeof inspectIntegrations> | null): [string, string[]] {
  const entry = (name: string) => process.env[name];
  const requiredEntry = (name: string) => configuredEntrypoint(entry(name), name);
  const cli = (name: string, fallback: string, args: string[]) => [entry(name) || fallback, args] as [string, string[]];
  const kujo = findExecutable(entry("KUJO_BIN") || "kujo") || entry("KUJO_BIN") || "kujo";
  const resolved = (id: string, binaryEnv: string, entryEnv: string, binaryArgs: string[], entryArgs: string[]) => {
    const overrideBinary = entry(binaryEnv);
    if (overrideBinary) return [overrideBinary, binaryArgs] as [string, string[]];
    if (entry(entryEnv)) return [kujo, ["run", requiredEntry(entryEnv), ...entryArgs]] as [string, string[]];
    const target = integrationTarget(registry, id);
    if (target?.mode === "binary") return [target.path, binaryArgs] as [string, string[]];
    if (target?.mode === "entrypoint") return [kujo, ["run", target.path, ...entryArgs]] as [string, string[]];
    const declared = registry ? integrationById(registry, id) : null;
    if (declared?.command && ["patchbrief", "changebucket", "shipcheck", "runledger"].includes(id)) {
      return [declared.command, binaryArgs] as [string, string[]];
    }
    throw new Error(`No verified ${id} integration found; set ${binaryEnv}, ${entryEnv}, or KUJO_ECOSYSTEM_ROOT`);
  };
  switch (operation) {
    case "status": return cli("KUJO_BIN", "kujo", ["--version"]);
    case "check": return cli("KUJO_BIN", "kujo", ["check", workspacePath(cwd, params.file)]);
    default: {
      const contract = operationContract(operation);
      if (!contract) throw new Error(`Unsupported Kujo operation: ${operation}`);
      const args = operationArguments(operation, params, cwd);
      return resolved(contract.integration, contract.binaryEnvironment, contract.entrypointEnvironment, args.binary, args.entrypoint);
    }
  }
}

function commandTarget(command: string, args: string[]) {
  return args[0] === "run" && args[1] ? `${command} run ${args[1]}` : command;
}

function outputRootFor(operation: string, params: any, cwd: string) {
  if (operation === "dispatch") return workspacePath(cwd, params.output || ".kujo/pi/dispatch");
  if (operation === "mcp") return workspacePath(cwd, params.artifacts || ".kujo/pi/mcp");
  return null;
}

async function workspaceRevision(pi: ExtensionAPI, cwd: string) {
  try {
    const result = await pi.exec("git", ["rev-parse", "HEAD"], { cwd, timeout: 5_000 });
    return result.code === 0 && /^[a-f0-9]{40,64}$/i.test(result.stdout.trim()) ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

export default function kujoPi(pi: ExtensionAPI) {
  const telemetry = new PiTelemetryBridge();
  let registry: ReturnType<typeof inspectIntegrations> | null = null;
  let registryError: string | null = null;
  try {
    registry = inspectIntegrations();
  } catch (error) {
    registryError = String(error);
  }
  const allTools = CAPABILITIES.map(({ tool }) => tool);
  const stateType = "kujo-tools-state";
  const persistActiveTools = () => {
    pi.appendEntry(stateType, {
      schemaVersion: "kujo.pi.tools-state.v1",
      active: pi.getActiveTools().filter((name) => OPTIONAL_TOOLS.includes(name)),
    });
  };
  const restoreActiveTools = (ctx: any) => {
    const entries = ctx.sessionManager?.getBranch?.() || [];
    const saved = [...entries].reverse().find((entry: any) => entry.type === "custom" && entry.customType === stateType);
    const restored = Array.isArray(saved?.data?.active)
      ? saved.data.active.filter((name: unknown) => typeof name === "string" && OPTIONAL_TOOLS.includes(name))
      : [];
    const nonOptional = pi.getActiveTools().filter((name) => !OPTIONAL_TOOLS.includes(name));
    pi.setActiveTools([...new Set([...nonOptional, ...restored])]);
  };
  const promptHints = (name: string) => {
    const capability = capabilityByTool(name);
    return capability ? {
      promptSnippet: capability.prompt,
      promptGuidelines: [
        `${capability.label}: ${capability.sideEffect}.`,
        capability.approval ? "Obtain explicit user approval before execution." : "Use only when it directly supports the user's request.",
      ],
    } : {};
  };

  pi.registerCommand("kujo", {
    description: "List, enable, or disable Kujo capabilities",
    getArgumentCompletions: (prefix) => {
      const options = [
        ["list", "List every capability"], ["packs", "List task-oriented packs"], ["active", "Show active tools"],
        ["setup", "Check local integration readiness"], ["enable", "Enable a tool or pack"], ["disable", "Disable a tool or pack"],
        ["init", "Create the local .kujo/pi directory"],
      ];
      const [action, partial = ""] = prefix.split(/\s+/, 2);
      if (action === "enable" || action === "disable") {
        return [...CAPABILITY_PACKS.map(({ id, description }) => ({ value: `${action} ${id}`, label: id, description })),
          ...CAPABILITIES.map(({ tool, prompt }) => ({ value: `${action} ${tool}`, label: tool, description: prompt }))]
          .filter(({ label }) => label.startsWith(partial));
      }
      return options.filter(([value]) => value.startsWith(prefix)).map(([value, description]) => ({ value, label: value, description }));
    },
    handler: async (args, ctx) => {
      const requested = args.trim();
      if (!requested) {
        ctx.ui.notify("Kujo is ready. Use /kujo setup, /kujo packs, or /kujo enable <pack>.", "info");
        return;
      }
      const [action, ...names] = requested.split(/\s+/);
      if (action === "list") {
        ctx.ui.notify(CAPABILITIES.map(({ tool, pack, defaultActive }) => `${tool} [${pack}; ${defaultActive ? "active" : "opt-in"}]`).join("\n"), "info");
        return;
      }
      if (action === "packs") {
        ctx.ui.notify(CAPABILITY_PACKS.map(({ id, description, tools }) => `${id}: ${description} (${tools.join(", ")})`).join("\n"), "info");
        return;
      }
      if (action === "setup") {
        const available = registry?.integrations.filter((integration: any) => integration.available).map((integration: any) => integration.id) || [];
        const total = registry?.integrations.length || 0;
        const next = available.length ? "/kujo packs, then /kujo enable <pack>" : "Install Kujo integrations or set KUJO_ECOSYSTEM_ROOT, then run /kujo setup again";
        ctx.ui.notify(`Kujo setup: signed registry ${registry?.signatureVerified ? "verified" : "unavailable"}; ${available.length}/${total} local integrations ready. Next: ${next}.`, registry ? "info" : "warning");
        return;
      }
      if (action === "active") {
        ctx.ui.notify(`Active Kujo tools: ${pi.getActiveTools().filter((name) => allTools.includes(name)).join(", ") || "none"}`, "info");
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
        const { tools: selected, packs, unknown } = expandCapabilitySelection(names);
        const active = new Set(pi.getActiveTools());
        for (const name of selected) action === "enable" ? active.add(name) : active.delete(name);
        pi.setActiveTools([...active]);
        persistActiveTools();
        const packText = packs.length ? ` pack${packs.length === 1 ? "" : "s"} ${packs.join(", ")};` : "";
        ctx.ui.notify(`${action}d${packText} ${selected.join(", ") || "no tools"}${unknown.length ? `; unknown: ${unknown.join(", ")}` : ""}`, "info");
        return;
      }
      ctx.ui.notify("Usage: /kujo setup | /kujo packs | /kujo list | /kujo active | /kujo enable <tool|pack> | /kujo disable <tool|pack> | /kujo init", "warning");
    },
  });

  pi.registerTool({
    name: "kujo_tools", label: "Kujo tools",
    description: "List Kujo Pi capabilities and enable optional integrations for this session.",
    promptSnippet: "Discover Kujo capabilities and enable a task-oriented pack when the user asks for it.",
    promptGuidelines: ["Keep optional Kujo tools inactive until they directly support the user's request."],
    parameters: Type.Object({ enable: Type.Optional(Type.Array(shortText("Registered Kujo tool name or capability pack"), { maxItems: 32, uniqueItems: true })) }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const all = allTools;
      const { tools: enabled, packs, unknown } = expandCapabilitySelection(params.enable || []);
      if (enabled.some((name: string) => OPTIONAL_TOOLS.includes(name)) && ctx.isProjectTrusted?.() !== true) {
        return toolResult({ ok: false, status: "project_untrusted", available: all, active: pi.getActiveTools(), enabled: [], optional: OPTIONAL_TOOLS, unknown, message: "Trust this project in Pi before enabling optional Kujo tools." });
      }
      if (enabled.length) {
        pi.setActiveTools([...new Set([...pi.getActiveTools(), ...enabled])]);
        persistActiveTools();
      }
      return toolResult({ capabilities: capabilitySummaries(), packs: CAPABILITY_PACKS, available: all, active: pi.getActiveTools(), enabled, enabledPacks: packs, optional: OPTIONAL_TOOLS, unknown, note: "Optional tools are inactive until explicitly enabled." });
    },
  });

  const registerKujoCliTool = (name: string, label: string, description: string, parameters: any, operation: string, requiresApproval = false) => {
    pi.registerTool({
      name, label, description, parameters, ...promptHints(name),
      renderResult,
      async execute(_id, params: any, signal, onUpdate, ctx) {
        try {
          const cwd = workspacePath(ctx.cwd, params.workspace || ".");
          const trustError = trustFailure(ctx);
          if (trustError) return trustError;
          const [command, args] = commandFor(operation, { ...params, confirm: params.confirm === true }, cwd, registry);
          const descriptor = createOperationDescriptor({
            operation,
            command: findExecutable(command) || command,
            args,
            workspace: cwd,
            revision: await workspaceRevision(pi, cwd),
            entrypoint: args[0] === "run" && args[1] ? args[1] : null,
            outputRoot: outputRootFor(operation, params, cwd),
            payload: params,
          });
          const approved = requiresApproval && await approve(pi, ctx, `${label} approval`, descriptor, params.confirm === true);
          if (requiresApproval && !approved) {
            return toolResult({ ok: false, status: "approval_required", message: "No approval was granted." }, descriptor.operationId);
          }
          if (approved) {
            const confirmIndex = args.indexOf("--yes");
            if (confirmIndex === -1 && operation === "dispatch") args.push("--yes");
          }
          const result = await exec(pi, command, args, cwd, signal, 120_000, onUpdate);
          recordReceipt(pi, operation, cwd, result, descriptor);
          return toolResult(result, descriptor.operationId);
        } catch (error) {
          return toolResult({ ok: false, status: "configuration_error", message: String(error) });
        }
      },
    });
  };

  pi.registerTool({
    name: "kujo_doctor", label: "Kujo doctor", description: "Inspect Kujo Pi configuration and local tool availability without running project workflows.", ...promptHints("kujo_doctor"),
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
        name, name !== "kujo" && integrationTarget(registry, name)
          ? { command: integrationTarget(registry, name)?.path, ok: true, status: "success", label: integrationTarget(registry, name)?.path, output: "Verified by the signed integration registry." }
          : { command: binary, ...(await exec(pi, binary, ["--version"], workspace, signal, 10_000) as any) },
      ]))) as Record<string, unknown>;
      const kujoResult: any = availability.kujo;
      const actualVersion = versionFromOutput(kujoResult.output || "");
      const minimumText = process.env.KUJO_PI_MIN_KUJO_VERSION;
      const minimumVersion = minimumText ? versionFromOutput(minimumText) : null;
      const minimumSatisfied = meetsMinimumVersion(actualVersion, minimumVersion);
      const servicePolicy = (name: string, base: string | undefined, healthPath: string, needsToken = false) => {
        if (!base) return { configured: false, status: "not_configured", remediation: null };
        if (needsToken && !process.env[`${name}_TOKEN`]) return { configured: true, status: "missing_token", remediation: `Set ${name}_TOKEN from the host secret manager.` };
        try {
          sameOriginUrl(base, healthPath);
          return { configured: true, status: "policy_ready", remediation: null };
        } catch (error) {
          return { configured: true, status: "policy_rejected", remediation: `Fix ${name}_URL: ${String(error)}` };
        }
      };
      const network = {
        watchdog: servicePolicy("KUJO_WATCHDOG", process.env.KUJO_WATCHDOG_URL, "/healthz"),
        leash: servicePolicy("KUJO_LEASH", process.env.KUJO_LEASH_URL, "/health", true),
      };
      const registrySummary = registry ? registry.integrations.map(({ id, version, capabilities, source, binaryPath, entrypointPath, actualSha256, checksumVerified, available }: any) => ({
        id, version, capabilities, source, path: binaryPath || entrypointPath, actualSha256, checksumVerified, available,
        remediation: available ? null : `Install ${id}, set its documented environment override, or set KUJO_ECOSYSTEM_ROOT to a matching signed registry checkout.`,
      })) : [];
      const remediations = [
        ...Object.entries(availability)
          .filter(([, value]: any) => !value.ok)
          .map(([name, value]: any) => ({ name, status: value.status, command: value.label, fix: `Install ${name} on PATH or set its documented KUJO_*_BIN override.`, detail: value.output || value.message || null })),
        ...(minimumSatisfied === false ? [{ name: "kujo", status: "unsupported_version", fix: `Upgrade KUJO_BIN to Kujo ${minimumText} or newer.`, detail: kujoResult.output || null }] : []),
        ...registrySummary.filter(({ available }: any) => !available).map(({ id, remediation }: any) => ({ name: id, status: "integration_unavailable", fix: remediation })),
        ...Object.entries(network).filter(([, state]) => state.remediation).map(([name, state]) => ({ name, status: state.status, fix: state.remediation })),
        ...(!registry ? [{ name: "integration_registry", status: "signature_invalid", fix: "Restore the packaged signed registry or configure absolute registry, signature, and public-key paths.", detail: registryError }] : []),
      ];
      return toolResult({
        ok: true,
        status: remediations.length === 0 ? "ready" : "needs_configuration",
        workspace,
        projectTrusted: ctx.isProjectTrusted?.() ?? "unknown",
        availability,
        compatibility: {
          actualVersion,
          minimumVersion,
          meetsMinimum: minimumSatisfied,
          configuration: minimumText ? "KUJO_PI_MIN_KUJO_VERSION" : "not configured",
          remediation: minimumSatisfied === false ? `Upgrade KUJO_BIN to Kujo ${minimumText} or newer.` : null,
        },
        network,
        registry: registry ? {
          schemaVersion: registry.schemaVersion,
          registryVersion: registry.registryVersion,
          signatureVerified: registry.signatureVerified,
          issuedAt: registry.issuedAt,
          ecosystemRoot: registry.ecosystemRoot,
          integrations: registrySummary,
        } : { signatureVerified: false, error: registryError, remediation: "Restore the packaged signed registry or configure absolute registry, signature, and public-key paths." },
        remediations,
        entrypoints: {
          scout: integrationTarget(registry, "scout")?.path || process.env.KUJO_SCOUT_BIN || process.env.KUJO_SCOUT_ENTRY || "not configured",
          scent: integrationTarget(registry, "scent")?.path || process.env.KUJO_SCENT_BIN || process.env.KUJO_SCENT_ENTRY || "not configured",
          mcp: integrationTarget(registry, "mcp")?.path || process.env.KUJO_MCP_ENTRY || "not configured",
          dispatch: integrationTarget(registry, "dispatch")?.path || process.env.KUJO_DISPATCH_ENTRY || "not configured",
          agents: integrationTarget(registry, "agents")?.path || process.env.KUJO_AGENTS_SMOKE_ENTRY || "not configured",
          rag: integrationTarget(registry, "rag")?.path || process.env.KUJO_RAG_ENTRY || "not configured",
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
    name: "kujo_runledger", label: "Kujo RunLedger", description: "Start or finish a local RunLedger receipt using the installed RunLedger CLI.", ...promptHints("kujo_runledger"),
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
        const command = integrationTarget(registry, "runledger")?.path || process.env.KUJO_RUNLEDGER_BIN || "runledger";
        const descriptor = createOperationDescriptor({ operation: "runledger", command, args, workspace: cwd, revision: await workspaceRevision(pi, cwd), payload: params });
        const result = await exec(pi, command, args, cwd, signal, 120_000, _onUpdate);
        recordReceipt(pi, "runledger", cwd, result, descriptor);
        return toolResult(result, descriptor.operationId);
      } catch (error) {
        return toolResult({ ok: false, status: "configuration_error", message: String(error) });
      }
    },
  });

  pi.registerTool({
    name: "kujo_watchdog", label: "Kujo Watchdog", description: "Read optional local Watchdog telemetry; network calls require an explicit configured URL.", ...promptHints("kujo_watchdog"),
    parameters: Type.Object({ path: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048, pattern: "^/", description: "Absolute path on the configured Watchdog origin" })) }),
    renderResult,
    async execute(_id, params: any, signal, _onUpdate, ctx) {
      const trustError = trustFailure(ctx);
      if (trustError) return trustError;
      const base = process.env.KUJO_WATCHDOG_URL;
      if (!base) return toolResult({ ok: false, status: "not_configured", message: "Set KUJO_WATCHDOG_URL to opt into Watchdog telemetry." });
      try {
        const endpoint = sameOriginUrl(base, params.path || "/healthz");
        const response = await fetchWithRetry((requestSignal) => fetch(endpoint, { signal: requestSignal, redirect: "error", headers: serviceHeaders("KUJO_WATCHDOG") }), signal);
        const result = { ok: response.ok, status: response.status >= 500 ? "remote_failure" : response.ok ? "success" : "remote_rejected", code: response.status, body: await boundedResponse(response) };
        const descriptor = createOperationDescriptor({ operation: "watchdog", command: endpoint.href, args: [], workspace: ctx.cwd, payload: { path: params.path || "/healthz" } });
        recordReceipt(pi, "watchdog", ctx.cwd, result, descriptor);
        return toolResult(result, descriptor.operationId);
      } catch (error) {
        const result = errorResult(error);
        recordReceipt(pi, "watchdog", ctx.cwd, result);
        return toolResult(result);
      }
    },
  });

  pi.registerTool({
    name: "kujo_leash_approval", label: "Kujo Leash approval", description: "Send an explicit approval request to a configured local Leash daemon.", ...promptHints("kujo_leash_approval"),
    parameters: Type.Object({ event: Type.Record(Type.String({ minLength: 1, maxLength: 256 }), Type.Unknown()), confirm: Type.Optional(Type.Boolean()) }),
    renderResult,
    async execute(_id, params: any, signal, _onUpdate, ctx) {
      const trustError = trustFailure(ctx);
      if (trustError) return trustError;
      const base = process.env.KUJO_LEASH_URL;
      const token = process.env.KUJO_LEASH_TOKEN;
      if (!base || !token) return toolResult({ ok: false, status: "not_configured", message: "Set KUJO_LEASH_URL and KUJO_LEASH_TOKEN to opt into Leash." });
      try {
        const endpoint = sameOriginUrl(base, "/v1/intervention-events");
        const descriptor = createOperationDescriptor({ operation: "leash", command: endpoint.href, args: [], workspace: ctx.cwd, payload: params.event });
        if (!(await approve(pi, ctx, "Leash approval", descriptor, params.confirm === true))) return toolResult({ ok: false, status: "approval_required" }, descriptor.operationId);
        const headers = { ...serviceHeaders("KUJO_LEASH"), authorization: `Bearer ${token}`, "content-type": "application/json" };
        const response = await fetch(endpoint, { method: "POST", signal: requestSignal(signal), redirect: "error", headers, body: boundedJson(params.event) });
        const result = { ok: response.ok, status: response.status >= 500 ? "remote_failure" : response.ok ? "success" : "remote_rejected", code: response.status, body: await boundedResponse(response) };
        recordReceipt(pi, "leash", ctx.cwd, result, descriptor);
        return toolResult(result, descriptor.operationId);
      } catch (error) {
        const result = errorResult(error);
        recordReceipt(pi, "leash", ctx.cwd, result);
        return toolResult(result);
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("kujo", "Kujo: opt-in tools available");
    restoreActiveTools(ctx);
    await telemetry.startSession({
      sessionId: ctx.sessionManager.getSessionId(),
      workspace: ctx.cwd,
      provider: ctx.model?.provider,
      model: ctx.model?.id,
      trusted: ctx.isProjectTrusted?.() === true,
    });
  });

  pi.on("session_tree", (_event, ctx) => { restoreActiveTools(ctx); });

  pi.on("before_agent_start", async () => { await telemetry.startRun(); });
  pi.on("agent_start", () => { telemetry.agentStart(); });
  pi.on("agent_end", (event: any) => { telemetry.agentEnd(event.willRetry === true); });
  pi.on("agent_settled", async () => { await telemetry.finishRun("success"); });
  pi.on("turn_start", (event) => { telemetry.turnStart(event.turnIndex, event.timestamp); });
  pi.on("turn_end", (event) => { telemetry.turnEnd(event.turnIndex, event.message); });
  pi.on("tool_execution_start", (event) => { telemetry.toolStart(event.toolCallId, event.toolName); });
  pi.on("tool_execution_end", (event) => { telemetry.toolEnd(event.toolCallId, event.toolName, event.isError); });
  pi.on("user_bash", (event) => { telemetry.userBash(event.command, event.excludeFromContext); });
  pi.on("model_select", (event) => { telemetry.modelSelect(event.model.provider, event.model.id, event.source); });
  pi.on("before_provider_headers", (event, ctx) => { telemetry.correlateProviderHeaders(event.headers, ctx.model?.provider || ""); });
  pi.on("session_shutdown", async (event) => { await telemetry.shutdown(event.reason); });
}
