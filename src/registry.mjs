// @ts-check
import { createHash, verify } from "node:crypto";
import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./contracts.mjs";

export const REGISTRY_SCHEMA_VERSION = "kujo.pi.integration-registry.v1";
const DEFAULT_REGISTRY = fileURLToPath(new URL("../integrations/registry.v1.json", import.meta.url));
const DEFAULT_SIGNATURE = fileURLToPath(new URL("../integrations/registry.v1.sig", import.meta.url));
const DEFAULT_PUBLIC_KEY = fileURLToPath(new URL("../integrations/registry.v1.pub.pem", import.meta.url));

/** @param {any} manifest */
function validateRegistryManifest(manifest) {
  if (manifest.schemaVersion !== REGISTRY_SCHEMA_VERSION || manifest.registryVersion !== 1 || !Array.isArray(manifest.integrations) || manifest.integrations.length === 0) {
    throw new Error(`Unsupported integration registry schema: ${manifest.schemaVersion || "missing"}`);
  }
  if (!Number.isFinite(Date.parse(manifest.issuedAt)) || manifest.ecosystemRootEnvironment !== "KUJO_ECOSYSTEM_ROOT") {
    throw new Error("Integration registry metadata is invalid");
  }
  const ids = new Set();
  for (const entry of manifest.integrations) {
    if (!/^[a-z][a-z0-9-]*$/.test(entry.id) || ids.has(entry.id)) throw new Error(`Invalid or duplicate integration id: ${entry.id}`);
    ids.add(entry.id);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(entry.version) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Invalid version or checksum for integration: ${entry.id}`);
    if (!Array.isArray(entry.capabilities) || entry.capabilities.length === 0 || entry.capabilities.some((/** @type {any} */ value) => typeof value !== "string" || !value)) throw new Error(`Invalid capabilities for integration: ${entry.id}`);
    if (typeof entry.entrypointEnvironment !== "string" || !/^KUJO_[A-Z0-9_]+$/.test(entry.entrypointEnvironment)) throw new Error(`Invalid entrypoint environment for integration: ${entry.id}`);
    if (typeof entry.relativeEntrypoint !== "string" || isAbsolute(entry.relativeEntrypoint) || entry.relativeEntrypoint.split(/[\\/]/).includes("..")) throw new Error(`Invalid relative entrypoint for integration: ${entry.id}`);
  }
}

/** @param {string} path */
function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** @param {string} command @param {NodeJS.ProcessEnv} [environment] */
export function findExecutable(command, environment = process.env) {
  if (!command) return null;
  const candidates = [];
  if (isAbsolute(command)) candidates.push(command);
  else {
    const extensions = process.platform === "win32"
      ? (environment.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];
    for (const directory of (environment.PATH || "").split(delimiter).filter(Boolean)) {
      if (process.platform === "win32" && extname(command)) candidates.push(resolve(directory, command));
      else for (const extension of extensions) candidates.push(resolve(directory, `${command}${extension}`));
    }
  }
  for (const candidate of candidates) {
    try {
      const path = realpathSync(candidate);
      if (!statSync(path).isFile()) continue;
      accessSync(path, constants.X_OK);
      return path;
    } catch {
      // Continue through PATH candidates.
    }
  }
  return null;
}

/** @param {string} registryPath @param {string} signaturePath @param {string} publicKeyPath */
export function loadSignedRegistry(registryPath = DEFAULT_REGISTRY, signaturePath = DEFAULT_SIGNATURE, publicKeyPath = DEFAULT_PUBLIC_KEY) {
  if (![registryPath, signaturePath, publicKeyPath].every(isAbsolute)) {
    throw new Error("Integration registry, signature, and public key paths must be absolute");
  }
  const manifest = /** @type {any} */ (JSON.parse(readFileSync(registryPath, "utf8")));
  validateRegistryManifest(manifest);
  const signature = Buffer.from(readFileSync(signaturePath, "utf8").trim(), "base64");
  const valid = verify(null, Buffer.from(canonicalJson(manifest)), readFileSync(publicKeyPath, "utf8"), signature);
  if (!valid) throw new Error("Integration registry signature verification failed");
  return { manifest, registryPath, signaturePath, publicKeyPath, signatureVerified: true };
}

/** @param {NodeJS.ProcessEnv} [environment] */
export function inspectIntegrations(environment = process.env) {
  const registryPath = environment.KUJO_INTEGRATION_REGISTRY
    ? realpathSync(environment.KUJO_INTEGRATION_REGISTRY)
    : DEFAULT_REGISTRY;
  const signaturePath = environment.KUJO_INTEGRATION_REGISTRY_SIGNATURE
    ? realpathSync(environment.KUJO_INTEGRATION_REGISTRY_SIGNATURE)
    : registryPath === DEFAULT_REGISTRY ? DEFAULT_SIGNATURE : `${registryPath}.sig`;
  const publicKeyPath = environment.KUJO_INTEGRATION_REGISTRY_PUBLIC_KEY
    ? realpathSync(environment.KUJO_INTEGRATION_REGISTRY_PUBLIC_KEY)
    : DEFAULT_PUBLIC_KEY;
  const registry = loadSignedRegistry(registryPath, signaturePath, publicKeyPath);
  const ecosystemRoot = environment[registry.manifest.ecosystemRootEnvironment || "KUJO_ECOSYSTEM_ROOT"];
  const integrations = registry.manifest.integrations.map((/** @type {any} */ entry) => {
    const configuredBinary = entry.binaryEnvironment ? environment[entry.binaryEnvironment] : undefined;
    const configuredEntrypoint = entry.entrypointEnvironment ? environment[entry.entrypointEnvironment] : undefined;
    const binaryPath = findExecutable(configuredBinary || entry.command || "", environment);
    let entrypointPath = null;
    let source = "not_found";
    if (configuredEntrypoint) {
      if (!isAbsolute(configuredEntrypoint)) throw new Error(`${entry.entrypointEnvironment} must be an absolute path`);
      entrypointPath = realpathSync(configuredEntrypoint);
      source = "environment";
    } else if (binaryPath) {
      source = configuredBinary ? "environment" : "path";
    } else if (ecosystemRoot && entry.relativeEntrypoint) {
      const candidate = resolve(ecosystemRoot, entry.relativeEntrypoint);
      if (existsSync(candidate)) {
        entrypointPath = realpathSync(candidate);
        source = "signed_registry";
      }
    }
    if (entrypointPath && !statSync(entrypointPath).isFile()) throw new Error(`${entry.id} entrypoint must be a file`);
    const discoveredPath = binaryPath || entrypointPath;
    const actualSha256 = discoveredPath ? fileSha256(discoveredPath) : null;
    const checksumVerified = entrypointPath && source === "signed_registry" ? actualSha256 === entry.sha256 : null;
    const integrityAccepted = source !== "signed_registry" || checksumVerified === true;
    return {
      ...entry,
      source,
      binaryPath,
      entrypointPath,
      actualSha256,
      checksumVerified,
      available: Boolean(discoveredPath) && integrityAccepted,
    };
  });
  return {
    schemaVersion: registry.manifest.schemaVersion,
    registryVersion: registry.manifest.registryVersion,
    signatureVerified: registry.signatureVerified,
    issuedAt: registry.manifest.issuedAt,
    registryPath,
    ecosystemRoot: ecosystemRoot || null,
    integrations,
  };
}

/** @param {ReturnType<typeof inspectIntegrations>} registry @param {string} id */
export function integrationById(registry, id) {
  return registry.integrations.find((/** @type {any} */ entry) => entry.id === id) || null;
}
