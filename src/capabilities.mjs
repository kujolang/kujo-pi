// @ts-check

export const CAPABILITY_PACKS = [
  {
    id: "understand",
    label: "Understand",
    description: "Map a repository and prepare focused context.",
    tools: ["kujo_scout", "kujo_scent"],
  },
  {
    id: "review",
    label: "Review",
    description: "Summarize changes and measure their footprint.",
    tools: ["kujo_review_changes", "kujo_changebucket"],
  },
  {
    id: "ship",
    label: "Ship",
    description: "Check release readiness and record the run.",
    tools: ["kujo_shipcheck", "kujo_runledger"],
  },
  {
    id: "orchestrate",
    label: "Orchestrate",
    description: "Run approved workflows and deterministic agent fixtures.",
    tools: ["kujo_dispatch_run", "kujo_agents_smoke"],
  },
  {
    id: "extend",
    label: "Extend",
    description: "Generate MCP scaffolds and query configured knowledge.",
    tools: ["kujo_mcp_make", "kujo_rag_query"],
  },
  {
    id: "observe",
    label: "Observe",
    description: "Inspect Watchdog and send approved Leash events.",
    tools: ["kujo_watchdog", "kujo_leash_approval"],
  },
];

export const CAPABILITIES = [
  { tool: "kujo_doctor", label: "Doctor", pack: "core", defaultActive: true, approval: false, sideEffect: "read-only diagnostics", prompt: "Inspect Kujo setup and return actionable fixes." },
  { tool: "kujo_status", label: "Status", pack: "core", defaultActive: true, approval: false, sideEffect: "read-only version probe", prompt: "Check the installed Kujo runtime." },
  { tool: "kujo_check", label: "Check", pack: "core", defaultActive: true, approval: false, sideEffect: "read-only validation", prompt: "Validate a Kujo source file in the trusted workspace." },
  { tool: "kujo_scout", label: "Scout", pack: "understand", defaultActive: false, approval: false, sideEffect: "may write a repository report", prompt: "Map repository structure, dependencies, routes, and risks." },
  { tool: "kujo_scent", label: "Scent", pack: "understand", defaultActive: false, approval: false, sideEffect: "dry-run by default", prompt: "Prepare focused context with provenance and redaction metadata." },
  { tool: "kujo_review_changes", label: "PatchBrief", pack: "review", defaultActive: false, approval: false, sideEffect: "writes a review artifact", prompt: "Create a structured handoff for the current changes." },
  { tool: "kujo_changebucket", label: "ChangeBucket", pack: "review", defaultActive: false, approval: false, sideEffect: "writes a footprint report", prompt: "Measure change footprint and blast radius." },
  { tool: "kujo_shipcheck", label: "ShipCheck", pack: "ship", defaultActive: false, approval: true, sideEffect: "runs project checks", prompt: "Run approved release-readiness checks." },
  { tool: "kujo_runledger", label: "RunLedger", pack: "ship", defaultActive: false, approval: false, sideEffect: "writes local run data", prompt: "Start or finish a local run receipt." },
  { tool: "kujo_dispatch_run", label: "Dispatch", pack: "orchestrate", defaultActive: false, approval: true, sideEffect: "runs a workflow and writes state", prompt: "Run an approved resumable workflow." },
  { tool: "kujo_agents_smoke", label: "Agents SDK", pack: "orchestrate", defaultActive: false, approval: true, sideEffect: "runs deterministic fixtures", prompt: "Run approved offline agent fixtures." },
  { tool: "kujo_mcp_make", label: "MCP", pack: "extend", defaultActive: false, approval: true, sideEffect: "writes generated scaffolding", prompt: "Generate an approved repository-specific MCP scaffold." },
  { tool: "kujo_rag_query", label: "RAG", pack: "extend", defaultActive: false, approval: false, sideEffect: "read-only local query", prompt: "Query configured local knowledge with citations." },
  { tool: "kujo_watchdog", label: "Watchdog", pack: "observe", defaultActive: false, approval: false, sideEffect: "configured-origin network read", prompt: "Inspect configured Watchdog health or telemetry." },
  { tool: "kujo_leash_approval", label: "Leash", pack: "observe", defaultActive: false, approval: true, sideEffect: "writes an approved service event", prompt: "Send an approved intervention event to configured Leash." },
];

export const OPTIONAL_TOOLS = CAPABILITIES.filter(({ defaultActive }) => !defaultActive).map(({ tool }) => tool);
export const CORE_TOOLS = CAPABILITIES.filter(({ defaultActive }) => defaultActive).map(({ tool }) => tool);

/** @param {string} tool */
export function capabilityByTool(tool) {
  return CAPABILITIES.find((capability) => capability.tool === tool) || null;
}

/** @param {string[]} requested */
export function expandCapabilitySelection(requested) {
  const knownTools = new Set(CAPABILITIES.map(({ tool }) => tool));
  const packs = new Map(CAPABILITY_PACKS.map((pack) => [pack.id, pack]));
  const tools = new Set();
  const selectedPacks = [];
  const unknown = [];
  for (const value of requested) {
    if (knownTools.has(value)) {
      tools.add(value);
      continue;
    }
    const pack = packs.get(value);
    if (pack) {
      selectedPacks.push(pack.id);
      for (const tool of pack.tools) tools.add(tool);
      continue;
    }
    unknown.push(value);
  }
  return { tools: [...tools], packs: selectedPacks, unknown };
}

export function capabilitySummaries() {
  return CAPABILITIES.map(({ tool, label, pack, defaultActive, approval, sideEffect }) => ({
    tool,
    label,
    pack,
    default: defaultActive ? "active" : "opt-in",
    approval,
    sideEffect,
  }));
}
