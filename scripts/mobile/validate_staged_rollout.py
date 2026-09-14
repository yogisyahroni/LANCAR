#!/usr/bin/env python3
"""Fail-closed promotion gate for mobile staged rollout packets.

The packet is an operator-produced, redacted release report. This command
does not contact Play Console, Firebase, a payment provider, or a customer
system; it validates that the evidence supplied to a promotion has the
required shape and remains inside the repository release policy.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


STAGES = ("none", "internal", "alpha", "beta", "percentage")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _number(value: Any, name: str, errors: list[str]) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        errors.append(f"{name} must be numeric")
        return None
    number = float(value)
    if not math.isfinite(number):
        errors.append(f"{name} must be finite")
        return None
    return number


def _required_text(value: Any, name: str, errors: list[str], minimum: int = 1) -> str | None:
    if not isinstance(value, str) or len(value.strip()) < minimum:
        errors.append(f"{name} must be a non-empty string of at least {minimum} characters")
        return None
    return value.strip()


def validate_packet(
    policy: dict[str, Any], packet: dict[str, Any], target_stage: str, expected_commit: str | None = None
) -> list[str]:
    errors: list[str] = []
    if policy.get("schema_version") != 1:
        errors.append("unsupported rollout policy schema_version")
    if packet.get("schema_version") != 1:
        errors.append("unsupported rollout packet schema_version")
    if target_stage not in STAGES[1:]:
        errors.append(f"target stage must be one of {', '.join(STAGES[1:])}")

    release = packet.get("release")
    metrics = packet.get("metrics")
    if not isinstance(release, dict):
        errors.append("release object is required")
        release = {}
    if not isinstance(metrics, dict):
        errors.append("metrics object is required")
        metrics = {}

    commit = _required_text(release.get("commit"), "release.commit", errors, 40)
    if commit and not COMMIT.fullmatch(commit):
        errors.append("release.commit must be a 40-character lowercase git SHA")
    if expected_commit and commit != expected_commit:
        errors.append("release.commit does not match the workflow commit")
    version_code = _number(release.get("version_code"), "release.version_code", errors)
    if version_code is not None and (version_code <= 0 or version_code != int(version_code)):
        errors.append("release.version_code must be a positive integer")
    _required_text(release.get("version_name"), "release.version_name", errors)
    _required_text(release.get("release_notes"), "release.release_notes", errors, 20)
    _required_text(release.get("rollback_plan"), "release.rollback_plan", errors, 20)
    for field in ("artifact_sha256", "rollback_artifact_sha256"):
        value = _required_text(release.get(field), f"release.{field}", errors)
        if value and not SHA256.fullmatch(value.lower()):
            errors.append(f"release.{field} must be a 64-character SHA-256")
    config_schema = _number(release.get("config_schema_version"), "release.config_schema_version", errors)
    if config_schema is not None and (config_schema <= 0 or config_schema != int(config_schema)):
        errors.append("release.config_schema_version must be a positive integer")

    current_stage = release.get("current_stage")
    if current_stage not in STAGES:
        errors.append("release.current_stage is invalid")
        current_stage = "none"
    if target_stage not in STAGES:
        target_index = -1
    else:
        target_index = STAGES.index(target_stage)
    if target_stage in STAGES[1:] and STAGES.index(current_stage) + 1 != target_index:
        errors.append("promotion must advance exactly one rollout stage")
    if release.get("current_stage_approved") is not True:
        errors.append("release.current_stage_approved must be true")

    target_percentage = _number(release.get("target_percentage"), "release.target_percentage", errors)
    current_percentage = _number(release.get("current_percentage"), "release.current_percentage", errors)
    stage_policy = next((item for item in policy.get("stages", []) if item.get("name") == target_stage), None)
    if not isinstance(stage_policy, dict):
        errors.append("target stage is missing from rollout policy")
    elif target_percentage is not None and target_percentage > float(stage_policy.get("max_percentage", 0)):
        errors.append("target percentage exceeds the target stage policy")
    if target_percentage is not None and (target_percentage <= 0 or target_percentage > 100):
        errors.append("release.target_percentage must be between 0 and 100")
    if current_percentage is not None and target_percentage is not None and target_percentage <= current_percentage:
        errors.append("target percentage must increase")

    if release.get("active_order_recovery") is not True:
        errors.append("active-order recovery must remain available")
    if release.get("support_recovery") is not True:
        errors.append("support recovery must remain available")

    compatibility = release.get("backend_compatibility")
    if not isinstance(compatibility, dict):
        errors.append("release.backend_compatibility object is required")
        compatibility = {}
    if compatibility.get("status") != "compatible":
        errors.append("backend compatibility status must be compatible")
    for field in ("legacy_client_supported", "new_client_supported"):
        if compatibility.get(field) is not True:
            errors.append(f"backend compatibility requires {field}=true")
    window = _number(compatibility.get("window_hours"), "release.backend_compatibility.window_hours", errors)
    minimum_window = float(policy.get("compatibility", {}).get("minimum_compatibility_window_hours", 0))
    if window is not None and window < minimum_window:
        errors.append("backend compatibility window is shorter than policy")

    sample_count = _number(metrics.get("sample_count"), "metrics.sample_count", errors)
    minimum_samples = float(policy.get("guardrails", {}).get("minimum_sample_count", 0))
    if sample_count is not None and sample_count < minimum_samples:
        errors.append("guardrail sample_count is below policy minimum")
    for field in ("window_start", "window_end"):
        _required_text(metrics.get(field), f"metrics.{field}", errors)

    guardrails = policy.get("guardrails", {})
    measured = {
        "crash_free_sessions": ("crash_free_sessions_min", "min"),
        "anr_rate": ("anr_rate_max", "max"),
        "payment_success_rate": ("payment_success_rate_min", "min"),
        "create_order_success_rate": ("create_order_success_rate_min", "min"),
    }
    for metric, (policy_key, direction) in measured.items():
        value = _number(metrics.get(metric), f"metrics.{metric}", errors)
        if value is None:
            continue
        if not 0 <= value <= 1:
            errors.append(f"metrics.{metric} must be between 0 and 1")
            continue
        threshold = _number(guardrails.get(policy_key), f"policy.guardrails.{policy_key}", errors)
        if threshold is None:
            continue
        if direction == "min" and value < threshold:
            errors.append(f"guardrail failed: {metric}={value:g} below {threshold:g}")
        if direction == "max" and value > threshold:
            errors.append(f"guardrail failed: {metric}={value:g} above {threshold:g}")

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--policy", type=Path, required=True)
    parser.add_argument("--packet", type=Path, required=True)
    parser.add_argument("--target-stage", required=True)
    parser.add_argument("--expected-commit")
    args = parser.parse_args(argv)

    try:
        policy = load_json(args.policy)
        packet = load_json(args.packet)
        errors = validate_packet(policy, packet, args.target_stage, args.expected_commit)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"MOBILE ROLLOUT GATE FAIL: {error}", file=sys.stderr)
        return 1

    if errors:
        print("MOBILE ROLLOUT GATE FAIL")
        for error in errors:
            print(f"- {error}")
        return 1
    packet_digest = hashlib.sha256(args.packet.read_bytes()).hexdigest()
    print(f"MOBILE ROLLOUT GATE PASS: target={args.target_stage} packet_sha256={packet_digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
