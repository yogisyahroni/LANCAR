#!/usr/bin/env python3
"""Merge one-measurement collector outputs into a single release report."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError(f"{path} is not a schema version 1 report")
    measurements = value.get("measurements")
    if not isinstance(measurements, list) or len(measurements) != 1:
        raise ValueError(f"{path} must contain exactly one measurement")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("inputs", nargs="+", type=Path)
    args = parser.parse_args()
    reports = [load(path) for path in args.inputs]
    measurements = [report["measurements"][0] for report in reports]
    keys = [(item.get("app"), item.get("surface"), item.get("tier")) for item in measurements]
    if len(keys) != len(set(keys)):
        raise ValueError("input reports contain duplicate app/surface/tier measurements")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "collector": "scripts/mobile/merge_performance_reports.py",
                "merged_at": datetime.now(timezone.utc).isoformat(),
                "measurements": measurements,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"status": "PASS", "output": str(output), "measurements": len(measurements)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
