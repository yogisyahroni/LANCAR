# LANCAR Component Lifecycle

Every governed component is listed in
`docs/design/component-registry-2026.json`. The registry is reviewed as part
of the implementation change and is checked against the remote App Experience
contract by `scripts/design/validate-component-registry.mjs`.

## Required registry metadata

Each entry must include:

- a stable LANCAR identifier and human-readable name;
- one accountable owner;
- status: `experimental`, `stable`, or `deprecated`;
- supported surfaces and runtime surface mapping;
- an accessibility contract covering names, media semantics, composition,
  static fallback, and presentation-only behavior;
- code mappings to the canonical schema/renderer/preview files;
- the design-system release in which the entry is governed;
- whether the type is remotely addressable through App Experience.

## Statuses

### Experimental

The semantics or adoption surface is still being proven. Experimental
components may be used behind a controlled feature flag or in a task-local
surface, but they are not a license to add unreviewed remote component types.

### Stable

The semantic contract, accessibility behavior, supported-surface behavior,
fallback, and code mapping are reviewed and locally verified. Stable does not
mean every future service has adopted the component; adoption remains measured
by the relevant DS task.

### Deprecated

The component remains readable for its migration window but must not be used by
new work. The entry must state the replacement, migration owner, and removal
target. Removing a remote identifier requires a compatibility/fallback plan for
published manifests and older clients.

## Versioning and breaking changes

- Patch: documentation, test, or non-semantic evidence clarification.
- Minor: additive component, state, or surface support that keeps existing
  contracts compatible.
- Major: renamed/removed identifier, changed semantics, incompatible token or
  accessibility contract, or changed remote payload meaning.

Every release note must list breaking and deprecated entries. A remote type
change must preserve a safe packaged/native fallback for clients that do not
understand the new version.

## Promotion and retirement

1. Add or update the registry entry and review record.
2. Prove the component contract and accessibility behavior on each supported
   runtime surface, or mark the unsupported surface explicitly in the task
   evidence.
3. Run the registry validator and applicable unit, lint, build, and E2E checks.
4. Promote `experimental` to `stable` only when the evidence is complete.
5. For retirement, mark `deprecated`, publish the replacement/migration path,
   keep the old contract readable for its compatibility window, then remove it
   only after runtime fallback and manifest impact are verified.
