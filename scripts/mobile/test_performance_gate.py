#!/usr/bin/env python3
"""Contract test for the fail-closed mobile performance release gate."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from verify_performance_report import check_measurement, load, main as verify_main, percentile


def measurement(budgets: dict, app: str, surface: str, tier: str) -> dict:
    policy = budgets["apps"][app]["surfaces"][surface]
    return {
        "app": app,
        "surface": surface,
        "tier": tier,
        "samples": {
            "cold_start_ms": [policy["cold_start_ms_p95_max"]] * 20,
            "warm_start_ms": [policy["warm_start_ms_p95_max"]] * 20,
            "memory_pss_mb": [policy["memory_pss_mb_p95_max"]] * 20,
            "janky_frames_pct": [policy["janky_frames_pct_p95_max"]] * 20,
            "network_bytes": [policy["network_bytes_p95_max"]] * 20,
        },
        "artifact_size_bytes": policy["artifact_size_bytes_p95_max"],
    }


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    budgets = load(str(root / "scripts/mobile/performance_budgets.json"))
    assert percentile([1, 2, 3, 4, 5], 95) == 5

    passing = [
        measurement(budgets, app, surface, tier)
        for app, app_policy in budgets["apps"].items()
        for surface in app_policy["surfaces"]
        for tier in budgets["required_tiers"]
    ]
    assert all(not check_measurement(budgets, item) for item in passing)

    regression = measurement(budgets, "merchant", "launch", "mid")
    regression["samples"]["cold_start_ms"] = [2501] * 20
    assert check_measurement(budgets, regression)

    insufficient = measurement(budgets, "merchant", "launch", "mid")
    insufficient["samples"]["warm_start_ms"] = [1] * 19
    assert check_measurement(budgets, insufficient)

    with tempfile.TemporaryDirectory() as directory:
        report = Path(directory) / "passing.json"
        report.write_text(json.dumps({"schema_version": 1, "measurements": passing}), encoding="utf-8")
        original_argv = __import__("sys").argv
        __import__("sys").argv = [
            "verify_performance_report.py",
            "--budgets",
            str(root / "scripts/mobile/performance_budgets.json"),
            "--report",
            str(report),
        ]
        try:
            assert verify_main() == 0
        finally:
            __import__("sys").argv = original_argv

    print("MOBILE PERFORMANCE GATE CONTRACT PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
