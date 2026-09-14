#!/usr/bin/env python3
"""Contract tests for the fail-closed mobile rollout promotion gate."""

from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from validate_staged_rollout import load_json, main, validate_packet


COMMIT = "a" * 40
SHA = "b" * 64


def policy() -> dict:
    return load_json(Path(__file__).with_name("rollout_policy.json"))


def packet() -> dict:
    return {
        "schema_version": 1,
        "release": {
            "commit": COMMIT,
            "version_code": 42,
            "version_name": "1.0.42",
            "config_schema_version": 1,
            "artifact_sha256": SHA,
            "rollback_artifact_sha256": "c" * 64,
            "release_notes": "Staging release with additive order recovery changes.",
            "rollback_plan": "Disable the release flag and restore the recorded artifact.",
            "current_stage": "none",
            "current_stage_approved": True,
            "target_percentage": 1,
            "current_percentage": 0,
            "active_order_recovery": True,
            "support_recovery": True,
            "backend_compatibility": {
                "status": "compatible",
                "legacy_client_supported": True,
                "new_client_supported": True,
                "window_hours": 48,
            },
        },
        "metrics": {
            "window_start": "2026-09-14T00:00:00Z",
            "window_end": "2026-09-14T01:00:00Z",
            "sample_count": 100,
            "crash_free_sessions": 0.999,
            "anr_rate": 0.001,
            "payment_success_rate": 0.999,
            "create_order_success_rate": 0.999,
        },
    }


class StagedRolloutGateTests(unittest.TestCase):
    def test_valid_packet_passes(self) -> None:
        self.assertEqual(validate_packet(policy(), packet(), "internal", COMMIT), [])

    def test_guardrail_regression_fails_closed(self) -> None:
        candidate = packet()
        candidate["metrics"]["crash_free_sessions"] = 0.90
        candidate["metrics"]["payment_success_rate"] = 0.90
        errors = validate_packet(policy(), candidate, "internal", COMMIT)
        self.assertTrue(any("crash_free_sessions" in error for error in errors))
        self.assertTrue(any("payment_success_rate" in error for error in errors))

    def test_rollout_cannot_skip_stage_or_drop_recovery(self) -> None:
        candidate = copy.deepcopy(packet())
        candidate["release"]["current_stage"] = "internal"
        candidate["release"]["current_percentage"] = 1
        candidate["release"]["active_order_recovery"] = False
        errors = validate_packet(policy(), candidate, "percentage", COMMIT)
        self.assertTrue(any("exactly one rollout stage" in error for error in errors))
        self.assertTrue(any("active-order recovery" in error for error in errors))

    def test_cli_returns_nonzero_for_missing_packet(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            packet_path = Path(directory) / "packet.json"
            packet_path.write_text(json.dumps(packet()), encoding="utf-8")
            self.assertEqual(
                main(
                    [
                        "--policy",
                        str(Path(__file__).with_name("rollout_policy.json")),
                        "--packet",
                        str(packet_path),
                        "--target-stage",
                        "internal",
                        "--expected-commit",
                        "d" * 40,
                    ]
                ),
                1,
            )


if __name__ == "__main__":
    unittest.main()
