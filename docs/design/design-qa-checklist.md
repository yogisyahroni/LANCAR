# TEMBUS design QA checklist — 2026

Use this checklist for a component or high-frequency screen adoption review.

- [ ] Light theme reviewed.
- [ ] Dark theme reviewed.
- [ ] System theme selection reviewed.
- [ ] Large font scale reviewed; no critical label/action is clipped.
- [ ] 48dp minimum touch target reviewed for primary actions.
- [ ] TalkBack accessible name and role reviewed.
- [ ] Selected/disabled/loading/success/warning/error semantics reviewed.
- [ ] Loading, error, empty, and offline/retry states reviewed.
- [ ] Long localization and RTL readiness reviewed.
- [ ] Remote component registry and accessibility contract reviewed before allowlist change.

Source-level gates for the current DS-2026-011/012 increment are automated by
`scripts/design/validate-tembus-component-adoption.mjs`; an authorized device
review is an environment follow-up when no device is connected.
