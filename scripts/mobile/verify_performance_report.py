#!/usr/bin/env python3
"""Fail-closed percentile gate for mobile performance measurements."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


def percentile(values: list[float], percentile_value: float) -> float:
    ordered = sorted(values)
    rank = max(1, math.ceil((percentile_value / 100) * len(ordered)))
    return ordered[rank - 1]


def load(path: str) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def check_measurement(budgets: dict[str, Any], measurement: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    app = measurement.get("app")
    surface = measurement.get("surface")
    tier = measurement.get("tier")
    app_policy = budgets.get("apps", {}).get(app, {})
    surface_policy = app_policy.get("surfaces", {}).get(surface)
    if not surface_policy:
        return [f"{app}/{surface}: no budget policy exists"]
    if tier not in budgets.get("required_tiers", []):
        errors.append(f"{app}/{surface}: unexpected tier {tier!r}")

    samples = measurement.get("samples", {})
    for metric, limit_key in (
        ("cold_start_ms", "cold_start_ms_p95_max"),
        ("warm_start_ms", "warm_start_ms_p95_max"),
        ("memory_pss_mb", "memory_pss_mb_p95_max"),
        ("janky_frames_pct", "janky_frames_pct_p95_max"),
        ("network_bytes", "network_bytes_p95_max"),
    ):
        values = samples.get(metric)
        if not isinstance(values, list) or len(values) < 20 or not all(isinstance(value, (int, float)) for value in values):
            errors.append(f"{app}/{surface}/{tier}: {metric} needs at least 20 numeric raw samples")
            continue
        actual = percentile([float(value) for value in values], 95)
        limit = float(surface_policy[limit_key])
        if actual > limit:
            errors.append(f"{app}/{surface}/{tier}: {metric} p95={actual:g} exceeds {limit_key}={limit:g}")

    artifact_size = measurement.get("artifact_size_bytes")
    artifact_limit = surface_policy.get("artifact_size_bytes_p95_max")
    if not isinstance(artifact_size, (int, float)) or artifact_size <= 0:
        errors.append(f"{app}/{surface}/{tier}: artifact_size_bytes is required")
    elif artifact_limit is not None and artifact_size > artifact_limit:
        errors.append(f"{app}/{surface}/{tier}: artifact_size_bytes={artifact_size:g} exceeds {artifact_limit:g}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--budgets", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    try:
        budgets = load(args.budgets)
        report = load(args.report)
        if report.get("schema_version") != budgets.get("schema_version"):
            raise ValueError("budget/report schema version mismatch")
        percentile_policy = budgets.get("percentile_policy", {})
        expected_metrics = ("latency_ms", "memory_mb", "jank_pct", "network_bytes")
        invalid_policy = [metric for metric in expected_metrics if percentile_policy.get(metric) != "p95"]
        if invalid_policy or percentile_policy.get("artifact_size_bytes") != "p95":
            raise ValueError("all performance budget metrics must use p95")
        measurements = report.get("measurements")
        if not isinstance(measurements, list) or not measurements:
            raise ValueError("report must contain at least one measurement")
        required = {(app, surface, tier) for app, policy in budgets.get("apps", {}).items() for surface in policy.get("surfaces", {}) for tier in budgets.get("required_tiers", [])}
        keys = [
            (item.get("app"), item.get("surface"), item.get("tier"))
            for item in measurements
            if isinstance(item, dict)
        ]
        seen = set(keys)
        duplicates = sorted(key for key in seen if keys.count(key) > 1)
        errors = [f"duplicate measurement: {app}/{surface}/{tier}" for app, surface, tier in duplicates]
        missing = sorted(required - seen)
        errors.extend(f"missing measurement: {app}/{surface}/{tier}" for app, surface, tier in missing)
        for measurement in measurements:
            if isinstance(measurement, dict):
                errors.extend(check_measurement(budgets, measurement))
        if errors:
            print("MOBILE PERFORMANCE GATE FAILED", file=sys.stderr)
            for error in errors:
                print(f"- {error}", file=sys.stderr)
            return 1
        print(json.dumps({
            "status": "PASS",
            "percentile": "p95",
            "measurements": len(measurements),
            "coverage": sorted(f"{app}/{surface}/{tier}" for app, surface, tier in seen),
        }))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"MOBILE PERFORMANCE GATE FAILED\n- {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
