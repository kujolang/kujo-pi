// @ts-check
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { open, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { sameOriginUrl } from "./core.mjs";

export const TELEMETRY_SCHEMA_VERSION = "kujo.telemetry.v1";
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 2_000;
const DEFAULT_TIMEOUT_MS = 2_000;

/** @param {string|undefined} value @param {number} fallback @param {number} minimum @param {number} maximum */
function boundedInteger(value, fallback, minimum, maximum) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

/** @param {NodeJS.ProcessEnv} environment */
export function telemetryConfig(environment = process.env) {
  const mode = environment.KUJO_WATCHDOG_TELEMETRY === "metadata" ? "metadata" : "off";
  const baseUrl = environment.KUJO_WATCHDOG_URL || "";
  const enabled = mode === "metadata" && baseUrl !== "";
  return {
    enabled,
    mode,
    baseUrl,
    token: environment.KUJO_WATCHDOG_TOKEN || "",
    audience: environment.KUJO_WATCHDOG_AUDIENCE || "",
    proxyProvider: environment.KUJO_WATCHDOG_PROXY_PROVIDER || "kujo-watchdog",
    spoolRoot: environment.KUJO_PI_TELEMETRY_SPOOL_DIR || join(homedir(), ".pi", "kujo", "telemetry-spool"),
    maxBytes: boundedInteger(environment.KUJO_PI_TELEMETRY_SPOOL_MAX_BYTES, DEFAULT_MAX_BYTES, 64 * 1024, 100 * 1024 * 1024),
    maxFiles: boundedInteger(environment.KUJO_PI_TELEMETRY_SPOOL_MAX_FILES, DEFAULT_MAX_FILES, 10, 20_000),
    timeoutMs: boundedInteger(environment.KUJO_PI_TELEMETRY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 250, 30_000),
  };
}

/** @param {string} command */
export function classifyCommand(command) {
  const first = command.trim().split(/\s+/, 1)[0]?.replace(/^.*\//, "").toLowerCase() || "";
  if (["git", "gh"].includes(first)) return "source_control";
  if (["npm", "npx", "pnpm", "yarn", "bun", "cargo", "go", "pip", "pipx", "uv", "composer"].includes(first)) return "package_or_build";
  if (["curl", "wget", "ssh", "scp", "rsync"].includes(first)) return "network";
  if (["ls", "find", "rg", "grep", "sed", "awk", "cat", "cp", "mv", "mkdir", "touch"].includes(first)) return "filesystem";
  if (["ps", "kill", "pkill", "top", "htop"].includes(first)) return "process";
  if (["node", "deno", "python", "python3", "ruby", "php", "java", "kujo"].includes(first)) return "runtime";
  return "other";
}

/** @param {string} toolName */
export function toolSpanKind(toolName) {
  return /(bash|shell|terminal|exec|command)/i.test(toolName) ? "shell" : "tool";
}

/** @param {string} value */
function hashText(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** @param {string} workspace @param {Buffer} salt */
export function projectHash(workspace, salt) {
  return createHmac("sha256", salt).update(workspace).digest("hex").slice(0, 32);
}

/** @param {unknown} value */
function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** @param {Record<string, unknown>} attributes */
function cleanAttributes(attributes) {
  return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined && value !== ""));
}

class TelemetrySpool {
  /** @param {ReturnType<typeof telemetryConfig>} config @param {{fetchImpl?: typeof fetch, now?: () => number, uuid?: () => string}} options */
  constructor(config, options = {}) {
    this.config = config;
    this.fetchImpl = options.fetchImpl || fetch;
    this.now = options.now || Date.now;
    this.uuid = options.uuid || randomUUID;
    this.directory = join(config.spoolRoot, hashText(config.baseUrl));
    this.writeChain = Promise.resolve();
    /** @type {Promise<void>|null} */
    this.flushPromise = null;
    this.initialized = false;
    /** @type {Buffer|null} */
    this.salt = null;
    this.lastError = "";
  }

  async initialize() {
    if (this.initialized) return;
    const { mkdir } = await import("node:fs/promises");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const saltPath = join(this.directory, "salt");
    try {
      this.salt = await readFile(saltPath);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
      this.salt = randomBytes(32);
      await writeFile(saltPath, this.salt, { mode: 0o600, flag: "wx" });
    }
    this.initialized = true;
  }

  /** @param {Record<string, unknown>} payload */
  append(payload) {
    this.writeChain = this.writeChain.then(async () => {
      await this.initialize();
      const body = JSON.stringify(payload);
      if (body.length > 64_000) throw new Error("Telemetry payload exceeds 64000 characters");
      const name = `${String(this.now()).padStart(16, "0")}-${this.uuid()}.json`;
      const target = join(this.directory, name);
      const temporary = `${target}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(body, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, target);
      await this.prune();
    }).catch((error) => {
      this.lastError = String(error);
    });
    void this.writeChain.then(() => this.flush());
    return this.writeChain;
  }

  async files() {
    await this.initialize();
    return (await readdir(this.directory)).filter((name) => name.endsWith(".json")).sort();
  }

  async prune() {
    const files = (await readdir(this.directory)).filter((name) => name.endsWith(".json") || name.endsWith(".rejected") || name.endsWith(".tmp")).sort();
    const entries = [];
    let totalBytes = 0;
    for (const name of files) {
      const size = (await stat(join(this.directory, name))).size;
      entries.push({ name, size });
      totalBytes += size;
    }
    while (entries.length > this.config.maxFiles || totalBytes > this.config.maxBytes) {
      const oldest = entries.shift();
      if (!oldest) break;
      await unlink(join(this.directory, oldest.name));
      totalBytes -= oldest.size;
    }
  }

  flush() {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushOnce().catch((error) => {
      this.lastError = String(error);
    }).finally(() => { this.flushPromise = null; });
    return this.flushPromise;
  }

  async flushOnce() {
    await this.writeChain;
    const endpoint = sameOriginUrl(this.config.baseUrl, "/api/telemetry/traces");
    for (const name of await this.files()) {
      const path = join(this.directory, name);
      const body = await readFile(path, "utf8");
      /** @type {Record<string, string>} */
      const headers = { "content-type": "application/json", accept: "application/json" };
      if (this.config.token) headers.authorization = `Bearer ${this.config.token}`;
      if (this.config.audience) headers["x-kujo-audience"] = this.config.audience;
      let response;
      try {
        response = await this.fetchImpl(endpoint, {
          method: "POST",
          redirect: "error",
          headers,
          body,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
      } catch (error) {
        this.lastError = String(error);
        return;
      }
      try { await response.body?.cancel(); } catch {}
      if (response.ok) {
        await unlink(path);
        continue;
      }
      this.lastError = `Watchdog telemetry rejected with HTTP ${response.status}`;
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        await rename(path, `${path}.rejected`);
      }
      return;
    }
  }
}

export class PiTelemetryBridge {
  /** @param {{environment?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, now?: () => number, uuid?: () => string}} options */
  constructor(options = {}) {
    this.config = telemetryConfig(options.environment || process.env);
    this.now = options.now || Date.now;
    this.uuid = options.uuid || randomUUID;
    this.spool = new TelemetrySpool(this.config, options);
    this.active = false;
    this.sessionId = "";
    this.projectId = "";
    this.provider = "";
    this.model = "";
    /** @type {null|{traceId:string,rootSpanId:string,startedAt:number,sequence:number,attempt:number,currentTurnSpanId:string,turns:Map<number,{spanId:string,startedAt:number}>,tools:Map<string,{spanId:string,parentSpanId:string,toolName:string,startedAt:number}>,usage:{input:number,output:number,cacheRead:number,cacheWrite:number},status:string}} */
    this.run = null;
  }

  get enabled() { return this.config.enabled && this.active; }

  /** @param {{sessionId:string,workspace:string,provider?:string,model?:string,trusted:boolean}} context */
  async startSession(context) {
    if (!this.config.enabled || !context.trusted) return;
    try {
      await this.spool.initialize();
      this.sessionId = context.sessionId;
      this.projectId = projectHash(context.workspace, /** @type {Buffer} */ (this.spool.salt));
      this.provider = context.provider || "";
      this.model = context.model || "";
      this.active = true;
      void this.spool.flush();
    } catch (error) {
      this.spool.lastError = String(error);
      this.active = false;
    }
  }

  /** @param {Record<string, unknown>} bundle */
  append(bundle) {
    if (!this.enabled || !this.run) return Promise.resolve();
    return this.spool.append({
      schema_version: TELEMETRY_SCHEMA_VERSION,
      source_app: "kujo-pi",
      trace_id: this.run.traceId,
      session_id: this.sessionId,
      ...bundle,
    });
  }

  /** @param {string} name @param {string} spanId @param {Record<string, unknown>} [attributes] */
  nextEvent(name, spanId, attributes = {}) {
    if (!this.run) return {};
    this.run.sequence += 1;
    return {
      event_id: this.uuid(), span_id: spanId, sequence: this.run.sequence,
      event_name: name, occurred_at_ms: this.now(), attributes: cleanAttributes(attributes),
    };
  }

  async startRun() {
    if (!this.enabled) return;
    if (this.run) await this.finishRun("interrupted");
    const traceId = this.uuid();
    const startedAt = this.now();
    this.run = {
      traceId, rootSpanId: this.uuid(), startedAt, sequence: 0, attempt: 0,
      currentTurnSpanId: "", turns: new Map(), tools: new Map(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, status: "running",
    };
    await this.append({
      trace: {
        trace_id: traceId, schema_version: TELEMETRY_SCHEMA_VERSION, name: "pi_agent_run", status: "running",
        started_at_ms: startedAt, ended_at_ms: startedAt, duration_ms: 0,
        attributes: cleanAttributes({ project_hash: this.projectId, telemetry_mode: "metadata", provider: this.provider, model: this.model }),
      },
      events: [this.nextEvent("run_started", this.run.rootSpanId, { project_hash: this.projectId })],
    });
  }

  agentStart() {
    if (!this.run) return;
    this.run.attempt += 1;
    void this.append({ events: [this.nextEvent("agent_attempt_started", this.run.rootSpanId, { attempt: this.run.attempt })] });
  }

  agentEnd(willRetry = false) {
    if (!this.run) return;
    void this.append({ events: [this.nextEvent("agent_attempt_ended", this.run.rootSpanId, { attempt: this.run.attempt, will_retry: willRetry })] });
  }

  /** @param {number} turnIndex @param {number} timestamp */
  turnStart(turnIndex, timestamp) {
    if (!this.run) return;
    const spanId = this.uuid();
    this.run.turns.set(turnIndex, { spanId, startedAt: timestamp || this.now() });
    this.run.currentTurnSpanId = spanId;
    void this.append({ events: [this.nextEvent("turn_started", spanId, { turn_index: turnIndex })] });
  }

  /** @param {number} turnIndex @param {any} message */
  turnEnd(turnIndex, message) {
    if (!this.run) return;
    const turn = this.run.turns.get(turnIndex);
    if (!turn) return;
    const endedAt = this.now();
    const usage = message?.role === "assistant" ? message.usage || {} : {};
    this.run.usage.input += safeNumber(usage.input);
    this.run.usage.output += safeNumber(usage.output);
    this.run.usage.cacheRead += safeNumber(usage.cacheRead);
    this.run.usage.cacheWrite += safeNumber(usage.cacheWrite);
    const stopReason = message?.role === "assistant" ? String(message.stopReason || "") : "";
    if (stopReason === "error") this.run.status = "error";
    if (stopReason === "aborted") this.run.status = "cancelled";
    this.provider = message?.role === "assistant" ? String(message.provider || this.provider) : this.provider;
    this.model = message?.role === "assistant" ? String(message.model || this.model) : this.model;
    void this.append({
      spans: [{
        span_id: turn.spanId, parent_span_id: this.run.rootSpanId, span_kind: "internal", name: "pi.turn",
        status: stopReason === "error" ? "error" : stopReason === "aborted" ? "cancelled" : "success",
        started_at_ms: turn.startedAt, ended_at_ms: endedAt, duration_ms: Math.max(0, endedAt - turn.startedAt),
        attributes: cleanAttributes({ turn_index: turnIndex, provider: this.provider, model: this.model, stop_reason: stopReason, input_tokens: safeNumber(usage.input), output_tokens: safeNumber(usage.output), cached_input_tokens: safeNumber(usage.cacheRead), cache_write_input_tokens: safeNumber(usage.cacheWrite) }),
      }],
      events: [this.nextEvent("turn_completed", turn.spanId, { turn_index: turnIndex, stop_reason: stopReason })],
    });
    this.run.turns.delete(turnIndex);
    if (this.run.currentTurnSpanId === turn.spanId) this.run.currentTurnSpanId = "";
  }

  /** @param {string} toolCallId @param {string} toolName */
  toolStart(toolCallId, toolName) {
    if (!this.run) return;
    const spanId = this.uuid();
    this.run.tools.set(toolCallId, { spanId, parentSpanId: this.run.currentTurnSpanId || this.run.rootSpanId, toolName, startedAt: this.now() });
    void this.append({ events: [this.nextEvent("tool_started", spanId, { tool_name: toolName, tool_kind: toolSpanKind(toolName) })] });
  }

  /** @param {string} toolCallId @param {string} toolName @param {boolean} isError */
  toolEnd(toolCallId, toolName, isError) {
    if (!this.run) return;
    const tool = this.run.tools.get(toolCallId);
    if (!tool) return;
    const endedAt = this.now();
    void this.append({
      spans: [{
        span_id: tool.spanId, parent_span_id: tool.parentSpanId, span_kind: toolSpanKind(toolName), name: `tool.${toolName}`,
        status: isError ? "error" : "success", started_at_ms: tool.startedAt, ended_at_ms: endedAt,
        duration_ms: Math.max(0, endedAt - tool.startedAt), attributes: { tool_name: toolName, success: !isError },
      }],
      events: [this.nextEvent(isError ? "tool_failed" : "tool_completed", tool.spanId, { tool_name: toolName })],
    });
    this.run.tools.delete(toolCallId);
  }

  /** @param {string} command @param {boolean} excludeFromContext */
  userBash(command, excludeFromContext) {
    if (!this.run) return;
    void this.append({ events: [this.nextEvent("shell_requested", this.run.rootSpanId, { command_class: classifyCommand(command), excluded_from_context: excludeFromContext })] });
  }

  /** @param {string} provider @param {string} model @param {string} source */
  modelSelect(provider, model, source) {
    this.provider = provider;
    this.model = model;
    if (!this.run) return;
    void this.append({ events: [this.nextEvent("model_selected", this.run.rootSpanId, { provider, model, source })] });
  }

  /** @param {Record<string, string|null>} headers @param {string} provider */
  correlateProviderHeaders(headers, provider) {
    if (!this.run || provider !== this.config.proxyProvider) return;
    headers["X-Observe-Session-Id"] = this.sessionId;
    headers["X-Observe-Project-Id"] = this.projectId;
    headers["X-Observe-Correlation-Id"] = this.run.traceId;
    headers["X-Observe-Trace-Id"] = this.run.traceId;
    headers["X-Observe-Parent-Span-Id"] = this.run.currentTurnSpanId || this.run.rootSpanId;
  }

  /** @param {string} status */
  async finishRun(status = "success") {
    if (!this.run) return;
    const run = this.run;
    const endedAt = this.now();
    const finalStatus = run.status === "running" ? status : run.status;
    const persistenceSpanId = this.uuid();
    await this.append({
      input_tokens: run.usage.input,
      output_tokens: run.usage.output,
      trace: {
        trace_id: run.traceId, schema_version: TELEMETRY_SCHEMA_VERSION, model: this.model, name: "pi_agent_run", status: finalStatus,
        started_at_ms: run.startedAt, ended_at_ms: endedAt, duration_ms: Math.max(0, endedAt - run.startedAt),
        input_tokens: run.usage.input, output_tokens: run.usage.output, cached_input_tokens: run.usage.cacheRead, cache_write_input_tokens: run.usage.cacheWrite,
        attributes: cleanAttributes({ project_hash: this.projectId, telemetry_mode: "metadata", provider: this.provider, model: this.model, attempts: run.attempt }),
      },
      spans: [
        {
          span_id: run.rootSpanId, parent_span_id: "", span_kind: "workflow", name: "pi.agent_run", status: finalStatus,
          started_at_ms: run.startedAt, ended_at_ms: endedAt, duration_ms: Math.max(0, endedAt - run.startedAt),
          attributes: { attempts: run.attempt },
        },
        {
          span_id: persistenceSpanId, parent_span_id: run.rootSpanId, span_kind: "persistence", name: "pi.telemetry_spool", status: "success",
          started_at_ms: endedAt, ended_at_ms: endedAt, duration_ms: 0,
          attributes: { storage: "local_spool", durability: "atomic_file" },
        },
      ],
      events: [
        this.nextEvent(finalStatus === "success" ? "run_completed" : "run_failed", run.rootSpanId, { status: finalStatus }),
        this.nextEvent("persistence_saved", persistenceSpanId, { storage: "local_spool" }),
      ],
    });
    this.run = null;
  }

  /** @param {string} reason */
  async shutdown(reason) {
    if (!this.active) return;
    try {
      if (this.run) await this.finishRun("interrupted");
      await this.spool.writeChain;
      await this.spool.flush();
    } catch (error) {
      this.spool.lastError = String(error);
    } finally {
      this.active = false;
    }
  }
}
