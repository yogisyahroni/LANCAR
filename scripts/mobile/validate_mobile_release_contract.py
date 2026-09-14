#!/usr/bin/env python3
"""Check that all Android apps keep the shared release/reliability contract wired."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
APPS = {
    "courier": ROOT / "android-app/app/build.gradle.kts",
    "customer": ROOT / "android-app-customer/app/build.gradle.kts",
    "merchant": ROOT / "android-app-merchant/app/build.gradle.kts",
}

APP_SOURCE_MARKERS = {
    "courier": (
        "android-app/app/src/main/java/com/tembus/courier/data/api/NetworkRequestReferenceStore.kt",
        ("FirebaseCrashlytics", "setCustomKey", "last_backend_request_id"),
    ),
    "customer": (
        "android-app-customer/app/src/main/java/com/tembus/customer/worker/CustomerResyncWorker.kt",
        ("NetworkType.CONNECTED", "BackoffPolicy.EXPONENTIAL", "Result.retry()"),
    ),
    "merchant": (
        "android-app-merchant/app/src/main/java/com/tembus/merchant/data/cache/MerchantOfflineCache.kt",
        ("EncryptedSharedPreferences", "read-only", "server"),
    ),
}

REQUIRED_MARKERS = {
    "android-app/app/build.gradle.kts": ("validateReleaseBaseUrl", "minSdk = 26", "targetSdk = 36", "isMinifyEnabled = true"),
    "android-app-customer/app/build.gradle.kts": ("validateReleaseBaseUrl", "minSdk = 26", "targetSdk = 36", "isMinifyEnabled = true"),
    "android-app-merchant/app/build.gradle.kts": ("validateReleaseBaseUrl", "minSdk = 26", "targetSdk = 36", "isMinifyEnabled = true"),
}

def main() -> int:
    errors: list[str] = []
    for label, path in APPS.items():
        if not path.is_file():
            errors.append(f"{label}: missing Gradle module")
            continue
        text = path.read_text(encoding="utf-8")
        for marker in REQUIRED_MARKERS[path.relative_to(ROOT).as_posix()]:
            if marker not in text:
                errors.append(f"{label}: missing release marker {marker}")
        source_path, source_markers = APP_SOURCE_MARKERS[label]
        source = ROOT / source_path
        if not source.is_file():
            errors.append(f"{label}: missing reliability source {source_path}")
        else:
            source_text = source.read_text(encoding="utf-8")
            for marker in source_markers:
                if marker not in source_text:
                    errors.append(f"{label}: missing reliability marker {marker}")
    for path in (
        ROOT / "scripts/mobile/performance_budgets.json",
        ROOT / "scripts/mobile/measure_performance.py",
        ROOT / "scripts/mobile/verify_performance_report.py",
        ROOT / "scripts/mobile/validate_mobile_static_contracts.py",
        ROOT / "docs/mobile/reliability-contract.md",
        ROOT / "docs/release/mobile-compatibility-matrix.md",
        ROOT / "docs/release/mobile-update-policy.md",
        ROOT / "scripts/mobile/verify_release_aab.py",
        ROOT / "scripts/mobile/record_artifact_inventory.py",
    ):
        if not path.is_file():
            errors.append(f"missing mobile gate artifact: {path.relative_to(ROOT)}")
    if errors:
        print("MOBILE RELEASE CONTRACT FAILED")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print("MOBILE RELEASE CONTRACT PASS: courier/customer/merchant modules wired")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
