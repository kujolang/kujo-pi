import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type CommandSpec = {
  args: string[];
  label: string;
};

const currentDirectory = () => process.cwd();

async function runKujo(pi: ExtensionAPI, spec: CommandSpec, signal?: AbortSignal) {
  const result = await pi.exec("kujo", spec.args, { signal, timeout: 120_000 });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return {
    code: result.code,
    killed: result.killed,
    output: output || `${spec.label} completed without output.`,
  };
}

function resultText(value: Awaited<ReturnType<typeof runKujo>>) {
  const status = value.code === 0 ? "passed" : "failed";
  return `${status} (exit ${value.code})\n\n${value.output}`;
}

export default function kujoPi(pi: ExtensionAPI) {
  pi.registerCommand("kujo", {
    description: "Inspect Kujo capabilities and suggest a focused next action",
    handler: async (args, ctx) => {
      const query = args.trim() || "review this repository";
      ctx.ui.notify(`Kujo is ready for: ${query}`, "info");
    },
  });

  pi.registerTool({
    name: "kujo_status",
    label: "Kujo status",
    description: "Check whether the Kujo CLI is installed and show its version.",
    parameters: Type.Object({}),
    async execute(_id, _params, signal) {
      const value = await runKujo(pi, { args: ["--version"], label: "Kujo status" }, signal);
      return { content: [{ type: "text", text: resultText(value) }], details: value };
    },
  });

  pi.registerTool({
    name: "kujo_check",
    label: "Kujo check",
    description: "Validate a Kujo source file without changing it.",
    parameters: Type.Object({
      file: Type.String({ description: "Repository-relative path to a .kujo file." }),
    }),
    async execute(_id, params, signal) {
      const value = await runKujo(pi, { args: ["check", params.file], label: "Kujo check" }, signal);
      return { content: [{ type: "text", text: resultText(value) }], details: value };
    },
  });

  pi.registerTool({
    name: "kujo_scout",
    label: "Kujo Scout",
    description: "Create a compact, reviewable repository intelligence report.",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Repository-relative path; defaults to the current directory." })),
      quick: Type.Optional(Type.Boolean({ description: "Use Scout's quick profile." })),
    }),
    async execute(_id, params, signal) {
      const target = params.path || currentDirectory();
      const args = ["run", "scout.kujo", "--", target];
      if (params.quick) args.push("--quick");
      const value = await runKujo(pi, { args, label: "Kujo Scout" }, signal);
      return { content: [{ type: "text", text: resultText(value) }], details: value };
    },
  });

  pi.registerTool({
    name: "kujo_scent",
    label: "Kujo Scent",
    description: "Package scoped repository context with provenance and redaction metadata.",
    parameters: Type.Object({
      task: Type.String({ description: "Short description of the work being done." }),
      path: Type.Optional(Type.String({ description: "Repository-relative path; defaults to the current directory." })),
    }),
    async execute(_id, params, signal) {
      const target = params.path || currentDirectory();
      const args = ["run", "scent.kujo", "--", "pack", target, "--task", params.task, "--dry-run", "--json"];
      const value = await runKujo(pi, { args, label: "Kujo Scent" }, signal);
      return { content: [{ type: "text", text: resultText(value) }], details: value };
    },
  });

  pi.registerTool({
    name: "kujo_review_changes",
    label: "Kujo review changes",
    description: "Summarize current changes and suggest tests using PatchBrief.",
    parameters: Type.Object({}),
    async execute(_id, _params, signal) {
      const value = await runKujo(pi, { args: ["run", "patchbrief.kujo", "--", "handoff"], label: "Kujo review changes" }, signal);
      return { content: [{ type: "text", text: resultText(value) }], details: value };
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("kujo", "Kujo: opt-in tools available");
  });
}
