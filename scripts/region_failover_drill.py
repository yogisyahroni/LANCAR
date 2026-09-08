#!/usr/bin/env python3
"""Validate and exercise the LANCAR regional failover contract.

The repository currently has a single-VPS deployment, so this tool intentionally
does not call a live region or provider. It is a deterministic, auditable proof
of the routing and replay invariants that a future edge/control-plane adapter
must enforce.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "infra" / "regions" / "region-catalog.yaml"


class ContractError(ValueError):
    """Raised when the catalog violates a safety invariant."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_catalog(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            catalog = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot load catalog {path}: {exc}") from exc
    validate_catalog(catalog)
    return catalog


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractError(message)


def validate_catalog(catalog: Dict[str, Any]) -> None:
    _require(catalog.get("schema_version") == "2026.09.08", "unsupported catalog schema")
    routing = catalog.get("routing")
    _require(isinstance(routing, dict), "routing policy is required")
    _require(routing.get("operator_approval_required_for_promotion") is True, "promotion must require operator approval")
    _require(routing.get("fail_closed_write_domains"), "write fail-closed domains are required")

    regions = catalog.get("regions")
    _require(isinstance(regions, list) and len(regions) >= 2, "at least two regions are required")
    region_ids = [region.get("id") for region in regions]
    _require(len(region_ids) == len(set(region_ids)), "region IDs must be unique")
    for region in regions:
        _require(region.get("role") in {"primary", "standby"}, f"invalid region role: {region}")
        _require(region.get("lifecycle") in {"active", "standby", "draining"}, f"invalid lifecycle: {region}")
        _require(bool(region.get("market_codes")), f"region has no markets: {region.get('id')}")
        _require(bool(region.get("api_base_url_env")), f"region has no endpoint env: {region.get('id')}")
        if region.get("role") == "standby":
            _require(region.get("transactional_writes") is False, f"standby cannot accept writes: {region.get('id')}")

    markets: Set[str] = {market for region in regions for market in region["market_codes"]}
    for market in markets:
        primary_count = sum(1 for region in regions if market in region["market_codes"] and region["role"] == "primary")
        standby_count = sum(1 for region in regions if market in region["market_codes"] and region["role"] == "standby")
        _require(primary_count == 1, f"market {market} must have exactly one configured primary")
        _require(standby_count >= 1, f"market {market} must have a standby")

    datasets = catalog.get("datasets")
    _require(isinstance(datasets, list) and datasets, "datasets are required")
    domains: Set[str] = set()
    for dataset in datasets:
        domain = dataset.get("domain")
        _require(domain and domain not in domains, f"dataset domain must be unique: {domain}")
        domains.add(domain)
        _require(dataset.get("affinity"), f"dataset affinity missing: {domain}")
        _require(dataset.get("replication"), f"dataset replication missing: {domain}")
        _require(isinstance(dataset.get("rpo_minutes"), int) and dataset["rpo_minutes"] >= 0, f"invalid RPO: {domain}")
        _require(isinstance(dataset.get("rto_minutes"), int) and dataset["rto_minutes"] > 0, f"invalid RTO: {domain}")
        resident = set(dataset.get("resident_fields", []))
        cross_region = set(dataset.get("cross_region_fields", []))
        _require(resident.isdisjoint(cross_region), f"field crosses residency boundary: {domain}")

    operations = catalog.get("operations", {})
    transactional_write = operations.get("transactional_write", {})
    _require(transactional_write.get("fallback_region") == "none", "transactional writes cannot fail over implicitly")
    _require(transactional_write.get("requires_idempotency_key") is True, "transactional writes require idempotency")
    _require(operations.get("notification_delivery", {}).get("client_success_without_provider_ack") is False,
             "notification success cannot be fabricated")

    replay = catalog.get("event_replay", {})
    _require(replay.get("dedupe_key") and replay.get("ordering_key"), "replay dedupe and ordering keys are required")
    _require(replay.get("side_effect_policy") == "consumer_idempotency_required", "replay side effects must be idempotent")


def _region(catalog: Dict[str, Any], region_id: str) -> Dict[str, Any]:
    for region in catalog["regions"]:
        if region["id"] == region_id:
            return region
    raise ContractError(f"unknown region: {region_id}")


def _primary_for_market(catalog: Dict[str, Any], market: str) -> Dict[str, Any]:
    candidates = [region for region in catalog["regions"] if market in region["market_codes"] and region["role"] == "primary"]
    if len(candidates) != 1:
        raise ContractError(f"market {market} does not have one primary")
    return candidates[0]


