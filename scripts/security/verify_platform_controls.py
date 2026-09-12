#!/usr/bin/env python3
"""Deterministic repository gate for required PART AD/AG control artifacts."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = (
    "docs/security/threat-model-platform.md",
    "docs/security/secret-management.md",
    "docs/security/release-gates.md",
    "docs/security/incident-response.md",
    "docs/security/vulnerability-management.md",
    "docs/security/data-governance.md",
    "docs/security/threat-model-order.md",
    "docs/security/threat-model-payment.md",
    "docs/security/threat-model-auth.md",
    "docs/security/threat-model-admin.md",
    "docs/security/threat-model-provider-webhooks.md",
    "docs/runbooks/security-incident.md",
    "docs/architecture/platform-capability-map.md",
    "docs/architecture/service-ownership-map.md",
    "docs/architecture/modular-first-extraction-policy.md",
    "docs/release/environment-promotion.md",
    "docs/release/production-readiness-review.md",
    "docs/release/artifact-provenance.md",
    "docs/operations/control-room.md",
    "docs/operations/failure-drill-register.md",
    "docs/operations/drill-record-template.md",
    "docs/finance/cost-unit-economics.md",
    "docs/program/reality-scorecard.md",
    "docs/mobile/reliability-contract.md",
    "database/migrations/20260912000007_payment_orchestration.sql",
    "database/migrations/20260912000008_safety_reputation_crm_platform.sql",
    "database/migrations/20260912000009_platform_hardening.sql",
    "docs/contracts/payment-balance-ledger-2026.md",
    "docs/contracts/reputation-2026.md",
    "scripts/load/payment-intents.k6.js",
)

def main() -> int:
    missing = [path for path in REQUIRED if not (ROOT / path).is_file()]
    if missing:
        print("PLATFORM CONTROL GATE FAILED")
        for path in missing:
            print(f"- missing: {path}")
        return 1
    forbidden = ("TODO: implement", "return fake", "mock provider success")
    hits: list[str] = []
    for path in (ROOT / "docs").rglob("*.md"):
        text = path.read_text(encoding="utf-8").lower()
        for marker in forbidden:
            if marker.lower() in text:
                hits.append(f"{path.relative_to(ROOT)} contains {marker!r}")
    if hits:
        print("PLATFORM CONTROL GATE FAILED")
        print("\n".join(f"- {hit}" for hit in hits))
        return 1
    workflow = (ROOT / ".github/workflows/security-scan.yml").read_text(encoding="utf-8")
    workflow_forbidden = ("npm ci || true", "npm audit --audit-level=high --json > npm-audit-report.json || true")
    workflow_hits = [marker for marker in workflow_forbidden if marker in workflow]
    if workflow_hits:
        print("PLATFORM CONTROL GATE FAILED")
        for marker in workflow_hits:
            print(f"- security workflow weakens dependency verification: {marker}")
        return 1
    required_workflow_markers = ("set -euo pipefail", "npm ci --prefix", "audit_failed=0")
    missing_workflow_markers = [marker for marker in required_workflow_markers if marker not in workflow]
    if missing_workflow_markers:
        print("PLATFORM CONTROL GATE FAILED")
        for marker in missing_workflow_markers:
            print(f"- security workflow missing fail-closed marker: {marker}")
        return 1
    print(f"PLATFORM CONTROL GATE PASS: {len(REQUIRED)} required artifacts present")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
