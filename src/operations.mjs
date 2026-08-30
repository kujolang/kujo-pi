// @ts-check
import { workspacePath } from "./core.mjs";

/**
 * Integration command contracts live here so tool registration, discovery, and
 * tests do not each invent a different command surface.
 */
/** @type {Record<string, {integration: string, binaryEnvironment: string, entrypointEnvironment: string}>} */
export const OPERATION_CONTRACTS = {
  scout: { integration: "scout", binaryEnvironment: "KUJO_SCOUT_BIN", entrypointEnvironment: "KUJO_SCOUT_ENTRY" },
  scent: { integration: "scent", binaryEnvironment: "KUJO_SCENT_BIN", entrypointEnvironment: "KUJO_SCENT_ENTRY" },
  review: { integration: "patchbrief", binaryEnvironment: "KUJO_PATCHBRIEF_BIN", entrypointEnvironment: "KUJO_PATCHBRIEF_ENTRY" },
  changebucket: { integration: "changebucket", binaryEnvironment: "KUJO_CHANGEBUCKET_BIN", entrypointEnvironment: "KUJO_CHANGEBUCKET_ENTRY" },
  shipcheck: { integration: "shipcheck", binaryEnvironment: "KUJO_SHIPCHECK_BIN", entrypointEnvironment: "KUJO_SHIPCHECK_ENTRY" },
  mcp: { integration: "mcp", binaryEnvironment: "KUJO_MCP_BIN", entrypointEnvironment: "KUJO_MCP_ENTRY" },
  rag: { integration: "rag", binaryEnvironment: "KUJO_RAG_BIN", entrypointEnvironment: "KUJO_RAG_ENTRY" },
  agents: { integration: "agents", binaryEnvironment: "KUJO_AGENTS_SMOKE_BIN", entrypointEnvironment: "KUJO_AGENTS_SMOKE_ENTRY" },
  dispatch: { integration: "dispatch", binaryEnvironment: "KUJO_DISPATCH_BIN", entrypointEnvironment: "KUJO_DISPATCH_ENTRY" },
};

/** @param {string} operation */
export function operationContract(operation) {
  return OPERATION_CONTRACTS[operation] || null;
}

/** @param {string} operation @param {any} params @param {string} cwd */
export function operationArguments(operation, params, cwd) {
  switch (operation) {
    case "scout": {
      const args = [workspacePath(cwd, params.path || "."), ...(params.quick ? ["--quick"] : [])];
      return { binary: args, entrypoint: ["--", ...args] };
    }
    case "scent": {
      const args = ["pack", workspacePath(cwd, params.path || "."), "--task", params.task, "--dry-run", "--json"];
      return { binary: args, entrypoint: ["--", ...args] };
    }
    case "review": return { binary: ["handoff"], entrypoint: ["--", "handoff"] };
    case "changebucket": return { binary: ["report", "--format", "json"], entrypoint: ["--", "report", "--format", "json"] };
    case "shipcheck": return { binary: ["check", "--format", "json"], entrypoint: ["--", "check", "--format", "json"] };
    case "mcp": return { binary: [], entrypoint: ["--interpreter", "make", workspacePath(cwd, params.path || "."), "--artifacts", workspacePath(cwd, params.artifacts || ".kujo/pi/mcp")] };
    case "rag": return { binary: [], entrypoint: ["--interpreter", "query", "--question", params.question, ...(params.namespace ? ["--namespace", params.namespace] : [])] };
    case "agents": return { binary: [], entrypoint: ["--interpreter"] };
    case "dispatch": return { binary: [], entrypoint: ["demo", params.task, "--workflow", params.workflow || "research-report", "--output-root", workspacePath(cwd, params.output || ".kujo/pi/dispatch"), ...(params.confirm ? ["--yes"] : [])] };
    default: throw new Error(`Unsupported Kujo operation: ${operation}`);
  }
}