def effective_primary(catalog: Dict[str, Any], market: str, health: Dict[str, Any]) -> Dict[str, Any]:
    promoted_id = health.get("promoted_region_id")
    if promoted_id:
        promoted = _region(catalog, promoted_id)
        _require(market in promoted["market_codes"], f"promoted region is outside market: {promoted_id}")
        _require(health.get("regions", {}).get(promoted_id, {}).get("promotion_approved") is True,
                 "promoted region lacks operator approval")
        return promoted
    return _primary_for_market(catalog, market)


def is_healthy(health: Dict[str, Any], region_id: str, transactional: bool = False) -> bool:
    state = health.get("regions", {}).get(region_id, {})
    if state.get("status") != "healthy":
        return False
    if transactional and state.get("transactional_ready") is not True:
        return False
    return True


def route_request(catalog: Dict[str, Any], market: str, operation: str, health: Dict[str, Any]) -> Dict[str, Any]:
    """Return a safe route decision; reject rather than use stale transactional state."""

    if operation == "transactional_write":
        primary = effective_primary(catalog, market, health)
        if not is_healthy(health, primary["id"], transactional=True):
            return {"accepted": False, "region_id": None, "reason_code": "REGION_PRIMARY_UNAVAILABLE", "degraded": True}
        return {"accepted": True, "region_id": primary["id"], "reason_code": "ROUTED_TO_APPROVED_PRIMARY", "degraded": False}

    if operation == "transactional_read":
        primary = effective_primary(catalog, market, health)
        if is_healthy(health, primary["id"], transactional=True):
            return {"accepted": True, "region_id": primary["id"], "reason_code": "ROUTED_TO_PRIMARY", "degraded": False}
        return {"accepted": False, "region_id": None, "reason_code": "REGION_READ_NOT_READY", "degraded": True}

    if operation == "non_critical_read":
        candidates = [
            region for region in catalog["regions"]
            if market in region["market_codes"] and region["lifecycle"] != "draining" and is_healthy(health, region["id"])
        ]
        candidates.sort(key=lambda region: region["priority"], reverse=True)
        if candidates:
            selected = candidates[0]
            return {"accepted": True, "region_id": selected["id"], "reason_code": "REGION_DEGRADED_READ_ONLY", "degraded": selected["role"] != "primary"}
        return {"accepted": False, "region_id": None, "reason_code": "NO_HEALTHY_REGION", "degraded": True}

    if operation == "notification_delivery":
        return {"accepted": False, "region_id": None, "reason_code": "NOTIFICATION_DEFERRED", "degraded": True}

    raise ContractError(f"unsupported operation: {operation}")


def replay_events(events: Iterable[Dict[str, str]]) -> Dict[str, Any]:
    event_list = list(events)
    processed: Set[str] = set()
    operation_keys: Set[str] = set()
    duplicate_events = 0
    duplicate_mutations = 0
    applied: List[str] = []
    for event in event_list:
        event_id = event["event_id"]
        operation_key = event["operation_key"]
        if event_id in processed:
            duplicate_events += 1
            continue
        processed.add(event_id)
        if operation_key in operation_keys:
            duplicate_mutations += 1
            continue
        operation_keys.add(operation_key)
        applied.append(operation_key)
    return {
        "input_events": len(event_list),
        "applied_mutations": len(applied),
        "duplicate_events_suppressed": duplicate_events,
        "duplicate_mutations_suppressed": duplicate_mutations,
        "applied_operation_keys": applied,
    }


