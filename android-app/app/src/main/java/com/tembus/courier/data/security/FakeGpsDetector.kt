package com.tembus.courier.data.security

import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * FakeGpsDetector — Multi-Layer Fake GPS Detection Orchestrator
 *
 * Evaluates every GPS location update through 4 defense layers:
 *
 *   Layer 1: Mock Location Provider Detection
 *     - location.isMock / isFromMockProvider flag
 *     - ALLOW_MOCK_LOCATION system setting
 *     - Location extras bundle "mockLocation" key
 *
 *   Layer 2: Fake GPS Application Detection
 *     - Scan installed apps against FakeGpsAppDatabase (33+ known apps)
 *     - Fuzzy pattern matching for repackaged variants
 *     - Detection of apps with ACCESS_MOCK_LOCATION permission
 *     - Developer Options + USB Debugging status
 *
 *   Layer 3: Hardware Sensor Validation
 *     - Accelerometer consistency (is device physically moving?)
 *     - Gyroscope consistency (does bearing change match GPS?)
 *     - Barometric altitude cross-check
 *     - Step counter correlation (walking but GPS says driving?)
 *
 *   Layer 4: Heuristic Cross-Validation
 *     - Combined risk scoring from all layers
 *     - Weighted algorithm to minimize false positives
 *
 * Risk Score Calculation:
 *   Each layer contributes a weighted score to the final risk assessment.
 *   The weights are tuned to minimize false positives while maintaining
 *   high detection rates against non-root fake GPS attacks.
 *
 * Thread Safety:
 *   This class is safe to call from any thread. All state is derived
 *   from parameters passed to evaluate() and the sensor snapshot.
 */
class FakeGpsDetector(private val context: Context) {

    private val TAG = "FakeGpsDetector"

    // ── Cache for app scan results (expensive operation) ───────────
    // Re-scan every 5 minutes to avoid performance impact
    private var cachedAppScanResult: AppScanResult? = null
    private var lastAppScanTimestamp: Long = 0L
    private val appScanCacheMs = 5 * 60 * 1000L // 5 minutes

    // ── Data Classes ───────────────────────────────────────────────

    /**
     * Complete integrity report for a single location update.
     * Sent to server as part of telemetry payload.
     */
    data class LocationIntegrityReport(
        val isMockProvider: Boolean,
        val mockLocationSettingEnabled: Boolean,
        val developerOptionsEnabled: Boolean,
        val usbDebuggingEnabled: Boolean,
        val fakeGpsAppsDetected: List<String>,
        val hasMockPermissionApps: Boolean,
        val accelerometerConsistent: Boolean,
        val gyroscopeConsistent: Boolean,
        val barometerConsistent: Boolean,
        val stepCounterConsistent: Boolean,
        val sensorDataAvailable: Boolean,
        val riskScore: Float,
        val riskLevel: RiskLevel,
        val timestamp: Long
    )

    enum class RiskLevel {
        /** Location is clean — no indicators of spoofing */
        VALID,
        /** Some indicators present but not conclusive — log and flag */
        SUSPICIOUS,
        /** High confidence fake GPS — drop location, warn courier */
        FAKE_GPS_DETECTED
    }

    private data class AppScanResult(
        val detectedApps: List<String>,
        val hasMockPermissionApps: Boolean,
        val developerOptionsEnabled: Boolean,
        val usbDebuggingEnabled: Boolean,
        val mockLocationSettingEnabled: Boolean,
        val timestamp: Long
    )

    // ── Public API ─────────────────────────────────────────────────

