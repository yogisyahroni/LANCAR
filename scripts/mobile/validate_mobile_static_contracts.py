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

    # Leak detection is development/CI-only so it can observe retained
    # activities, views and lifecycle owners without inflating release APKs.
    for gradle_path in (
        "android-app/app/build.gradle.kts",
        "android-app-customer/app/build.gradle.kts",
        "android-app-merchant/app/build.gradle.kts",
    ):
        require(
            errors,
            gradle_path,
            "debugImplementation(\"com.squareup.leakcanary:leakcanary-android:2.14\")",
            "never shipped in release APKs",
        )

    # Crash context is allowlisted, bounded, and installed at app startup in
    # every mobile client. Merchant currently has no remote crash vendor, but
    # keeps the same safe context contract for future provider wiring.
    for context_path in (
        "android-app/app/src/main/java/com/tembus/courier/util/MobileCrashContext.kt",
        "android-app-customer/app/src/main/java/com/tembus/customer/util/MobileCrashContext.kt",
        "android-app-merchant/app/src/main/java/com/tembus/merchant/util/MobileCrashContext.kt",
    ):
        require(
            errors,
            context_path,
            "setScreen",
            "setMarketCode",
            "setFeatureFlagRevision",
            "MAX_VALUE_LENGTH = 96",
            "UNSAFE_VALUE",
        )
        forbid(errors, context_path, "email", "phone", "address", "user_id", "order_id", "token")

    # Every authenticated mobile shell exposes a recoverable offline state and
    # distinguishes a request that remains pending for five seconds. The UI
    # observes validated connectivity, so a cached snapshot is never reported
    # as live merely because the last request succeeded.
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/util/NetworkStatus.kt",
        "registerDefaultNetworkCallback",
        "NET_CAPABILITY_VALIDATED",
        "CustomerNetworkRecoveryBanner",
        "Kamu sedang offline",
        "Coba lagi",
        "Data yang tersimpan tetap tersedia",
    )
    require(
        errors,
        "android-app-merchant/app/src/main/java/com/tembus/merchant/util/NetworkStatus.kt",
        "registerDefaultNetworkCallback",
        "NET_CAPABILITY_VALIDATED",
        "MerchantNetworkRecoveryBanner",
        "Kamu sedang offline",
        "Coba lagi",
        "Data tersimpan tetap dapat dilihat",
    )
    require(
        errors,
        "android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt",
        "rememberNetworkAvailable()",
        "delay(5_000L)",
        "CustomerNetworkRecoveryBanner",
        "viewModel::refreshData",
    )
    require(
        errors,
        "android-app-merchant/app/src/main/java/com/tembus/merchant/ui/MainScreen.kt",
        "rememberNetworkAvailable()",
        "delay(5_000L)",
        "MerchantNetworkRecoveryBanner",
        "networkRetryNonce += 1",
        "key(networkRetryNonce)",
    )
    require(
        errors,
        "scripts/mobile/run_compatibility_smoke.py",
        "non-destructive Android compatibility smoke",
        "process_death_resume",
        "dark_mode_resume",
        "dynamic_text_130_percent",
        "post_rotation_process_death",
        "does not grant permissions",
    )

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

    # Every mobile client emits only the governed runtime telemetry families;
    # network instrumentation stays behind the existing request-correlation
    # boundary and preserves the fail-open behavior when Firebase is absent.
    telemetry_paths = (
        "android-app-customer/app/src/main/java/com/tembus/customer/util/MobileTelemetry.kt",
        "android-app/app/src/main/java/com/tembus/courier/util/MobileTelemetry.kt",
        "android-app-merchant/app/src/main/java/com/tembus/merchant/util/MobileTelemetry.kt",
    )
    for telemetry_path in telemetry_paths:
        require(
            errors,
            telemetry_path,
            "screen_view",
            "api_request",
            "app_start",
            "frame_budget",
            "FirebaseInitializer.isInitialized",
            "ALLOWED_EVENTS",
            "ALLOWED_DIMENSIONS",
        )
        forbid(errors, telemetry_path, "email", "phone", "address", "order_id", "token")
    for interceptor_path in (
        "android-app-customer/app/src/main/java/com/tembus/customer/data/api/RequestCorrelationInterceptor.kt",
        "android-app/app/src/main/java/com/tembus/courier/data/api/RequestCorrelationInterceptor.kt",
        "android-app-merchant/app/src/main/java/com/tembus/merchant/data/api/RequestCorrelationInterceptor.kt",
    ):
        require(errors, interceptor_path, "X-Request-ID", "encodedPath", "apiRequest")

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
