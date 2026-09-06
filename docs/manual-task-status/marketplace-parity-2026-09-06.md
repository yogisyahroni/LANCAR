# Marketplace Parity 2026 — Manual Status Snapshot

Branch: `staging`
Date: 2026-09-06

> This file intentionally does **not** modify `task-food-marketplace-parity-2026.md`. The master checklist is large and whole-file replacement is unnecessarily risky. Use this snapshot to compare and update the master manually on-device.

## TIRE-2026-003 — Quote + on-site adjustment approval

Status: **DONE IN CODE**

- [x] Initial quote snapshot is required and copied into the adjustment record.
- [x] Extra material/work is represented as structured material/labor line items.
- [x] Customer explicitly reviews and approves/rejects the price delta.
- [x] Approval updates order obligation + adjustment state + audit atomically and is idempotent.

Implementation highlights:
- Backend domain/service/repository/handler and migration for `service_adjustments`.
- Assigned-courier authorization for proposals and customer ownership authorization for decisions.
- Persistent proposal/decision idempotency and stale-total protection.
- Customer Android order detail shows structured pending adjustment and explicit approve/reject actions.
- Courier Android Tambal Ban flow can propose structured on-site adjustments.

Relevant commits observed on `staging`:
- `01b3187` — backend service-adjustment core.
- `a33df74` — API route wiring.
- `86453bf` — SQL qualification hardening.
- `ea18d39ae55f6eef47c2441c055ba1b82012a069` — backend safety-cap coverage.
- `255b939add4d307ef130e6fbd8d3511b326dce38` — customer Retrofit/repository wiring.
- `36f728d151f4c272d197cd6f28da1c17938f1035` — customer consent unit coverage / Mobile CI trigger.

Verification observed:
- CI/CD Staging run `34007862440`: **SUCCESS** for backend baseline `ea18d39...`.
- Mobile Apps CI/CD run `34018484767`: **QUEUED** at last check; do not treat device/mobile build as verified yet.
- Manual device flow remains to be checked on a real customer/courier device pair.

## TIRE-2026-004 — Arrival → inspection → repair → proof → completion

Status: **DONE IN CODE**

- [x] Server-enforced lifecycle.
- [x] Before/after proof is required for Tambal Ban completion.
- [x] Structured material/duration/report is validated and persisted.
- [x] Customer-facing Tambal Ban statuses have human-readable stage labels.

Verified code path:
- `backend/order-service/internal/domain/tambalban_lifecycle.go` defines the canonical sequential transition contract.
- `backend/order-service/internal/service/order_read.go` applies the lifecycle guard and blocks terminal delivery until a completed report with before/after proof exists.
- `backend/order-service/internal/service/service_report_service.go` validates condition-before, before-photo, 1..1440 minute duration, structured material list, condition-after, after-photo and completion timestamp.
- `backend/order-service/internal/repository/tambalban_repository.go` verifies the assigned technician, locks the order/report path, only accepts the final-proof stage and keeps one report per order.
- Courier `OrderViewModel.submitServiceReport()` carries the inspection proof, structured materials, work duration and completion photo into the report before requesting terminal completion.
- Customer `OrderActionPolicy` provides Tambal Ban-specific labels such as technician en route, arrived, inspection, repair, waiting final proof and completed.

Verification note:
- This status is based on repository code/contract audit. A real-device end-to-end run is still a separate manual validation gate.

## Evidence / CI caveat

The repository Task Evidence Gate can remain red when the large master checklist and legacy evidence frontmatter are not synchronized. This file does not convert unverified staging/device/provider checks into PASS. Only code paths and CI outcomes actually observed above are marked complete.