def run_drill(catalog: Dict[str, Any]) -> Dict[str, Any]:
    start = time.perf_counter()
    primary_id = "id-jk-primary"
    secondary_id = "id-jk-secondary"
    initial_health = {
        "regions": {
            primary_id: {"status": "healthy", "transactional_ready": True, "promotion_approved": False},
            secondary_id: {"status": "healthy", "transactional_ready": False, "promotion_approved": False},
        }
    }
    checks: List[Dict[str, Any]] = []

    initial_write = route_request(catalog, "id-jk", "transactional_write", initial_health)
    _require(initial_write["accepted"] and initial_write["region_id"] == primary_id, "initial write did not use primary")
    checks.append({"name": "initial_transactional_write", "result": "PASS", "region_id": initial_write["region_id"]})

    outage_health = {
        "regions": {
            primary_id: {"status": "unhealthy", "transactional_ready": False, "promotion_approved": False},
            secondary_id: {"status": "healthy", "transactional_ready": False, "promotion_approved": False},
        }
    }
    rejected_write = route_request(catalog, "id-jk", "transactional_write", outage_health)
    _require(not rejected_write["accepted"] and rejected_write["reason_code"] == "REGION_PRIMARY_UNAVAILABLE", "stale write was not rejected")
    checks.append({"name": "primary_outage_write_fence", "result": "PASS", "reason_code": rejected_write["reason_code"]})

    degraded_read = route_request(catalog, "id-jk", "non_critical_read", outage_health)
    _require(degraded_read["accepted"] and degraded_read["region_id"] == secondary_id and degraded_read["degraded"], "non-critical read did not degrade safely")
    checks.append({"name": "non_critical_read_degradation", "result": "PASS", "region_id": degraded_read["region_id"]})

    promoted_health = {
        "promoted_region_id": secondary_id,
        "regions": {
            primary_id: {"status": "unhealthy", "transactional_ready": False, "promotion_approved": False},
            secondary_id: {"status": "healthy", "transactional_ready": True, "promotion_approved": True},
        }
    }
    promoted_write = route_request(catalog, "id-jk", "transactional_write", promoted_health)
    _require(promoted_write["accepted"] and promoted_write["region_id"] == secondary_id, "approved promotion did not route writes")
    checks.append({"name": "approved_promotion", "result": "PASS", "region_id": promoted_write["region_id"]})

    events = [
        {"event_id": "evt-order-1", "operation_key": "order:create:1"},
        {"event_id": "evt-payment-1", "operation_key": "payment:authorize:1"},
        {"event_id": "evt-payment-1", "operation_key": "payment:authorize:1"},
        {"event_id": "evt-payout-1", "operation_key": "payout:credit:1"},
        {"event_id": "evt-awb-1", "operation_key": "awb:create:1"},
        {"event_id": "evt-carrier-1", "operation_key": "carrier:event:provider-1"},
        {"event_id": "evt-carrier-replay", "operation_key": "carrier:event:provider-1"},
    ]
    replay = replay_events(events)
    _require(replay["applied_mutations"] == 5, "replay applied an unexpected number of mutations")
    _require(replay["duplicate_events_suppressed"] == 1 and replay["duplicate_mutations_suppressed"] == 1,
             "replay did not suppress both duplicate forms")
    checks.append({"name": "outbox_replay_dedup", "result": "PASS", "replay": replay})

    deferred = route_request(catalog, "id-jk", "notification_delivery", outage_health)
    _require(not deferred["accepted"] and deferred["reason_code"] == "NOTIFICATION_DEFERRED", "notification outage fabricated success")
    checks.append({"name": "non_critical_notification_degradation", "result": "PASS", "reason_code": deferred["reason_code"]})

    elapsed_ms = round((time.perf_counter() - start) * 1000, 3)
    return {
        "mode": "local_deterministic_drill",
        "started_at": utc_now(),
        "catalog_schema": catalog["schema_version"],
        "scenario": "id-jk-primary outage -> write fence -> approved standby promotion -> outbox replay",
        "checks": checks,
        "observed": {
            "rpo_target_minutes": {dataset["domain"]: dataset["rpo_minutes"] for dataset in catalog["datasets"]},
            "rto_target_minutes": {dataset["domain"]: dataset["rto_minutes"] for dataset in catalog["datasets"]},
            "measured_logic_execution_ms": elapsed_ms,
        },
        "limitations": [
            "No live cloud region, database replica, DNS/edge provider, or external carrier was contacted.",
            "Production RPO/RTO remains an environment drill and must be measured after regional infrastructure is provisioned.",
        ],
        "audit_status": "PASS",
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--validate", action="store_true", help="validate catalog invariants")
    parser.add_argument("--drill", action="store_true", help="run the deterministic failover/replay drill")
    args = parser.parse_args(argv)
    if not args.validate and not args.drill:
        parser.error("choose --validate or --drill")
    try:
        catalog = load_catalog(args.catalog)
        if args.validate:
            print(json.dumps({"catalog": str(args.catalog), "schema_version": catalog["schema_version"], "status": "PASS"}, indent=2))
        if args.drill:
            print(json.dumps(run_drill(catalog), indent=2))
        return 0
    except ContractError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
