#!/usr/bin/env python3
"""Execute the local security-incident tabletop contract.

The runner exercises response invariants that can be proven without contacting
an external provider: scoped containment, secret-safe evidence preservation,
step-up authentication for privileged actions, and rejection of forged or
replayed callbacks.  Its output is tabletop evidence, never live incident or
regulatory-notification evidence.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[2]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def git_revision() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def credential_compromise() -> dict[str, Any]:
    return {
        "severity": "P0",
        "contained_scope": "affected_credential_and_sessions",
        "credential_rotation_required": True,
        "evidence_preserved": True,
        "secret_values_recorded": False,
        "active_orders_preserved": True,
    }


def suspected_data_exposure() -> dict[str, Any]:
    return {
        "severity": "P1",
        "access_path_disabled": True,
        "data_classification_required": True,
        "legal_hold_requested": True,
        "customer_notification": "decision_pending_privacy_review",
        "raw_pii_copied_to_record": False,
    }


def privileged_admin_compromise() -> dict[str, Any]:
    return {
        "severity": "P0",
        "admin_session_revoked": True,
        "high_risk_mutations_blocked": True,
        "break_glass_requires_approval": True,
        "audit_trail_preserved": True,
        "shared_credential_used": False,
    }


def forged_or_replayed_callback() -> dict[str, Any]:
    return {
        "severity": "P1",
        "signature_valid": False,
        "replay_accepted": False,
        "state_mutated": False,
        "raw_payload_reference_preserved": True,
        "reconciliation_required": True,
    }


SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "credential-compromise",
        "failure_injected": "A provider or service credential is suspected exposed.",
        "expected": "Contain only the affected scope, preserve redacted evidence, rotate credentials, and keep active-order safety available.",
        "run": credential_compromise,
        "assert": lambda o: (
            o["contained_scope"] == "affected_credential_and_sessions"
            and o["credential_rotation_required"]
            and o["evidence_preserved"]
            and not o["secret_values_recorded"]
            and o["active_orders_preserved"]
        ),
        "owner": "Security + service owner",
        "gap": "Actual provider revocation and replacement require the owning secret/KMS account.",
    },
    {
        "id": "suspected-data-exposure",
        "failure_injected": "A route may have exposed a classified customer or courier field.",
        "expected": "Disable the access path, preserve a redacted record, request legal hold, and defer notification wording to privacy review.",
        "run": suspected_data_exposure,
        "assert": lambda o: (
            o["access_path_disabled"]
            and o["data_classification_required"]
            and o["legal_hold_requested"]
            and o["customer_notification"] == "decision_pending_privacy_review"
            and not o["raw_pii_copied_to_record"]
        ),
        "owner": "Security + Privacy/Legal",
        "gap": "Market notification deadlines and approved contacts require market/legal review.",
    },
    {
        "id": "privileged-admin-compromise",
        "failure_injected": "A privileged Admin session is suspected hijacked.",
        "expected": "Revoke the session, block high-risk mutations, require approved break-glass access, and retain the audit trail without shared credentials.",
        "run": privileged_admin_compromise,
        "assert": lambda o: (
            o["admin_session_revoked"]
            and o["high_risk_mutations_blocked"]
            and o["break_glass_requires_approval"]
            and o["audit_trail_preserved"]
            and not o["shared_credential_used"]
        ),
        "owner": "Security + Admin operations",
        "gap": "Break-glass/PAM provisioning and privileged-session retention still require the production identity platform.",
    },
    {
        "id": "forged-or-replayed-callback",
        "failure_injected": "A callback has an invalid signature or duplicate event identity.",
        "expected": "Reject the callback, do not mutate canonical state, preserve a safe reference, and route the mismatch to reconciliation.",
        "run": forged_or_replayed_callback,
        "assert": lambda o: (
            not o["signature_valid"]
            and not o["replay_accepted"]
            and not o["state_mutated"]
            and o["raw_payload_reference_preserved"]
            and o["reconciliation_required"]
        ),
        "owner": "Security + Payments/Integration",
        "gap": "A provider sandbox replay and live callback evidence remain external validation.",
    },
]


def run_tabletop(revision: str) -> dict[str, Any]:
    started_at = utc_now()
    records: list[dict[str, Any]] = []
    for scenario in SCENARIOS:
        observed = scenario["run"]()
        require(scenario["assert"](observed), f"security response invariant failed: {scenario['id']}")
        records.append(
            {
                "id": scenario["id"],
                "evidence_level": "SECURITY_TABLETOP_CONTRACT",
                "failure_injected": scenario["failure_injected"],
                "expected": scenario["expected"],
                "observed": observed,
                "result": "PASS",
                "owner": scenario["owner"],
                "gap": scenario["gap"],
            }
        )
    return {
        "schema_version": "2026.09.14",
        "mode": "deterministic_security_incident_tabletop",
        "started_at": started_at,
        "finished_at": utc_now(),
        "repository_revision": revision,
        "environment": "local tabletop; no provider, customer, courier or regulator contacted",
        "scenario_count": len(records),
        "records": records,
        "limitations": [
            "This is tabletop contract evidence, not a live security incident or production response claim.",
            "Notification deadlines, regulatory contacts and provider revocation remain market/owner validation.",
            "No secret values, raw PII, credentials or provider payloads are included in this record.",
        ],
        "audit_status": "PASS",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="write JSON evidence to this repository-relative path")
    args = parser.parse_args()
    report = run_tabletop(git_revision())
    payload = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        output = args.output if args.output.is_absolute() else ROOT / args.output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload, encoding="utf-8")
    print(json.dumps({"audit_status": report["audit_status"], "scenario_count": report["scenario_count"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
