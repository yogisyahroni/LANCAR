#!/usr/bin/env python3
"""Run a non-destructive Android compatibility smoke matrix.

The runner deliberately reports emulator/device facts and observed launch
states. It does not grant permissions, clear app data, or claim unsupported
physical-device coverage from an emulator proxy.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path


APPS = (
    ("customer", "com.tembus.customer", "com.tembus.customer/.ui.MainActivity"),
    ("courier", "com.tembus.courier", "com.tembus.courier/.ui.MainActivity"),
    ("merchant", "com.tembus.merchant", "com.tembus.merchant/.SplashActivity"),
)


@dataclass(frozen=True)
class Adb:
    serial: str

    def run(self, *args: str, timeout: float = 30.0) -> str:
        command = ["adb", "-s", self.serial, *args]
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = (result.stdout + result.stderr).strip()
        if result.returncode != 0:
            raise RuntimeError(f"{' '.join(command)} failed: {output}")
        return output

    def prop(self, name: str) -> str:
        return self.run("shell", "getprop", name)


def first_int(text: str) -> int | None:
    match = re.search(r"-?\d+", text)
    return int(match.group(0)) if match else None


def parse_mem_total(text: str) -> int | None:
    match = re.search(r"MemTotal:\s+(\d+)\s+kB", text)
    return int(match.group(1)) if match else None


def setting_or_default(adb: Adb, name: str, default: str) -> str:
    value = adb.run("shell", "settings", "get", "system", name).strip()
    return default if not value or value.lower() == "null" else value


def top_resumed(adb: Adb, package: str) -> bool:
    activity = adb.run("shell", "dumpsys", "activity", "activities")
    return any(
        package in line
        for line in activity.splitlines()
        if "topResumedActivity=" in line
        or "mResumedActivity:" in line
        or "Resumed: ActivityRecord" in line
    )


def launch(adb: Adb, package: str, component: str) -> dict[str, object]:
    adb.run("shell", "am", "force-stop", package)
    try:
        output = adb.run("shell", "am", "start", "-W", "-n", component, timeout=60.0)
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        # A slow or unhealthy emulator must be visible in the raw report, but
        # one app must not prevent the other app/scenario results being saved.
        return {
            "status": "error",
            "total_time_ms": None,
            "resumed": False,
            "error": str(error),
        }
    time.sleep(1.0)
    total = re.search(r"TotalTime:\s*(\d+)", output)
    status = re.search(r"Status:\s*(\S+)", output)
    return {
        "status": status.group(1) if status else "unknown",
        "total_time_ms": int(total.group(1)) if total else None,
        "resumed": top_resumed(adb, package),
    }


def runtime_permissions(adb: Adb, package: str) -> dict[str, object]:
    dump = adb.run("shell", "dumpsys", "package", package)
    declared = sorted(
        set(re.findall(r"android\.permission\.[A-Z_]+", dump))
    )
    granted = sorted(
        set(
            re.findall(
                r"android\.permission\.[A-Z_]+: granted=true", dump
            )
        )
    )
    return {"declared": declared, "granted": granted}


def crash_lines(adb: Adb, package: str) -> list[str]:
    crash = adb.run("shell", "logcat", "-d", "-b", "crash", "-t", "250")
    return [
        line
        for line in crash.splitlines()
        if package in line or "FATAL EXCEPTION" in line or "ANR in" in line
    ]


def run_app(adb: Adb, name: str, package: str, component: str) -> dict[str, object]:
    result: dict[str, object] = {
        "name": name,
        "package": package,
        "component": component,
        "permissions": runtime_permissions(adb, package),
        "launch": launch(adb, package, component),
        "scenarios": {},
        "crash_log_matches": [],
    }
    scenarios: dict[str, object] = result["scenarios"]  # type: ignore[assignment]
    scenarios["process_death_resume"] = launch(adb, package, component)

    adb.run("shell", "cmd", "uimode", "night", "yes")
    scenarios["dark_mode_resume"] = launch(adb, package, component)
    adb.run("shell", "cmd", "uimode", "night", "no")
    scenarios["light_mode_resume"] = launch(adb, package, component)

    adb.run("shell", "settings", "put", "system", "font_scale", "1.30")
    scenarios["dynamic_text_130_percent"] = launch(adb, package, component)

    adb.run("shell", "settings", "put", "system", "accelerometer_rotation", "0")
    adb.run("shell", "settings", "put", "system", "user_rotation", "1")
    scenarios["rotation_resume"] = launch(adb, package, component)

    scenarios["post_rotation_process_death"] = launch(adb, package, component)
    result["crash_log_matches"] = crash_lines(adb, package)
    return result


def run_device(serial: str) -> dict[str, object]:
    adb = Adb(serial)
    if adb.run("get-state") != "device":
        raise RuntimeError(f"{serial} is not an authorized Android device")

    original_font_scale = setting_or_default(adb, "font_scale", "1.0")
    original_rotation = setting_or_default(adb, "accelerometer_rotation", "1")
    original_user_rotation = setting_or_default(adb, "user_rotation", "0")
    try:
        result = {
            "serial": serial,
            "device": {
                "model": adb.prop("ro.product.model"),
                "device": adb.prop("ro.product.device"),
                "sdk": first_int(adb.prop("ro.build.version.sdk")),
                "android_release": adb.prop("ro.build.version.release"),
                "resolution": adb.run("shell", "wm", "size"),
                "density": adb.run("shell", "wm", "density"),
                "mem_total_kb": parse_mem_total(adb.run("shell", "cat", "/proc/meminfo")),
            },
            "apps": [],
        }
        apps: list[dict[str, object]] = result["apps"]  # type: ignore[assignment]
        for app in APPS:
            try:
                apps.append(run_app(adb, *app))
            except (RuntimeError, subprocess.TimeoutExpired) as error:
                apps.append(
                    {
                        "name": app[0],
                        "package": app[1],
                        "component": app[2],
                        "error": str(error),
                    }
                )
        return result
    finally:
        adb.run("shell", "cmd", "uimode", "night", "no")
        adb.run("shell", "settings", "put", "system", "font_scale", original_font_scale)
        adb.run(
            "shell", "settings", "put", "system", "accelerometer_rotation", original_rotation
        )
        adb.run("shell", "settings", "put", "system", "user_rotation", original_user_rotation)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial", action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    report = {
        "schema_version": 1,
        "runner": "scripts/mobile/run_compatibility_smoke.py",
        "scope": "non-destructive Android compatibility smoke; emulator/device facts only",
        "devices": [run_device(serial) for serial in args.serial],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
