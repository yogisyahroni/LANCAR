#!/usr/bin/env python3
"""Record immutable Android artifact identity and size for a release packet.

This is intentionally a release artifact, not a source-controlled binary.  It
keeps the version/commit/path/size/hash facts next to the APK/AAB uploaded by
CI so size regressions and rollback candidates can be compared later.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys


def git_value(*args: str) -> str:
    try:
        return subprocess.run(
            ["git", *args], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def artifacts(working_dir: Path, include_debug: bool) -> list[Path]:
    output = working_dir / "app" / "build" / "outputs"
    paths = list((output / "apk" / "release").glob("*.apk"))
    paths += list((output / "bundle" / "release").glob("*.aab"))
    if include_debug:
        paths += list((output / "apk" / "debug").glob("*.apk"))
    return sorted(path for path in paths if path.is_file())


def release_symbol_metadata(working_dir: Path) -> list[Path]:
    """Return release symbolication files without copying their contents into the report."""
    mapping_dir = working_dir / "app" / "build" / "outputs" / "mapping" / "release"
    if not mapping_dir.is_dir():
        return []
    names = ("mapping.txt", "seeds.txt", "usage.txt", "configuration.txt")
    return [mapping_dir / name for name in names if (mapping_dir / name).is_file()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--working-dir", required=True)
    parser.add_argument("--app-slug", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--version-code", default="unknown")
    parser.add_argument("--version-name", default="unknown")
    parser.add_argument("--include-debug", action="store_true")
    parser.add_argument("--require-release", action="store_true")
    parser.add_argument("--require-symbol-metadata", action="store_true")
    args = parser.parse_args()

    working_dir = Path(args.working_dir).resolve()
    found = artifacts(working_dir, args.include_debug)
    release_found = [path for path in found if "release" in path.parts]
    if args.require_release and not release_found:
        print(f"No release APK/AAB found under {working_dir / 'app' / 'build' / 'outputs'}", file=sys.stderr)
        return 1
    if not found:
        print(f"No Android artifacts found under {working_dir / 'app' / 'build' / 'outputs'}", file=sys.stderr)
        return 1

    symbol_files = release_symbol_metadata(working_dir)
    if args.require_symbol_metadata and not symbol_files:
        print(f"No release symbol metadata found under {working_dir / 'app' / 'build' / 'outputs' / 'mapping' / 'release'}", file=sys.stderr)
        return 1

    root = Path(__file__).resolve().parents[2]
    rows = []
    for path in found:
        rows.append({
            "kind": "aab" if path.suffix.lower() == ".aab" else "apk",
            "channel": "release" if "release" in path.parts else "debug",
            "path": path.relative_to(root).as_posix(),
            "size_bytes": path.stat().st_size,
            "sha256": digest(path),
        })
    report = {
        "schema_version": 1,
        "app_slug": args.app_slug,
        "version_code": args.version_code,
        "version_name": args.version_name,
        "commit": git_value("rev-parse", "HEAD"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "artifacts": rows,
        "symbol_metadata": [
            {
                "kind": "android-r8-symbols",
                "path": path.relative_to(root).as_posix(),
                "size_bytes": path.stat().st_size,
                "sha256": digest(path),
            }
            for path in symbol_files
        ],
        "secret_handling": "Hashes and metadata only; no signing key, credential or token is recorded.",
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "app_slug": args.app_slug,
        "commit": report["commit"],
        "artifact_count": len(rows),
        "symbol_metadata_count": len(symbol_files),
        "artifacts": [{"kind": row["kind"], "channel": row["channel"], "size_bytes": row["size_bytes"]} for row in rows],
        "output": output.as_posix(),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
