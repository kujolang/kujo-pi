#!/usr/bin/env node
import { inspectIntegrations } from "../src/registry.mjs";
import { createSetupPlan } from "../src/setup.mjs";
import { applySetupPlan } from "../src/setup-install.mjs";

const [action = "plan", pack = "understand", flag, digest, ...rest] = process.argv.slice(2);
try {
  if (!["plan", "apply"].includes(action) || rest.length || (action === "plan" && flag) || (action === "apply" && (flag !== "--approve-plan" || !digest))) {
    throw new Error("Usage: kujo-pi-setup plan PACK | apply PACK --approve-plan DIGEST");
  }
  const plan = createSetupPlan(inspectIntegrations(), pack);
  if (action === "plan") console.log(JSON.stringify(plan, null, 2));
  else {
    const controller = new AbortController();
    process.once("SIGINT", () => controller.abort());
    process.once("SIGTERM", () => controller.abort());
    await applySetupPlan(plan, digest, message => console.error(message), controller.signal);
    const after = inspectIntegrations();
    const missing = plan.packages.filter(p => !after.integrations.find(e => e.id === p.id)?.available);
    if (missing.length) throw new Error(`Installed but not ready: ${missing.map(p => p.id).join(", ")}. Run /kujo setup for diagnostics.`);
    console.log(`Installed ${pack}. Next: ${plan.next}`);
  }
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
