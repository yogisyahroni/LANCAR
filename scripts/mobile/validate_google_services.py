#!/usr/bin/env python3
"""Validate and materialize Android google-services.json for CI release builds."""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import sys
from typing import Any


BLOCKED_MARKERS = (
    "dummy",
    "placeholder",
    "replace_me",
    "changeme",
    "your-project",
    "your_project",
    "your-package",
    "your_package",
    "example.com",
)


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def parse_google_services_json(raw_value: str, source_label: str) -> dict[str, Any]:
    value = raw_value.strip()
    if not value:
        fail(f"Missing {source_label}. Provide raw JSON or a base64-encoded google-services.json value.")

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as raw_error:
        compact_value = "".join(value.split())
        try:
            decoded = base64.b64decode(compact_value, validate=True).decode("utf-8-sig").strip()
            parsed = json.loads(decoded)
        except Exception:
            fail(
                f"Invalid {source_label}. Paste the full google-services.json content as raw JSON, "
                "or store a base64-encoded JSON value."
            )
            raise raw_error

    if not isinstance(parsed, dict):
        fail(f"Invalid {source_label}. Top-level google-services.json value must be an object.")

    return parsed


def has_blocked_marker(value: str) -> bool:
    normalized = value.strip().lower()
    return any(marker in normalized for marker in BLOCKED_MARKERS)


def require_clean_string(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"Invalid Firebase config. Missing required field: {field_name}.")

    clean_value = value.strip()
    if has_blocked_marker(clean_value):
        fail(f"Invalid Firebase config. Field {field_name} still looks like a dummy or placeholder value.")

    return clean_value


def find_matching_client(
    data: dict[str, Any],
    expected_package: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    clients = data.get("client")
    if not isinstance(clients, list) or not clients:
        fail("Invalid Firebase config. Missing non-empty client array.")

    typed_clients = [client for client in clients if isinstance(client, dict)]
    matching_clients = []
    known_packages = []

    for client in typed_clients:
        package_name = (
            client.get("client_info", {})
            .get("android_client_info", {})
            .get("package_name")
        )
        if isinstance(package_name, str) and package_name.strip():
            known_packages.append(package_name.strip())
        if package_name == expected_package:
            matching_clients.append(client)

    if not matching_clients:
        displayed_packages = ", ".join(sorted(set(known_packages))) or "none"
        fail(
            "Firebase config package mismatch. "
            f"Expected {expected_package}; available package(s): {displayed_packages}."
        )

    matching_client = matching_clients[0]
    remaining_clients = [client for client in typed_clients if client is not matching_client]
    return matching_client, remaining_clients


def validate_api_key(client: dict[str, Any]) -> None:
    api_keys = client.get("api_key")
    if not isinstance(api_keys, list) or not api_keys:
        fail("Invalid Firebase config. Missing api_key array for matching Android client.")

    current_keys = [
        api_key.get("current_key")
        for api_key in api_keys
        if isinstance(api_key, dict) and isinstance(api_key.get("current_key"), str)
    ]
    usable_keys = [key.strip() for key in current_keys if key and key.strip()]
    if not usable_keys:
        fail("Invalid Firebase config. Missing api_key.current_key for matching Android client.")

    for key in usable_keys:
        if not key.startswith("AIza"):
            fail("Invalid Firebase config. api_key.current_key does not look like a Firebase Android API key.")
        if has_blocked_marker(key):
            fail("Invalid Firebase config. api_key.current_key still looks like a dummy or placeholder value.")


def validate_google_services(
    data: dict[str, Any],
    expected_package: str,
) -> tuple[dict[str, Any], str, str]:
    project_info = data.get("project_info")
    if not isinstance(project_info, dict):
        fail("Invalid Firebase config. Missing project_info object.")

    project_id = require_clean_string(project_info.get("project_id"), "project_info.project_id")
    require_clean_string(project_info.get("project_number"), "project_info.project_number")

    matching_client, remaining_clients = find_matching_client(data, expected_package)
    client_info = matching_client.get("client_info")
    if not isinstance(client_info, dict):
        fail("Invalid Firebase config. Missing client_info for matching Android client.")

    mobile_sdk_app_id = require_clean_string(
        client_info.get("mobilesdk_app_id"),
        "client.client_info.mobilesdk_app_id",
    )

    android_client_info = client_info.get("android_client_info")
    if not isinstance(android_client_info, dict):
        fail("Invalid Firebase config. Missing android_client_info for matching Android client.")

    package_name = require_clean_string(
        android_client_info.get("package_name"),
        "client.client_info.android_client_info.package_name",
    )
    if package_name != expected_package:
        fail(f"Firebase config package mismatch. Expected {expected_package}; got {package_name}.")

    validate_api_key(matching_client)

    materialized_data = dict(data)
    materialized_data["client"] = [matching_client, *remaining_clients]
    return materialized_data, project_id, mobile_sdk_app_id


def load_input(args: argparse.Namespace) -> tuple[dict[str, Any], str]:
    if args.raw_env:
        raw_value = os.environ.get(args.raw_env, "")
        return parse_google_services_json(raw_value, args.raw_env), args.raw_env

    if args.file:
        source_path = Path(args.file)
        if not source_path.exists():
            fail(f"Firebase config file does not exist: {source_path}")
        return parse_google_services_json(source_path.read_text(encoding="utf-8"), str(source_path)), str(source_path)

    fail("Provide either --raw-env or --file.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--raw-env", help="Environment variable containing raw JSON or base64 JSON.")
    input_group.add_argument("--file", help="Path to an existing google-services.json file.")
    parser.add_argument("--expected-package", required=True, help="Expected Android applicationId/package name.")
    parser.add_argument("--output", help="Optional output path for validated materialized JSON.")
    parser.add_argument("--app-name", default="Android app", help="Human-readable app name for logs.")
    args = parser.parse_args()

    data, source_label = load_input(args)
    materialized_data, project_id, mobile_sdk_app_id = validate_google_services(
        data,
        args.expected_package,
    )

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(materialized_data, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        print(
            f"Validated Firebase config for {args.app_name}: "
            f"package={args.expected_package}, project={project_id}, app_id_suffix={mobile_sdk_app_id[-8:]}, "
            f"source={source_label}, output={output_path.as_posix()}"
        )
    else:
        print(
            f"Validated Firebase config for {args.app_name}: "
            f"package={args.expected_package}, project={project_id}, app_id_suffix={mobile_sdk_app_id[-8:]}, "
            f"source={source_label}"
        )


if __name__ == "__main__":
    main()
