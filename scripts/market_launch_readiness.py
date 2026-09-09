"""Validate repository-owned market launch contracts without contacting providers.

This is a deterministic preflight. It proves that the launch control plane,
financial contracts, provider boundaries, client flows and recovery runbooks
are present and internally wired. It deliberately does not claim staging,
provider, store, capacity or production success.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from region_failover_drill import load_catalog, run_drill, validate_catalog  # noqa: E402


ContractCheck = Tuple[str, Path, Iterable[str]]


CONTRACT_CHECKS: List[ContractCheck] = [
    (
        "market_control_plane",
        ROOT / "backend/admin-service/src/services/marketConfig.ts",
        ("market_config_readiness", "launch_state", "approval_status", "rollback_version"),
    ),
    (
        "compliance_boundary",
        ROOT / "database/migrations/20260908000023_global_compliance_boundary.sql",
        ("market_compliance_requirements", "market_compliance_data_policies", "market_config_readiness"),
    ),
    (
        "money_tax_reconciliation",
        ROOT / "docs/contracts/multi-currency-money-2026.md",
        ("currency", "tax", "reconciliation", "settlement"),
    ),
    (
        "payment_provider_boundary",
        ROOT / "backend/admin-service/src/envValidation.ts",
        ("MIDTRANS_ENV", "MIDTRANS_SERVER_KEY", "production"),
    ),
    (
        "maps_provider_readiness",
        ROOT / "backend/admin-service/src/services/mapsProductionReadiness.ts",
        ("overall_status", "shared_key_findings", "active_alerts"),
    ),
    (
        "logistics_provider_boundary",
        ROOT / "backend/integration-gateway/internal/provider/logistics_registry.go",
        ("ProviderDescriptor", "Availability", "degraded"),
    ),
    (
        "support_and_on_call",
        ROOT / "docs/sre/service-catalog.md",
        ("Customer Communications on-call", "Payments/Finance on-call", "admin-service"),
    ),
    (
        "data_residency",
        ROOT / "docs/runbooks/data-residency.md",
        ("home region", "retention", "failover drill", "approval"),
    ),
    (
        "capacity_and_load_profile",
        ROOT / "docs/sre/capacity-model.md",
        ("Quote / route calculation", "Order create", "Payment callback", "Provider webhook"),
    ),
    (
        "localized_client_flows",
        ROOT / "frontend/e2e/localization.spec.ts",
        ("RTL", "long", "locale"),
    ),
    (
        "kill_switch_and_market_degrade",
        ROOT / "database/migrations/20260907000018_marketplace_fairness_kill_switch.sql",
        ("marketplace_pricing_kill_switch", "false"),
    ),
    (
        "rollback_and_region_recovery",
        ROOT / "docs/runbooks/region-failover.md",
        ("write fence", "replay", "rollback", "reconciled"),
    ),
]


def check_contracts() -> List[Dict[str, Any]]:
    checks: List[Dict[str, Any]] = []
    for name, path, required in CONTRACT_CHECKS:
        if not path.exists():
            checks.append({"name": name, "result": "FAIL", "reason": f"missing: {path.relative_to(ROOT)}"})
            continue
        content = path.read_text(encoding="utf-8").lower()
        missing = [token for token in required if token.lower() not in content]
        checks.append({
            "name": name,
            "result": "PASS" if not missing else "FAIL",
            "file": str(path.relative_to(ROOT)),
            "missing": missing,
        })
    return checks


def validate_region_contract() -> Dict[str, Any]:
    catalog_path = ROOT / "infra/regions/region-catalog.yaml"
    catalog = load_catalog(catalog_path)
    validate_catalog(catalog)
    return {
        "name": "region_catalog",
        "result": "PASS",
        "file": str(catalog_path.relative_to(ROOT)),
        "schema_version": catalog["schema_version"],
    }


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate", action="store_true", help="validate repository launch contracts")
    parser.add_argument("--drill", action="store_true", help="run the deterministic region/fence/replay drill")
    args = parser.parse_args(argv)
    if not args.validate and not args.drill:
        parser.error("choose --validate or --drill")

    try:
        checks = check_contracts() if args.validate or args.drill else []
        checks.append(validate_region_contract())
        drill: Dict[str, Any] | None = None
        if args.drill:
            catalog = load_catalog(ROOT / "infra/regions/region-catalog.yaml")
            drill = run_drill(catalog)
            checks.append({"name": "regional_failover_drill", "result": drill["audit_status"], "check_count": len(drill["checks"])})

        failed = [check for check in checks if check["result"] != "PASS"]
        report: Dict[str, Any] = {
            "mode": "repository_contract_preflight",
            "status": "FAIL" if failed else "PASS",
            "checks": checks,
            "external_runtime_validation": "NOT_RUN",
            "limitations": [
                "No provider, payment gateway, app store, staging endpoint, cloud region or production database was contacted.",
                "Capacity acceptance still requires the approved k6/load window and recorded resource headroom.",
                "Mobile interactive acceptance still requires an authorized emulator/device session.",
            ],
        }
        if drill is not None:
            report["regional_failover_drill"] = drill
        print(json.dumps(report, indent=2))
        return 1 if failed else 0
    except Exception as exc:  # pragma: no cover - CLI failure is surfaced as JSON
        print(json.dumps({"mode": "repository_contract_preflight", "status": "FAIL", "error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
