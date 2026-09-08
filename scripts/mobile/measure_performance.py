#!/usr/bin/env python3
"""Collect repeatable Android startup/performance samples through adb.

The collector deliberately emits raw samples. The release decision belongs to
verify_performance_report.py, which applies the machine-readable p95 policy.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def find_adb(explicit: str | None) -> str:
    candidates = [explicit, shutil.which("adb")]
    for sdk_key in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        sdk = os.environ.get(sdk_key)
        if sdk:
            candidates.append(str(Path(sdk) / "platform-tools" / ("adb.exe" if os.name == "nt" else "adb")))
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    raise RuntimeError("adb was not found; set ANDROID_HOME or pass --adb")


def run_adb(adb: str, serial: str, *args: str, check: bool = True) -> str:
    command = [adb, "-s", serial, *args]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False, timeout=30)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"adb command timed out after 30s: {' '.join(args)}") from error
    output = (result.stdout or "") + (result.stderr or "")
    if check and result.returncode != 0:
        raise RuntimeError(f"adb command failed ({result.returncode}): {' '.join(args)}\n{output[-2000:]}")
    return output


def parse_total_time(output: str) -> int:
    match = re.search(r"^TotalTime:\s*(\d+)", output, re.MULTILINE)
    if not match:
        raise RuntimeError(f"am start -W did not return TotalTime:\n{output[-2000:]}")
    return int(match.group(1))


def parse_memory_mb(output: str) -> float:
    match = re.search(r"TOTAL\s+PSS:\s*([0-9,]+)", output)
    if not match:
        raise RuntimeError(f"dumpsys meminfo did not return TOTAL PSS:\n{output[-2000:]}")
    return int(match.group(1).replace(",", "")) / 1024.0


def parse_jank_pct(output: str) -> float:
    match = re.search(r"Janky frames:\s*\d+\s*\(([0-9.]+)%\)", output)
    if not match:
        return 0.0
    return float(match.group(1))


def package_uid(adb: str, serial: str, package: str) -> str | None:
    output = run_adb(adb, serial, "shell", "cmd", "package", "list", "packages", "-U", package, check=False)
    match = re.search(r"(?:uid:|uid=)(\d+)", output)
    return match.group(1) if match else None


def net_bytes(adb: str, serial: str, uid: str | None) -> int:
    if not uid:
        return 0
    output = run_adb(adb, serial, "shell", "dumpsys", "netstats", "detail", check=False)
    total = 0
    for line in output.splitlines():
        if uid not in line:
            continue
        rx = re.search(r"(?:rxBytes|rb)=(\d+)", line)
        tx = re.search(r"(?:txBytes|tb)=(\d+)", line)
        if rx:
            total += int(rx.group(1))
        if tx:
            total += int(tx.group(1))
    return total


def wait_for_device(adb: str, serial: str, timeout_seconds: int) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        state = run_adb(adb, serial, "get-state", check=False).strip()
        boot = run_adb(adb, serial, "shell", "getprop", "sys.boot_completed", check=False).strip()
        if state == "device" and boot == "1":
            return
        time.sleep(2)
    raise RuntimeError(f"device {serial} did not finish booting within {timeout_seconds}s")


def measure(args: argparse.Namespace) -> dict[str, Any]:
    adb = find_adb(args.adb)
    wait_for_device(adb, args.serial, args.boot_timeout)
    package = args.package
    uid = package_uid(adb, args.serial, package)
    cold: list[int] = []
    warm: list[int] = []
    memory: list[float] = []
    jank: list[float] = []
    network: list[int] = []

    # User builds and physical devices may deny WRITE_SECURE_SETTINGS. The
    # measurement remains valid without changing global animation settings;
    # the activity timing is still collected with the device's current policy.
    for setting in ("window_animation_scale", "transition_animation_scale", "animator_duration_scale"):
        run_adb(
            adb,
            args.serial,
            "shell",
            "settings",
            "put",
            "global",
            setting,
            "0",
            check=False,
        )
    for _ in range(args.runs):
        sample_number = _ + 1
        run_adb(adb, args.serial, "shell", "am", "force-stop", package)
        # Reset the per-process frame counters so jank is measured for this
        # launch rather than accumulated across all previous samples.
        run_adb(adb, args.serial, "shell", "dumpsys", "gfxinfo", package, "reset", check=False)
        before = net_bytes(adb, args.serial, uid)
        cold_time = parse_total_time(run_adb(adb, args.serial, "shell", "am", "start", "-W", "-n", args.activity))
        time.sleep(args.settle_seconds)
        # Exercise one deterministic vertical gesture so gfxinfo observes a
        # useful frame distribution instead of reporting a single first frame.
        run_adb(
            adb,
            args.serial,
            "shell",
            "input",
            "swipe",
            "540",
            "1600",
            "540",
            "400",
            "500",
            check=False,
        )
        time.sleep(0.2)
        after = net_bytes(adb, args.serial, uid)
        cold.append(cold_time)
        network.append(max(0, after - before))
        memory.append(parse_memory_mb(run_adb(adb, args.serial, "shell", "dumpsys", "meminfo", package)))
        jank.append(parse_jank_pct(run_adb(adb, args.serial, "shell", "dumpsys", "gfxinfo", package)))
        # Move the activity off-screen while retaining its process before the
        # warm-start timing. This avoids the 0 ms result from starting an
        # already-foreground activity.
        run_adb(adb, args.serial, "shell", "input", "keyevent", "KEYCODE_HOME", check=False)
        time.sleep(0.2)
        warm.append(parse_total_time(run_adb(adb, args.serial, "shell", "am", "start", "-W", "-n", args.activity)))
        print(f"sample {sample_number}/{args.runs}", file=sys.stderr, flush=True)

    artifact_size = Path(args.apk).stat().st_size if args.apk else None
    return {
        "app": args.app,
        "package": package,
        "surface": args.surface,
        "tier": args.tier,
        "serial": args.serial,
        "device_profile": args.device_profile,
        "samples": {
            "cold_start_ms": cold,
            "warm_start_ms": warm,
            "memory_pss_mb": memory,
            "janky_frames_pct": jank,
            "network_bytes": network,
        },
        "artifact_size_bytes": artifact_size,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True, choices=["courier", "customer", "merchant"])
    parser.add_argument("--package", required=True)
    parser.add_argument("--activity", required=True)
    parser.add_argument("--surface", default="launch")
    parser.add_argument("--tier", required=True, choices=["low", "mid", "high"])
    parser.add_argument("--device-profile", required=True)
    parser.add_argument("--serial", default="emulator-5554")
    parser.add_argument("--apk")
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--settle-seconds", type=float, default=0.5)
    parser.add_argument("--boot-timeout", type=int, default=180)
    parser.add_argument("--adb")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.runs < 20:
        parser.error("--runs must be at least 20 so p95 is not a single sample")
    try:
        result = {
            "schema_version": 1,
            "collector": "scripts/mobile/measure_performance.py",
            "measured_at": datetime.now(timezone.utc).isoformat(),
            "environment": "local-emulator" if args.serial.startswith("emulator-") else "connected-device",
            "measurements": [measure(args)],
        }
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": "PASS", "output": str(output), "runs": args.runs}))
        return 0
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
