#!/usr/bin/env python3
"""Validate the PART AG ownership and modular-first control documents.

This is a documentation/control-plane validator only. It intentionally does
not turn staging, provider, capacity or launch-owner gaps into a PASS.
"""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        raise AssertionError(f"missing required control document: {relative}")
    return path.read_text(encoding="utf-8")


def require(text: str, needle: str, source: str) -> None:
    if needle not in text:
        raise AssertionError(f"{source} is missing required marker: {needle}")


def main() -> int:
    capability = read("docs/architecture/platform-capability-map.md")
    ownership = read("docs/architecture/service-ownership-map.md")
    modular = read("docs/architecture/modular-first-extraction-policy.md")
    promotion = read("docs/release/environment-promotion.md")
    scorecard = read("docs/program/reality-scorecard.md")

    required_capabilities = (
        "Payment intent/provider state",
        "Refund/chargeback/reconciliation",
        "Quote/pricing/fulfilment state",
        "External logistics/provider capability",
        "Safety incident/evidence",
        "Support case/recovery",
        "Reputation/review/moderation",
        "Loyalty/referral/membership",
        "CRM campaign delivery/experimentation",
        "Promo/subsidy accounting",
        "App Experience/feature rollout",
        "Security/release controls",
        "Operations/capacity/drills",
    )
    for marker in required_capabilities:
        require(capability, f"| {marker} |", "platform capability map")
    for marker in (
        "Canonical owner",
        "API / events",
        "Storage",
        "Operational owner",
        "Consumers",
        "No second source of truth",
        "admin.bawain.my.id",
        "api.bawain.my.id",
    ):
        require(capability, marker, "platform capability map")

    for marker in (
        "customer web (`app.bawain.my.id`)",
        "customer Android",
        "courier Android",
        "merchant Android/web",
        "admin dashboard (`admin.bawain.my.id`)",
        "Primary owner/on-call",
        "Recovery dependency",
    ):
        require(ownership, marker, "service ownership map")

    for marker in (
        "independent scaling",
        "availability",
        "failure/recovery semantics",
        "security/compliance boundary",
        "API/event contract",
        "migration/backfill",
        "observability",
        "rollback",
        "No new microservice was introduced for the W–AG work",
        "distributed transaction",
    ):
        require(modular, marker, "modular-first extraction policy")

    for marker in (
        "local/dev → integration → staging → pre-production",
        "production",
        "isolated credentials and provider endpoints",
        "production data is never copied into staging",
        "Provider sandbox",
        "cutover",
        "Feature flags",
        "admin.bawain.my.id",
    ):
        require(promotion, marker, "environment promotion model")

    for marker in (
        "implementation reference",
        "Red findings have an owner and due date",
        "2026-09-14 measurable checkpoint",
        "vendor sandbox/live cutover",
        "Finance/Legal approval",
    ):
        require(scorecard, marker, "reality scorecard")

    row_count = sum(1 for line in capability.splitlines() if line.startswith("|") and not line.startswith("|---")) - 1
    print(f"REALITY ARCHITECTURE CONTROL PASS: {row_count} capability rows, ownership/modular/promotion/scorecard markers verified")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"REALITY ARCHITECTURE CONTROL FAIL: {error}".encode("ascii", "backslashreplace").decode("ascii"))
        sys.exit(1)
