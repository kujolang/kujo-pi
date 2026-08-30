// @ts-check

/** @type {Record<string, string>} */
const GUIDANCE = {
  project_untrusted: "Trust this project in Pi, then retry.",
  dependency_unavailable: "Install the dependency or configure its documented KUJO_* override.",
  configuration_error: "Run kujo_doctor and apply the matching remediation.",
  approval_required: "Review the operation details and approve explicitly before retrying.",
  not_configured: "Run kujo_doctor to see the required configuration.",
  timeout: "Retry with a narrower scope or inspect the underlying command.",
  remote_failure: "Check the configured service and retry when it is healthy.",
  remote_rejected: "Check the service URL, token, audience, and policy.",
  cancelled: "The operation was cancelled; no retry was attempted.",
  needs_configuration: "Apply the Doctor remediations before using unavailable integrations.",
};

const WARNING_STATUSES = new Set(["approval_required", "needs_configuration", "not_configured", "cancelled"]);

/** @param {unknown} value */
function printable(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

/** @param {any} details */
export function presentResult(details) {
  const status = typeof details?.status === "string" ? details.status : details?.ok === false ? "failed" : "success";
  const tone = WARNING_STATUSES.has(status) ? "warning" : details?.ok === false ? "error" : "success";
  const icon = tone === "success" ? "✓" : tone === "warning" ? "!" : "✗";
  const label = details?.label || "Kujo";
  const lines = [];
  const primary = details?.output ?? details?.message ?? details?.body ?? details?.note;
  if (primary !== undefined) lines.push(printable(primary));
  if (Array.isArray(details?.remediations) && details.remediations.length) {
    lines.push("Next fixes:");
    for (const remediation of details.remediations.slice(0, 5)) {
      lines.push(`- ${remediation.name || "Kujo"}: ${remediation.fix || remediation.status || "Review configuration."}`);
    }
    if (details.remediations.length > 5) lines.push(`- ${details.remediations.length - 5} more; expand the structured result for details.`);
  }
  const guidance = GUIDANCE[status];
  if (guidance && !lines.some((line) => line.includes(guidance))) lines.push(`Next: ${guidance}`);
  if (details?.operationId) lines.push(`Operation: ${details.operationId}`);
  return {
    tone,
    summary: `${icon} ${label} · ${status}`,
    output: (lines.join("\n") || "No additional output.").slice(0, 12_000),
  };
}
