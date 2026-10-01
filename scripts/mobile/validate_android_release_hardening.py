"""Validate release-only Android security invariants for the mobile apps."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]


def fail(message: str, errors: list[str]) -> None:
    errors.append(message)


def main() -> int:
    errors: list[str] = []
    apps = {
        "courier": ROOT / "android-app/app",
        "customer": ROOT / "android-app-customer/app",
        "merchant": ROOT / "android-app-merchant/app",
    }

    for name, app_dir in apps.items():
        main_config = app_dir / "src/main/res/xml/network_security_config.xml"
        debug_config = app_dir / "src/debug/res/xml/network_security_config.xml"
        manifest = app_dir / "src/main/AndroidManifest.xml"

        if not main_config.exists():
            fail(f"{name}: missing release network security config", errors)
            continue
        main_text = main_config.read_text(encoding="utf-8")
        if 'cleartextTrafficPermitted="true"' in main_text:
            fail(f"{name}: release source set permits cleartext traffic", errors)
        if 'cleartextTrafficPermitted="false"' not in main_text:
            fail(f"{name}: release source set has no cleartext deny rule", errors)

        if not debug_config.exists():
            fail(f"{name}: missing debug network security overlay", errors)

        manifest_text = manifest.read_text(encoding="utf-8")
        if 'android:allowBackup="false"' not in manifest_text:
            fail(f"{name}: android:allowBackup must remain false", errors)

    if errors:
        print("ANDROID RELEASE HARDENING FAILED")
        for error in errors:
            print(f"- {error}")
        return 1

    print("ANDROID RELEASE HARDENING PASS: cleartext denied in release source sets")
    print("ANDROID RELEASE HARDENING PASS: debug-only local network overlays present")
    print("ANDROID RELEASE HARDENING PASS: backup disabled for mobile apps")
    return 0


if __name__ == "__main__":
    sys.exit(main())
