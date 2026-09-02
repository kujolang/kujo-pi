# Kujo Pi Service Profiles

Kujo Pi supports local-first service connections without assuming that a developer has a central control plane. Choose the narrowest profile that matches the environment.

## Local profile

```bash
export KUJO_WATCHDOG_URL=http://127.0.0.1:4318
export KUJO_WATCHDOG_TELEMETRY=metadata
export KUJO_WATCHDOG_PROXY_PROVIDER=kujo-watchdog
export KUJO_LEASH_URL=http://127.0.0.1:4319
export KUJO_LEASH_TOKEN='use-a-local-token'
export KUJO_ABILITY_GATEWAY_URL=http://127.0.0.1:8080
export KUJO_ABILITY_GATEWAY_TOKEN='use-a-local-token'
```

Local HTTP is accepted only for loopback hosts. The extension constrains request paths to the configured origin, rejects redirects, bounds response bodies, applies a timeout to every attempt, and never sends a request during startup unless the explicitly enabled metadata bridge is replaying its local spool after trusted session startup.

## Remote profile

```bash
export KUJO_WATCHDOG_URL=https://watchdog.example.internal
export KUJO_WATCHDOG_TOKEN='use-a-secret-manager-value'
export KUJO_WATCHDOG_AUDIENCE=kujo-watchdog
export KUJO_LEASH_URL=https://leash.example.internal
export KUJO_LEASH_TOKEN='use-a-secret-manager-value'
export KUJO_LEASH_AUDIENCE=kujo-leash
export KUJO_ABILITY_GATEWAY_URL=https://cms.example.internal
export KUJO_ABILITY_GATEWAY_TOKEN='use-a-secret-manager-value'
export KUJO_ABILITY_GATEWAY_AUDIENCE=kujo-ability
```

Remote HTTP is rejected; remote services must use HTTPS. Tokens are sent only as bearer headers and are never included in tool results, receipts, or diagnostics. Store them in the host secret manager or process environment, not in `.pi/settings.json`, project files, or shell history. Pi must report the open project as trusted before a service tool runs.

## Operational boundary

Kujo Pi does not provide service authentication, certificate pinning, authorization policy, or tenant isolation. Watchdog, Leash, and each Ability application gateway remain responsible for those controls. Pi adds an independent host approval before Ability execution, but that approval never replaces server-side policy or a request-bound Ability approval. The extension adds transport safety and explicit opt-in behavior; organizations should enforce network policy, audience validation, token rotation, audit logging, and rate limits at the service boundary.
