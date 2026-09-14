#!/usr/bin/env python3
"""Validate source-level Android reliability and privacy contracts.

This is intentionally a static gate. It proves that the reviewed source keeps
the critical-path, permission, timeout, worker, and update-policy boundaries
wired. It does not replace adb/device, memory, jank, or rollout evidence.
"""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        raise FileNotFoundError(relative)
    return path.read_text(encoding="utf-8")


def require(errors: list[str], relative: str, *markers: str) -> None:
    try:
        source = read(relative)
    except OSError as error:
        errors.append(f"{relative}: {error}")
        return
    for marker in markers:
        if marker not in source:
            errors.append(f"{relative}: missing marker {marker!r}")


def forbid(errors: list[str], relative: str, *markers: str) -> None:
    try:
        source = read(relative)
    except OSError as error:
        errors.append(f"{relative}: {error}")
        return
    for marker in markers:
        if marker in source:
            errors.append(f"{relative}: forbidden marker {marker!r}")


def main() -> int:
    errors: list[str] = []

    # Customer startup keeps auth/order/safety shell available immediately;
    # presentation config and non-critical update work remain asynchronous.
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/TEMBUSApplication.kt",
        "appStartupCoordinator.start()",
        "never delay the",
        "FeatureFlagManager.init",
    )
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/ui/MainActivity.kt",
        "setKeepOnScreenCondition",
        "setContent",
        "LaunchedEffect(Unit)",
        "updateManager.checkUpdate()",
    )
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/domain/config/ExperienceConfigManager.kt",
        "CoroutineScope(SupervisorJob() + Dispatchers.Default)",
        "loadLastKnownGood",
        "STARTUP_REGRESSION_THRESHOLD_MILLIS",
        'setCustomKey("experience_manifest_revision"',
    )

    # Location is least privilege for customers and foreground/background
    # tracking is explicit for couriers only.
    forbid(errors, "android-app-customer/app/src/main/AndroidManifest.xml", "ACCESS_BACKGROUND_LOCATION")
    require(
        errors,
        "android-app/ app/src/main/AndroidManifest.xml".replace(" ", ""),
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE_LOCATION",
        'android:foregroundServiceType="location"',
    )
    require(
        errors,
        "android-app/app/src/main/java/com/tembus/courier/service/LocationTrackerService.kt",
        "POWER_SAVER_INTERVAL_MS",
        "handleBatteryChanged",
        "setMinUpdateDistanceMeters(50f)",
        "setMaxUpdateDelayMillis",
    )

    # Offline work is constrained to connectivity and uses exponential retry;
    # presentation assets additionally require unmetered data.
    require(
        errors,
        "android-app/app/src/main/java/com/tembus/courier/worker/OrderSyncWorker.kt",
        "NetworkType.CONNECTED",
        "BackoffPolicy.EXPONENTIAL",
        "Result.retry()",
        "syncPendingSafetyIncidents",
    )
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/worker/CustomerResyncWorker.kt",
        "NetworkType.CONNECTED",
        "BackoffPolicy.EXPONENTIAL",
        "Result.retry()",
    )
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/worker/ExperienceAssetPrefetchWorker.kt",
        "NetworkType.UNMETERED",
        "BackoffPolicy.EXPONENTIAL",
        "ExistingPeriodicWorkPolicy.KEEP",
    )

    # All release clients use bounded network timeouts and disable payload
    # logging. The merchant cache is encrypted and read-only offline.
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/di/NetworkModule.kt",
        "SafeGetRetryInterceptor()",
        "retryOnConnectionFailure(false)",
        "NetworkReliabilityPolicy.CALL_TIMEOUT_SECONDS",
        "NetworkReliabilityPolicy.CONNECT_TIMEOUT_SECONDS",
        "NetworkReliabilityPolicy.READ_TIMEOUT_SECONDS",
        "NetworkReliabilityPolicy.WRITE_TIMEOUT_SECONDS",
        "HttpLoggingInterceptor.Level.NONE",
    )
    require(
        errors,
        "android-app/app/src/main/java/com/tembus/courier/di/NetworkModule.kt",
        "SafeGetRetryInterceptor()",
        "retryOnConnectionFailure(false)",
        "NetworkReliabilityPolicy.CALL_TIMEOUT_SECONDS",
        "NetworkReliabilityPolicy.CONNECT_TIMEOUT_SECONDS",
        "NetworkReliabilityPolicy.READ_TIMEOUT_SECONDS",
        "NetworkReliabilityPolicy.WRITE_TIMEOUT_SECONDS",
        "HttpLoggingInterceptor.Level.NONE",
    )
    require(
        errors,
        "android-app-merchant/app/src/main/java/com/tembus/merchant/data/api/ApiClient.kt",
        "RequestCorrelationInterceptor",
        "SafeGetRetryInterceptor()",
        "retryOnConnectionFailure(false)",
        "NetworkReliabilityPolicy.CALL_TIMEOUT_SECONDS",
        "NetworkReliabilityPolicy.CONNECT_TIMEOUT_SECONDS",
        "NetworkReliabilityPolicy.READ_TIMEOUT_SECONDS",
        "NetworkReliabilityPolicy.WRITE_TIMEOUT_SECONDS",
        "HttpLoggingInterceptor.Level.NONE",
    )
    require(
        errors,
        "android-app-merchant/app/src/main/java/com/tembus/merchant/data/api/NetworkRequestReferenceStore.kt",
        "sanitized error reference",
        "never enter the metric label",
    )
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/data/api/NetworkReliabilityPolicy.kt",
        "MAX_SAFE_GET_RETRIES = 1",
        "canRetryMutation",
        "isSafeRead",
        "shouldRetrySafeRead",
        "request.method",
    )
    require(
        errors,
        "android-app/app/src/main/java/com/tembus/courier/data/api/NetworkReliabilityPolicy.kt",
        "MAX_SAFE_GET_RETRIES = 1",
        "canRetryMutation",
        "isSafeRead",
        "shouldRetrySafeRead",
        "request.method",
    )
    require(
        errors,
        "android-app-merchant/app/src/main/java/com/tembus/merchant/data/api/NetworkReliabilityPolicy.kt",
        "MAX_SAFE_GET_RETRIES = 1",
        "canRetryMutation",
        "isSafeRead",
        "shouldRetrySafeRead",
        "request.method",
    )
    require(
        errors,
        "android-app-merchant/app/src/main/java/com/tembus/merchant/data/cache/MerchantOfflineCache.kt",
        "EncryptedSharedPreferences",
        "read-only",
        "server",
    )
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/data/repository/OrderRepository.kt",
        "refreshOrderHistoryFromServer",
        "needsSync = false",
    )
    require(
        errors,
        "android-app/app/src/main/java/com/tembus/courier/worker/OrderSyncWorker.kt",
        "syncPendingOrders()",
        "syncPendingSafetyIncidents()",
    )
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/payment/PaymentResumePolicy.kt",
        "server remains authoritative",
        "redirectUrl",
        "expired",
        "payment_failed",
    )
    for application_path in (
        "android-app/app/src/main/java/com/tembus/courier/TEMBUSApplication.kt",
        "android-app-customer/app/src/main/java/com/tembus/customer/TEMBUSApplication.kt",
        "android-app-merchant/app/src/main/java/com/tembus/merchant/TEMBUSApplication.kt",
    ):
        require(errors, application_path, "ImageLoaderFactory", "maxSizePercent(0.15)")

    # Server-controlled updates can only carry release metadata, never code.
    require(
        errors,
        "docs/release/mobile-update-policy.md",
        "It cannot deliver",
        "JavaScript",
        "replacement state machine",
    )
    require(
        errors,
        "docs/mobile/telemetry-contract.md",
        "Never put email, phone, address",
        "X-Request-ID",
        "high-cardinality metric label",
    )

    if errors:
        print("MOBILE STATIC CONTRACT FAILED")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    print(
        "MOBILE STATIC CONTRACT PASS: startup, location, workers, network, "
        "offline cache and update boundaries verified"
    )
    print("LIMITATION: adb/device performance, leak, compatibility and rollout evidence remain separate gates.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
