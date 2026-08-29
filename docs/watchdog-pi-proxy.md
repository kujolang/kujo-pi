# Route Pi model traffic through Watchdog

Kujo Pi can use Watchdog as an OpenAI-compatible local proxy. This gives a Pi
session a single local observability path for model requests while preserving
Pi's normal provider and model selection behavior.

This is opt-in. Installing Kujo Pi does not change a user's provider URL,
start Watchdog, or send telemetry anywhere.

## 1. Start Watchdog

Start Watchdog from its own checkout and choose the upstream that should receive
Pi traffic:

```bash
cd /path/to/kujo-watchdog
WDG_PORT=7700 \
WDG_PROXY_AUTH_MODE=passthrough \
WDG_API_AUTH_MODE=off \
WDG_PROXY_AUTHZ_MODE=off \
kujo run --interpreter dashboard_server.kujo
```

For a shared or non-loopback deployment, use HTTPS and enable both token
controls. Keep the Watchdog proxy token separate from the upstream provider
key. Watchdog's [service configuration](https://github.com/kujolang/watchdog#configuration)
documents the production posture.

## 2. Add a Watchdog-backed Pi provider

Pi custom providers live in `~/.pi/agent/models.json`. Add a provider entry
with a stable, user-chosen ID. The example below uses Ollama Cloud, but the
upstream can be any OpenAI-compatible service configured in Watchdog:

```json
{
  "providers": {
    "kujo-watchdog": {
      "name": "Kujo Watchdog",
      "baseUrl": "http://127.0.0.1:7700/proxy/v1",
      "api": "openai-completions",
      "authHeader": true,
      "apiKey": "$UPSTREAM_API_KEY",
      "headers": {
        "X-Watchdog-Proxy-Token": "$KUJO_WATCHDOG_PROXY_TOKEN",
        "X-Watchdog-Upstream-Profile": "$KUJO_WATCHDOG_UPSTREAM_PROFILE"
      },
      "models": [
        {
          "id": "your-model-id",
          "name": "Your model via Watchdog",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 16384
        }
      ]
    }
  }
}
```

Pi resolves `apiKey` and `headers` from the environment. Omit either optional
Watchdog header when the corresponding Watchdog auth mode is `off`. Do not put
provider keys or proxy tokens in `.pi/settings.json`, `models.json`, project
files, or shell history.

For a local Keychain-backed setup, use a shell wrapper or secret-manager
integration that exports `UPSTREAM_API_KEY` only for the Pi process. The
repository intentionally contains no machine-specific provider IDs, paths,
ports, tokens, or credentials.

## 3. Verify the complete path

Run Pi with the Watchdog-backed provider:

```bash
pi --provider kujo-watchdog --model your-model-id \
  -p "Reply with exactly: Watchdog traced this Pi request."
```

Then inspect the local dashboard at `http://127.0.0.1:7700` or query the
Watchdog API:

```bash
curl -sS http://127.0.0.1:7700/api/requests
curl -sS http://127.0.0.1:7700/api/traces
```

The proxy records the model request, upstream status, latency, token fields
when supplied by the provider, and proxy lifecycle trace data. Prompt and
response content should remain excluded unless the Watchdog operator has
explicitly chosen a content-capturing policy.

## What this does not cover

Watchdog proxying automatically captures Pi's model HTTP traffic. It does not
automatically receive every Pi tool lifecycle event or local shell command.
Those are separate producer-neutral telemetry events. Enable the implemented
[Pi lifecycle telemetry bridge](watchdog-telemetry-bridge.md) when you want
agent, turn, tool, shell-request, model-selection, and session correlation.
Kujo Pi's `kujo_watchdog` tool remains a read-only API client; it does not turn
on background collection by itself.

## Troubleshooting

- `connection refused`: Watchdog is not listening at the configured base URL.
- `401` from Watchdog: check proxy authz configuration and the dedicated proxy
  token; in passthrough mode also check the upstream provider key.
- `404`: use the `/proxy/v1` base URL and let Pi append `chat/completions` or
  `models`.
- no dashboard row: confirm the Pi provider points to Watchdog, not directly to
  the upstream provider, then retry with a fresh Pi process.
