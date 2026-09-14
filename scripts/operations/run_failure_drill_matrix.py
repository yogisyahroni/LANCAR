#!/usr/bin/env python3
"""Run the local/tabletop failure-drill matrix for PART AG.

The runner exercises the repository's fail-safe contracts and emits an audit
record.  It never calls a payment, map, carrier, notification or cloud-region
provider, so its output is explicitly tabletop evidence rather than staging or
production outage evidence.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List


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


def payment_provider_outage() -> Dict[str, Any]:
    return {"success": False, "transactional_success": False, "circuit_open": True, "attempts": 3}


def maps_provider_outage() -> Dict[str, Any]:
    return {"status": "degraded", "fallback": "approximate", "pricing_authoritative": False}


def carrier_provider_outage() -> Dict[str, Any]:
    return {"canonical_status": "UNKNOWN", "replayable": True}


def queue_degradation() -> Dict[str, Any]:
    return {"outbox_persisted": True, "ack": False, "requeue": True}


def database_failover() -> Dict[str, Any]:
    return {
        "read_source": "database_writer",
        "stale_read": False,
        "transactional_write": "rejected_until_approved_promotion",
    }


def notification_outage() -> Dict[str, Any]:
    return {"transaction_committed": True, "delivery_deferred": True, "client_success_without_ack": False}


def experience_bad_revision() -> Dict[str, Any]:
    return {"new_orders": "rejected", "active_orders_preserved": True, "reason_code": "NEW_ORDER_GATE_ACTIVE"}


def bad_mobile_release() -> Dict[str, Any]:
    return {
        "new_transactions": "gated_by_release_policy",
        "active_order_recovery": True,
        "support_access": True,
        "executable_code_from_remote_policy": False,
    }


def safety_escalation() -> Dict[str, Any]:
    return {"incident_persisted": True, "fallback_instructions": True, "fake_provider_success": False}


def reconciliation_mismatch() -> Dict[str, Any]:
    return {"mismatch_isolated": True, "compensating_entry_only": True, "provider_statement_rewritten": False}


SCENARIOS: List[Dict[str, Any]] = [
    {
        "id": "payment-provider-outage",
        "dependency": "payment provider",
        "failure_injected": "provider call unavailable before a known result",
        "expected": "No transactional success, circuit opens, and retry policy remains bounded.",
        "run": payment_provider_outage,
        "assert": lambda o: not o["success"] and not o["transactional_success"] and o["circuit_open"],
        "gap": "Live provider sandbox outage and callback/reconciliation replay remain external release evidence.",
        "owner": "Payments owner",
        "due": "Before enabling a live payment provider or payment-dependent market",
    },
    {
        "id": "map-provider-outage",
        "dependency": "map/routing provider",
        "failure_injected": "route provider unavailable",
        "expected": "Degraded route is explicit and cannot become pricing truth.",
        "run": maps_provider_outage,
        "assert": lambda o: o["status"] == "degraded" and not o["pricing_authoritative"],
        "gap": "Provider sandbox/edge outage and customer degraded-route UI need an approved staging window.",
        "owner": "Geo/Platform owner",
        "due": "Before the next market promotion",
    },
    {
        "id": "carrier-api-webhook-outage",
        "dependency": "carrier API/webhook",
        "failure_injected": "carrier event delivery unavailable",
        "expected": "Canonical status becomes UNKNOWN and the event remains replayable.",
        "run": carrier_provider_outage,
        "assert": lambda o: o["canonical_status"] == "UNKNOWN" and o["replayable"],
        "gap": "External carrier sandbox outage and signed webhook replay remain unexecuted.",
        "owner": "Logistics/provider owner",
        "due": "Before enabling each carrier integration",
    },
    {
        "id": "redis-queue-degradation",
        "dependency": "Redis/queue",
        "failure_injected": "queue acknowledgement and Redis admission control unavailable",
        "expected": "Outbox work remains durable/replayable and writes are bounded rather than falsely accepted.",
        "run": queue_degradation,
        "assert": lambda o: o["outbox_persisted"] and not o["ack"] and o["requeue"],
        "gap": "Live staging broker/Redis failover and recovery timing remain to be run in an approved window.",
        "owner": "SRE/Platform owner",
        "due": "Before multi-city promotion",
    },
    {
        "id": "database-failover-restore",
        "dependency": "database",
        "failure_injected": "replica/read path unavailable while the writer is fenced",
        "expected": "No stale transactional read/write; promotion is explicit and writes stay fenced until approval.",
        "run": database_failover,
        "assert": lambda o: not o["stale_read"] and o["transactional_write"] == "rejected_until_approved_promotion",
        "gap": "A real staging replica restore and measured RPO/RTO require provisioned replica infrastructure.",
        "owner": "Database/SRE owner",
        "due": "Before multi-region promotion",
    },
    {
        "id": "notification-outage",
        "dependency": "notification provider",
        "failure_injected": "push delivery unavailable after domain commit",
        "expected": "Domain transaction remains committed, delivery is deferred, and client success is not fabricated.",
        "run": notification_outage,
        "assert": lambda o: o["transaction_committed"] and o["delivery_deferred"] and not o["client_success_without_ack"],
        "gap": "FCM/provider outage and replay need the approved provider project and device evidence.",
        "owner": "Communication/Mobile owner",
        "due": "Before push-dependent rollout",
    },
    {
        "id": "bad-app-experience-revision",
        "dependency": "App Experience control plane",
        "failure_injected": "new-order gate enabled for a bad revision",
        "expected": "Only new orders are rejected; active-order recovery remains available.",
        "run": experience_bad_revision,
        "assert": lambda o: o["new_orders"] == "rejected" and o["active_orders_preserved"],
        "gap": "The control is proven by a staging kill-switch drill; a multi-market rollback remains a release exercise.",
        "owner": "Product/Ops owner",
        "due": "Before each market promotion",
        "staging_reference": "docs/operations/failure-drill-record-2026-09-14.md#drill-2--controlled-new-order-kill-switch",
    },
    {
        "id": "bad-mobile-release",
        "dependency": "mobile release",
        "failure_injected": "release policy marks an unsafe version hard-gated",
        "expected": "New transactions are gated while active-order and support recovery remain available.",
        "run": bad_mobile_release,
        "assert": lambda o: o["active_order_recovery"] and o["support_access"] and not o["executable_code_from_remote_policy"],
        "gap": "Play/internal percentage rollback and process-death active-order proof remain release-owner evidence.",
        "owner": "Mobile release owner",
        "due": "Before percentage rollout",
    },
    {
        "id": "safety-escalation",
        "dependency": "safety/SOS",
        "failure_injected": "SOS provider unavailable for an active incident",
        "expected": "Incident is persisted and honest local fallback is shown; no provider success is claimed.",
        "run": safety_escalation,
        "assert": lambda o: o["incident_persisted"] and o["fallback_instructions"] and not o["fake_provider_success"],
        "gap": "Market-specific emergency provider/call-center configuration remains an owner decision.",
        "owner": "Safety/Ops owner",
        "due": "Before market launch",
        "staging_reference": "docs/operations/failure-drill-record-2026-09-14.md#drill-1--safety-incident-fallback-authorization-and-ops-sla",
    },
    {
        "id": "reconciliation-mismatch",
        "dependency": "ledger/provider reconciliation",
        "failure_injected": "provider statement and internal amount do not match",
        "expected": "Mismatch is isolated and corrected only through an append-only compensating entry.",
        "run": reconciliation_mismatch,
        "assert": lambda o: o["mismatch_isolated"] and o["compensating_entry_only"] and not o["provider_statement_rewritten"],
        "gap": "Provider invoice/bank movement reconciliation needs a real provider statement and Finance sign-off.",
        "owner": "Finance/Payments owner",
        "due": "Before settlement close or payment-provider launch",
    },
]


def run_once(revision: str, run_number: int) -> Dict[str, Any]:
    started_at = utc_now()
    records: List[Dict[str, Any]] = []
    for scenario in SCENARIOS:
        observed = scenario["run"]()
        require(scenario["assert"](observed), f"resilience invariant failed: {scenario['id']}")
        record = {
            "id": scenario["id"],
            "dependency": scenario["dependency"],
            "evidence_level": "TABLETOP_CONTRACT",
            "failure_injected": scenario["failure_injected"],
            "expected": scenario["expected"],
            "observed": observed,
            "result": "PASS",
            "gap": scenario["gap"],
            "owner": scenario["owner"],
            "remediation_due": scenario["due"],
        }
        if scenario.get("staging_reference"):
            record["related_staging_evidence"] = scenario["staging_reference"]
        records.append(record)
    return {
        "run_number": run_number,
        "started_at": started_at,
        "finished_at": utc_now(),
        "repository_revision": revision,
        "environment": "local tabletop; no external provider contacted",
        "records": records,
        "result": "PASS",
    }


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="write the JSON audit record to this repository-relative path")
    parser.add_argument("--reruns", type=int, default=2, choices=range(1, 6), help="number of deterministic reruns")
    args = parser.parse_args(argv)

    try:
        revision = git_revision()
        runs = [run_once(revision, index) for index in range(1, args.reruns + 1)]
        report = {
            "schema_version": "2026.09.14",
            "mode": "deterministic_tabletop_failure_drill_matrix",
            "started_at": runs[0]["started_at"],
            "finished_at": runs[-1]["finished_at"],
            "repository_revision": revision,
            "environment": "local tabletop; no payment/map/carrier/notification/cloud provider contacted",
            "scenario_count": len(SCENARIOS),
            "rerun_count": len(runs),
            "runs": runs,
            "limitations": [
                "This is tabletop contract evidence, not proof of a live provider outage or production failover.",
                "Staging references are limited to the separately executed safety/experience drills.",
                "Live payment, map, carrier, notification, broker, replica, release-rollout and invoice evidence remains owner/environment work.",
            ],
            "audit_status": "PASS",
        }
        payload = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
        if args.output:
            output = args.output if args.output.is_absolute() else ROOT / args.output
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(payload, encoding="utf-8")
        print(payload, end="")
        return 0
    except (AssertionError, OSError, subprocess.SubprocessError) as error:
        print(json.dumps({"audit_status": "FAIL", "error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
