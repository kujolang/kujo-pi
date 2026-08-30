# Compatibility policy

Kujo Pi 1.x supports maintained Node.js releases that meet the `engines` range in `package.json` and Pi versions in the declared peer-dependency range. CI tests the minimum supported Pi version and the newest published Pi version every week. A release will narrow those ranges only in a new major version unless an upstream security or correctness issue makes the old range unsafe.

## Stable 1.x contracts

The following interfaces stay backward compatible throughout 1.x:

- tool names and task-pack names;
- `kujo.pi.result.v1`, `kujo.pi.approval.v1`, `kujo.pi.receipt.v1`, and `kujo.pi.tools-state.v1` data;
- documented environment variables;
- `/kujo setup`, `/kujo packs`, `/kujo active`, `/kujo enable`, `/kujo disable`, and `/kujo init`;
- the signed integration-registry format.

Minor releases may add optional fields, tools, packs, prompts, or integrations. Consumers must ignore unknown fields. Kujo Pi will not change an existing field's meaning or make an optional field required in 1.x.

## Deprecation

A 1.x feature must remain usable for at least one minor-release cycle after it is deprecated. The release notes and Doctor output will name its replacement. Security fixes may remove unsafe behavior sooner; the release notes will explain why.

## Upstream and integration boundaries

Kujo Pi tests its Pi host contract, not Pi's provider implementations. Each Kujo integration remains independently versioned. Doctor reports missing or incompatible local tools, and a failed optional integration does not stop Pi or the core Kujo Pi tools from loading.

See the [support policy](support.md) for maintenance windows and the [v1 migration guide](migration-v1.md) for the move from 0.x.
