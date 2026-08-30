# Migrating from Kujo Pi 0.x to 1.x

Kujo Pi 1.x keeps the 0.3 tool names and result schemas. Most users can update the package and continue working.

## Upgrade

1. Commit or copy any project-local `.pi/settings.json` changes.
2. Update the package:

   ```bash
   pi update --extensions
   ```

3. Restart Pi in a trusted project.
4. Run `/kujo setup`, then use `kujo_doctor` if setup reports a missing integration.
5. Run `/kujo packs` and enable the task pack you need.

## Changes from 0.3

- Task packs group related tools without enabling a large default tool list.
- Optional-tool activation is stored in the Pi session and restored when that session reloads or its tree changes. A new session starts with the quiet core set.
- The extension uses one capability manifest for tool names, approval policy, side effects, and model guidance.
- Results use compact Pi-native rendering while preserving structured result data.
- Dispatch approval binds the exact argument vector that runs.
- The package requires the Node and Pi versions declared in `package.json`.

No migration rewrites project files. `/kujo init` still creates only `.kujo/pi/README.md` and never overwrites it.

## Rollback

Pin the last working release, restart Pi, and rerun `/kujo setup`:

```bash
pi install npm:@kujolang/kujo-pi@0.3.2
```

Do not copy 1.x session entries into an older Pi session by hand. Old releases ignore unknown custom entries, but manual edits can damage the Pi session file.
