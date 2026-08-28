# Security

Kujo Pi is a Pi extension. Installing it gives code in this repository the same local permissions as the Pi process, so review the source and pin a known Git revision when using it in a team or CI environment.

## Safety boundaries

- Startup is local-only and does not install Kujo, start daemons, or make network requests.
- Optional tools are inactive until enabled for a session.
- Tools that execute workflows or generate artifacts ask for explicit approval unless the caller supplies an explicit confirmation flag.
- Workspace paths are contained before being passed to Kujo commands.
- Command output is bounded before it is returned to the model.
- Watchdog and Leash are disabled until their URLs are configured. Leash tokens are read from the environment and are never returned in tool output.

## Reporting

Do not open a public issue for an active vulnerability. Use the repository's [private GitHub security advisory form](https://github.com/kujolang/kujo-pi/security/advisories/new), including reproduction steps, affected revision, and impact. Please do not include credentials or personal data in reports.