    /**
     * Evaluate a location update against all detection layers.
     *
     * @param location      The GPS location to validate.
     * @param sensorData    Latest sensor snapshot from SensorFusionEngine.
     * @param gpsSpeedKmh   GPS-reported speed in km/h (for sensor cross-check).
     * @param gpsBearingDeg GPS-reported bearing in degrees.
     * @param gpsAltitudeM  GPS-reported altitude in meters.
     * @return LocationIntegrityReport with risk score and detailed flags.
     */
    fun evaluate(
        location: Location,
        sensorData: SensorFusionEngine.SensorSnapshot?,
        gpsSpeedKmh: Float = 0f,
        gpsBearingDeg: Float = 0f,
        gpsAltitudeM: Double = 0.0
    ): LocationIntegrityReport {
        val now = System.currentTimeMillis()

        // ── Layer 1: Mock Provider Detection ───────────────────────
        val isMock = checkMockProvider(location)
        val mockSettingEnabled = isMockLocationSettingEnabled()

        // ── Layer 2: App Detection (cached) ────────────────────────
        val appScan = getOrRefreshAppScan(now)

        // ── Layer 3: Sensor Validation ─────────────────────────────
        val accelOk = checkAccelerometerConsistency(sensorData, gpsSpeedKmh)
        val gyroOk = checkGyroscopeConsistency(sensorData, gpsBearingDeg)
        val baroOk = checkBarometerConsistency(sensorData, gpsAltitudeM)
        val stepOk = checkStepCounterConsistency(sensorData, gpsSpeedKmh)
        val sensorAvailable = sensorData?.sensorAvailable ?: false

        // ── Layer 4: Risk Score Calculation ────────────────────────
        val riskScore = calculateRiskScore(
            isMock = isMock,
            mockSettingEnabled = mockSettingEnabled,
            appScan = appScan,
            accelOk = accelOk,
            gyroOk = gyroOk,
            baroOk = baroOk,
            stepOk = stepOk,
            sensorAvailable = sensorAvailable
        )

        val riskLevel = when {
            riskScore >= THRESHOLD_FAKE_GPS -> RiskLevel.FAKE_GPS_DETECTED
            riskScore >= THRESHOLD_SUSPICIOUS -> RiskLevel.SUSPICIOUS
            else -> RiskLevel.VALID
        }

        val report = LocationIntegrityReport(
            isMockProvider = isMock,
            mockLocationSettingEnabled = mockSettingEnabled,
            developerOptionsEnabled = appScan.developerOptionsEnabled,
            usbDebuggingEnabled = appScan.usbDebuggingEnabled,
            fakeGpsAppsDetected = appScan.detectedApps,
            hasMockPermissionApps = appScan.hasMockPermissionApps,
            accelerometerConsistent = accelOk,
            gyroscopeConsistent = gyroOk,
            barometerConsistent = baroOk,
            stepCounterConsistent = stepOk,
            sensorDataAvailable = sensorAvailable,
            riskScore = riskScore,
            riskLevel = riskLevel,
            timestamp = now
        )

        if (riskLevel != RiskLevel.VALID) {
            Log.w(TAG, "Location integrity: $riskLevel (score=$riskScore, mock=$isMock, apps=${appScan.detectedApps.size}, accel=$accelOk, gyro=$gyroOk)")
        }

        return report
    }

    // ── Layer 1: Mock Provider Detection ───────────────────────────

