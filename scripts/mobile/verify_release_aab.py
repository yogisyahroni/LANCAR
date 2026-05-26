#!/usr/bin/env python3
"""Verify Android release AAB existence, size, structure, and JAR signature."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys
import zipfile


REQUIRED_AAB_ENTRIES = (
    "BundleConfig.pb",
    "base/manifest/AndroidManifest.xml",
)


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def find_release_aab(working_dir: Path) -> Path:
    bundle_dir = working_dir / "app" / "build" / "outputs" / "bundle" / "release"
    bundles = sorted(bundle_dir.glob("*.aab"))
    if not bundles:
        fail(f"No release AAB found in {bundle_dir.as_posix()}.")
    if len(bundles) > 1:
        names = ", ".join(bundle.name for bundle in bundles)
        fail(f"Expected exactly one release AAB in {bundle_dir.as_posix()}, found: {names}.")
    return bundles[0]


def verify_size(aab_path: Path, min_size_mb: float) -> None:
    min_size_bytes = int(min_size_mb * 1024 * 1024)
    actual_size = aab_path.stat().st_size
    if actual_size < min_size_bytes:
        fail(
            f"Release AAB is too small: {actual_size} bytes. "
            f"Expected at least {min_size_bytes} bytes."
        )


def verify_zip_structure(aab_path: Path) -> None:
    if not zipfile.is_zipfile(aab_path):
        fail(f"Release AAB is not a valid zip archive: {aab_path.as_posix()}.")

    with zipfile.ZipFile(aab_path) as archive:
        corrupt_entry = archive.testzip()
        if corrupt_entry:
            fail(f"Release AAB zip integrity check failed at entry: {corrupt_entry}.")

        names = set(archive.namelist())
        missing = [entry for entry in REQUIRED_AAB_ENTRIES if entry not in names]
        if missing:
            fail(f"Release AAB is missing required entry or entries: {', '.join(missing)}.")

        has_dex = any(name.startswith("base/dex/") and name.endswith(".dex") for name in names)
        if not has_dex:
            fail("Release AAB is missing base dex payload.")


def verify_signature(aab_path: Path) -> None:
    result = subprocess.run(
        ["jarsigner", "-verify", "-certs", "-verbose", str(aab_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    combined_output = f"{result.stdout}\n{result.stderr}"
    if result.returncode != 0:
        print(combined_output, file=sys.stderr)
        fail(f"jarsigner failed to verify release AAB signature: {aab_path.as_posix()}.")

    if "jar verified." not in combined_output.lower():
        print(combined_output, file=sys.stderr)
        fail(f"jarsigner did not report a verified release AAB: {aab_path.as_posix()}.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--working-dir", required=True, help="Android project directory.")
    parser.add_argument("--app-name", required=True, help="Human-readable app name.")
    parser.add_argument("--min-size-mb", type=float, default=1.0, help="Minimum accepted AAB size.")
    args = parser.parse_args()

    working_dir = Path(args.working_dir)
    aab_path = find_release_aab(working_dir)
    verify_size(aab_path, args.min_size_mb)
    verify_zip_structure(aab_path)
    verify_signature(aab_path)

    size_mb = aab_path.stat().st_size / 1024 / 1024
    print(
        f"Verified release AAB for {args.app_name}: "
        f"path={aab_path.as_posix()}, size_mb={size_mb:.2f}"
    )


if __name__ == "__main__":
    main()