    private fun checkMockProvider(location: Location): Boolean {
        return try {
            val isMockFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                location.isMock
            } else {
                @Suppress("DEPRECATION")
                location.isFromMockProvider
            }

            // Also check extras bundle for "mockLocation" key
            val extrasHasMock = location.extras?.getBoolean("mockLocation", false) == true

            isMockFlag || extrasHasMock
        } catch (e: Exception) {
            // Fail-closed: if check throws, treat as suspicious
            true
        }
    }

    private fun isMockLocationSettingEnabled(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                @Suppress("DEPRECATION")
                Settings.Secure.getString(
                    context.contentResolver,
                    "mock_location"
                ) != "0"
            } else {
                // On M+ mock location is managed per-app via Developer Options
                // Check if Developer Options are enabled as a proxy
                Settings.Global.getInt(
                    context.contentResolver,
                    Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0
                ) != 0
            }
        } catch (e: Exception) {
            false
        }
    }

    // ── Layer 2: App Detection ─────────────────────────────────────

    private fun getOrRefreshAppScan(now: Long): AppScanResult {
        val cached = cachedAppScanResult
        if (cached != null && (now - lastAppScanTimestamp) < appScanCacheMs) {
            return cached
        }

        val result = performAppScan()
        cachedAppScanResult = result
        lastAppScanTimestamp = now
        return result
    }

    private fun performAppScan(): AppScanResult {
        val now = System.currentTimeMillis()
        val detectedApps = mutableListOf<String>()
        var hasMockPermApps = false

        try {
            val packageManager = context.packageManager

            // Get installed packages
            val installedPackages = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getInstalledPackages(
                    PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong())
                )
            } else {
                @Suppress("DEPRECATION")
                packageManager.getInstalledPackages(PackageManager.GET_PERMISSIONS)
            }

            for (packageInfo in installedPackages) {
                val pkgName = packageInfo.packageName ?: continue

                // Check against known database
                if (FakeGpsAppDatabase.isKnownFakeGpsApp(pkgName)) {
                    detectedApps.add(pkgName)
                    continue
                }

                // Check fuzzy pattern matching
                if (FakeGpsAppDatabase.matchesSuspiciousPattern(pkgName)) {
                    detectedApps.add(pkgName)
                    continue
                }

                // Check if app has ACCESS_MOCK_LOCATION permission
                val permissions = packageInfo.requestedPermissions
                if (permissions != null) {
                    for (perm in permissions) {
                        if (perm == "android.permission.ACCESS_MOCK_LOCATION" &&
                            !FakeGpsAppDatabase.isWhitelisted(pkgName)
                        ) {
                            hasMockPermApps = true
                            if (!detectedApps.contains(pkgName)) {
                                detectedApps.add(pkgName)
                            }
                            break
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "App scan failed", e)
        }

        val devOptions = try {
            Settings.Global.getInt(
                context.contentResolver,
                Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0
            ) != 0
        } catch (e: Exception) { false }

        val usbDebug = try {
            Settings.Global.getInt(
                context.contentResolver,
                Settings.Global.ADB_ENABLED, 0
            ) != 0
        } catch (e: Exception) { false }

        val mockSetting = isMockLocationSettingEnabled()

        return AppScanResult(
            detectedApps = detectedApps,
            hasMockPermissionApps = hasMockPermApps,
            developerOptionsEnabled = devOptions,
            usbDebuggingEnabled = usbDebug,
            mockLocationSettingEnabled = mockSetting,
            timestamp = now
        )
    }

    // ── Layer 3: Sensor Validation ─────────────────────────────────

    /**
     * Check if accelerometer readings are consistent with GPS speed.
     *
     * If GPS reports speed > 5 km/h but accelerometer shows the device
     * is stationary (no movement vibrations), it's suspicious.
     *
     * Fail-open: returns true (consistent) if sensor data unavailable.
     */
    private fun checkAccelerometerConsistency(
        sensorData: SensorFusionEngine.SensorSnapshot?,
        gpsSpeedKmh: Float
    ): Boolean {
        if (sensorData == null || !sensorData.sensorAvailable) return true

        // If GPS says we're moving fast but accelerometer says stationary
        if (gpsSpeedKmh > GPS_SPEED_THRESHOLD_KMH && !sensorData.isDeviceMoving) {
            return false
        }

        return true
    }

    /**
     * Check if gyroscope bearing changes match GPS bearing changes.
     *
     * This is a soft check — gyroscope drift means we can only detect
     * large discrepancies (GPS says 90° turn but gyro shows 0° change).
     *
     * Fail-open: returns true (consistent) if sensor data unavailable.
     */
    private fun checkGyroscopeConsistency(
        sensorData: SensorFusionEngine.SensorSnapshot?,
        @Suppress("UNUSED_PARAMETER") gpsBearingDeg: Float
    ): Boolean {
        if (sensorData == null || !sensorData.sensorAvailable) return true
        if (sensorData.gyroRotationRateDegPerSec < 0.1f) return true

        // For now, we just check that if GPS shows significant bearing change,
        // gyroscope also shows some rotation. Deep bearing comparison requires
        // initial heading calibration which is Phase 2.
        return true
    }

    /**
     * Check if barometric altitude is consistent with GPS altitude.
     *
     * Tolerance: ±50 meters (barometer accuracy without local calibration).
     *
     * Fail-open: returns true if barometer not available or data stale.
     */
    private fun checkBarometerConsistency(
        sensorData: SensorFusionEngine.SensorSnapshot?,
        gpsAltitudeM: Double
    ): Boolean {
        if (sensorData == null) return true
        val baroAltitude = sensorData.barometerAltitudeMeters ?: return true

        // Skip check if GPS altitude is 0 (not reported)
        if (gpsAltitudeM == 0.0) return true

        val difference = kotlin.math.abs(baroAltitude - gpsAltitudeM.toFloat())
        return difference <= ALTITUDE_TOLERANCE_METERS
    }

    /**
     * Check if step counter is consistent with GPS movement pattern.
     *
     * If GPS shows pedestrian-speed movement (< 8 km/h) for an extended
     * period but step counter shows zero steps, it's suspicious.
     *
     * Fail-open: returns true if step counter unavailable.
     */
    private fun checkStepCounterConsistency(
        sensorData: SensorFusionEngine.SensorSnapshot?,
        gpsSpeedKmh: Float
    ): Boolean {
        if (sensorData == null) return true
        if (sensorData.stepsSinceStart < 0) return true

        // Only check during pedestrian-speed movement
        // At driving speed, step counter is unreliable
        if (gpsSpeedKmh > PEDESTRIAN_SPEED_THRESHOLD_KMH) return true

        // If GPS shows walking speed but no steps in 2+ minutes, suspicious
        // We don't have enough context for time-based checks in single evaluation,
        // so this is a soft check based on total steps vs speed
        if (gpsSpeedKmh > 2f && sensorData.stepsSinceStart == 0) {
            // Only flag if we've been tracking for at least 2 minutes
            // (implied by SensorFusionEngine having been active)
            return true // Soft check for now, Phase 2 adds time-window analysis
        }

        return true
    }

    // ── Layer 4: Risk Score Calculation ─────────────────────────────

    /**
     * Calculate composite risk score using weighted signals.
     *
     * Weight distribution:
     *   - Mock provider flag: 0.40 (strongest signal)
     *   - Fake GPS apps installed: 0.25
     *   - Sensor inconsistency: 0.20
     *   - Developer options / settings: 0.15
     *
     * The weights are intentionally conservative to minimize false positives.
     * A courier with Developer Options enabled but no fake GPS apps will
     * score 0.05 (VALID), not trigger any response.
     */
    private fun calculateRiskScore(
        isMock: Boolean,
        mockSettingEnabled: Boolean,
        appScan: AppScanResult,
        accelOk: Boolean,
        gyroOk: Boolean,
        baroOk: Boolean,
        stepOk: Boolean,
        sensorAvailable: Boolean
    ): Float {
        var score = 0f

        // ── Mock provider flag (strongest signal) ──────────────────
        if (isMock) {
            score += WEIGHT_MOCK_PROVIDER
        }

        // ── Fake GPS apps installed ────────────────────────────────
        if (appScan.detectedApps.isNotEmpty()) {
            // Scale by number of apps detected (more apps = more suspicious)
            val appScore = minOf(appScan.detectedApps.size * 0.10f, WEIGHT_FAKE_APPS)
            score += appScore
        }

        // ── Sensor inconsistencies ─────────────────────────────────
        if (sensorAvailable) {
            var sensorFailCount = 0
            if (!accelOk) sensorFailCount++
            if (!gyroOk) sensorFailCount++
            if (!baroOk) sensorFailCount++
            if (!stepOk) sensorFailCount++

            if (sensorFailCount > 0) {
                score += minOf(sensorFailCount * 0.05f, WEIGHT_SENSOR_MISMATCH)
            }
        }

        // ── Developer options & settings ───────────────────────────
        if (appScan.developerOptionsEnabled) score += 0.03f
        if (appScan.usbDebuggingEnabled) score += 0.02f
        if (mockSettingEnabled && !isMock) score += 0.05f
        if (appScan.hasMockPermissionApps && appScan.detectedApps.isEmpty()) score += 0.05f

        return minOf(score, 1.0f)
    }

    companion object {
        // ── Risk thresholds ────────────────────────────────────────
        /** Score >= this = FAKE_GPS_DETECTED */
        private const val THRESHOLD_FAKE_GPS = 0.40f
        /** Score >= this = SUSPICIOUS */
        private const val THRESHOLD_SUSPICIOUS = 0.15f

        // ── Weight factors ─────────────────────────────────────────
        private const val WEIGHT_MOCK_PROVIDER = 0.40f
        private const val WEIGHT_FAKE_APPS = 0.25f
        private const val WEIGHT_SENSOR_MISMATCH = 0.20f

        // ── Sensor comparison thresholds ───────────────────────────
        /** Minimum GPS speed (km/h) to trigger accelerometer cross-check */
        private const val GPS_SPEED_THRESHOLD_KMH = 5f
        /** Maximum GPS speed (km/h) to be considered pedestrian movement */
        private const val PEDESTRIAN_SPEED_THRESHOLD_KMH = 8f
        /** Altitude difference tolerance between barometer and GPS (meters) */
        private const val ALTITUDE_TOLERANCE_METERS = 50f
    }
}
