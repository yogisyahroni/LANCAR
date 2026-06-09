package com.tembus.courier.data.security

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.util.Log
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * SensorFusionEngine — Hardware Sensor Data Collector & Validator
 *
 * Collects real-time readings from device hardware sensors and provides
 * consistency checks against GPS location data. This is the core of
 * Layer 3 (Hardware Sensor Validation) in the Anti-Fake GPS architecture.
 *
 * Sensors used:
 *   - TYPE_ACCELEROMETER: detects physical device movement
 *   - TYPE_GYROSCOPE: detects orientation/bearing changes
 *   - TYPE_PRESSURE: barometric altitude estimation
 *   - TYPE_STEP_COUNTER: pedometer for walking detection
 *
 * Battery optimization:
 *   - Uses SENSOR_DELAY_NORMAL (200ms sample interval)
 *   - Ring buffer of 60 samples per sensor (~12 seconds of data)
 *   - Listeners only active when explicitly started
 *   - All processing in-memory, no disk writes
 *
 * Thread safety:
 *   - SensorManager callbacks arrive on the main thread by default
 *   - All state is read atomically through snapshot methods
 */
class SensorFusionEngine(context: Context) : SensorEventListener {

    private val TAG = "SensorFusionEngine"

    private val sensorManager: SensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    // ── Sensor availability flags ──────────────────────────────────
    private val accelerometer: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val barometer: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE)
    private val stepCounter: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    val hasAccelerometer: Boolean get() = accelerometer != null
    val hasGyroscope: Boolean get() = gyroscope != null
    val hasBarometer: Boolean get() = barometer != null
    val hasStepCounter: Boolean get() = stepCounter != null

    val hasSensors: Boolean get() = hasAccelerometer || hasGyroscope || hasBarometer || hasStepCounter

    // ── Ring buffers for sensor data ───────────────────────────────
    private val bufferSize = 60

    private val accelBuffer = RingBuffer<AccelSample>(bufferSize)
    private val gyroBuffer = RingBuffer<GyroSample>(bufferSize)
    private var latestPressureHPa: Float? = null
    private var latestPressureTimestamp: Long = 0L
    private var initialStepCount: Int = -1
    private var latestStepCount: Int = 0
    private var stepCountTimestamp: Long = 0L

    private var isListening = false

    // ── Data classes for sensor samples ────────────────────────────

    data class AccelSample(
        val x: Float,
        val y: Float,
        val z: Float,
        val magnitude: Float,
        val timestamp: Long
    )

    data class GyroSample(
        val x: Float,
        val y: Float,
        val z: Float,
        val timestamp: Long
    )

    /**
     * Snapshot of current sensor readings at a point in time.
     * Thread-safe data class returned to callers for evaluation.
     */
    data class SensorSnapshot(
        val accelMagnitudeAvg: Float,
        val accelMagnitudeMax: Float,
        val isDeviceMoving: Boolean,
        val gyroRotationRateDegPerSec: Float,
        val estimatedBearingChangeDeg: Float,
        val barometerAltitudeMeters: Float?,
        val stepsSinceStart: Int,
        val sensorAvailable: Boolean,
        val timestamp: Long
    )

    // ── Lifecycle ──────────────────────────────────────────────────

    /**
     * Start listening to all available sensors.
     * Call from LocationTrackerService.onCreate or startTracking.
     */
    fun start() {
        if (isListening) return

        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
        gyroscope?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
        barometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
        stepCounter?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }

        isListening = true
        Log.d(TAG, "Sensor listeners started (accel=${hasAccelerometer}, gyro=${hasGyroscope}, baro=${hasBarometer}, step=${hasStepCounter})")
    }

    /**
     * Stop listening to all sensors.
     * Call from LocationTrackerService.onDestroy or stopTracking.
     */
    fun stop() {
        if (!isListening) return

        sensorManager.unregisterListener(this)
        isListening = false
        Log.d(TAG, "Sensor listeners stopped")
    }

    /**
     * Reset all buffers and counters.
     */
    fun reset() {
        accelBuffer.clear()
        gyroBuffer.clear()
        latestPressureHPa = null
        latestPressureTimestamp = 0L
        initialStepCount = -1
        latestStepCount = 0
        stepCountTimestamp = 0L
    }

    // ── SensorEventListener callbacks ──────────────────────────────

    override fun onSensorChanged(event: SensorEvent) {
        val now = System.currentTimeMillis()

        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                val x = event.values[0]
                val y = event.values[1]
                val z = event.values[2]
                val magnitude = sqrt(x * x + y * y + z * z)
                accelBuffer.add(AccelSample(x, y, z, magnitude, now))
            }

            Sensor.TYPE_GYROSCOPE -> {
                gyroBuffer.add(GyroSample(
                    x = event.values[0],
                    y = event.values[1],
                    z = event.values[2],
                    timestamp = now
                ))
            }

            Sensor.TYPE_PRESSURE -> {
                latestPressureHPa = event.values[0]
                latestPressureTimestamp = now
            }

            Sensor.TYPE_STEP_COUNTER -> {
                val steps = event.values[0].toInt()
                if (initialStepCount < 0) {
                    initialStepCount = steps
                }
                latestStepCount = steps
                stepCountTimestamp = now
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used — accuracy changes don't affect our integrity checks
    }

    // ── Public API: get current readings ───────────────────────────

    /**
     * Take a thread-safe snapshot of the latest sensor data.
     * This is called by FakeGpsDetector on each location update.
     */
    fun getLatestReadings(): SensorSnapshot {
        val now = System.currentTimeMillis()

        // Accelerometer analysis
        val accelSamples = accelBuffer.toList()
        val accelMagAvg = if (accelSamples.isNotEmpty()) {
            accelSamples.map { it.magnitude }.average().toFloat()
        } else 0f
        val accelMagMax = accelSamples.maxOfOrNull { it.magnitude } ?: 0f

        // Device is "moving" if magnitude deviates from gravity (9.81 m/s²)
        // by more than 0.5 m/s² consistently over the buffer window
        val isMoving = if (accelSamples.size >= 5) {
            val recentSamples = accelSamples.takeLast(10)
            val avgDeviation = recentSamples.map { abs(it.magnitude - GRAVITY) }.average()
            avgDeviation > MOVEMENT_THRESHOLD
        } else {
            true // Fail-open: if not enough data, assume moving
        }

        // Gyroscope analysis: average rotation rate in degrees/sec
        val gyroSamples = gyroBuffer.toList()
        val gyroRotationRate = if (gyroSamples.isNotEmpty()) {
            val rates = gyroSamples.map {
                sqrt(it.x * it.x + it.y * it.y + it.z * it.z)
            }
            Math.toDegrees(rates.average()).toFloat()
        } else 0f

        // Estimated bearing change from gyroscope Z-axis integration (yaw)
        val bearingChange = estimateBearingChangeFromGyro(gyroSamples)

        // Barometric altitude (International Barometric Formula)
        val baroAltitude = latestPressureHPa?.let { pressure ->
            // Only use if reading is less than 30 seconds old
            if (now - latestPressureTimestamp < 30_000L) {
                pressureToAltitude(pressure)
            } else null
        }

        // Step counter
        val steps = if (initialStepCount >= 0) {
            latestStepCount - initialStepCount
        } else 0

        return SensorSnapshot(
            accelMagnitudeAvg = accelMagAvg,
            accelMagnitudeMax = accelMagMax,
            isDeviceMoving = isMoving,
            gyroRotationRateDegPerSec = gyroRotationRate,
            estimatedBearingChangeDeg = bearingChange,
            barometerAltitudeMeters = baroAltitude,
            stepsSinceStart = steps,
            sensorAvailable = hasSensors,
            timestamp = now
        )
    }

    // ── Internal helpers ───────────────────────────────────────────

    /**
     * Integrate gyroscope Z-axis (yaw) readings to estimate total bearing change.
     * Uses trapezoidal integration over the last 10 seconds of samples.
     *
     * Gyroscope Z-axis = rotation around vertical axis = compass bearing change.
     */
    private fun estimateBearingChangeFromGyro(samples: List<GyroSample>): Float {
        if (samples.size < 2) return 0f

        val recentSamples = samples.filter {
            System.currentTimeMillis() - it.timestamp < 10_000L
        }
        if (recentSamples.size < 2) return 0f

        var totalRadians = 0f
        for (i in 1 until recentSamples.size) {
            val dt = (recentSamples[i].timestamp - recentSamples[i - 1].timestamp) / 1000f
            if (dt > 0f && dt < 2f) {
                // Trapezoidal integration
                val avgRate = (recentSamples[i].z + recentSamples[i - 1].z) / 2f
                totalRadians += avgRate * dt
            }
        }

        return abs(Math.toDegrees(totalRadians.toDouble()).toFloat())
    }

    /**
     * Convert barometric pressure (hPa) to altitude (meters) using
     * the International Barometric Formula.
     *
     * Uses standard sea-level pressure of 1013.25 hPa.
     * Accuracy: ±50m without local pressure calibration.
     */
    private fun pressureToAltitude(pressureHPa: Float): Float {
        return SensorManager.getAltitude(SensorManager.PRESSURE_STANDARD_ATMOSPHERE, pressureHPa)
    }

    // ── Ring Buffer ────────────────────────────────────────────────

    /**
     * Fixed-size circular buffer for sensor samples.
     * Thread-safe through synchronized access.
     */
    private class RingBuffer<T>(private val capacity: Int) {
        private val buffer = ArrayList<T>(capacity)
        private var writeIndex = 0

        @Synchronized
        fun add(element: T) {
            if (buffer.size < capacity) {
                buffer.add(element)
            } else {
                buffer[writeIndex] = element
            }
            writeIndex = (writeIndex + 1) % capacity
        }

        @Synchronized
        fun toList(): List<T> {
            if (buffer.size < capacity) return ArrayList(buffer)
            // Return in chronological order
            val result = ArrayList<T>(capacity)
            for (i in 0 until capacity) {
                result.add(buffer[(writeIndex + i) % capacity])
            }
            return result
        }

        @Synchronized
        fun clear() {
            buffer.clear()
            writeIndex = 0
        }
    }

    companion object {
        /** Standard gravity in m/s² */
        private const val GRAVITY = 9.81f

        /**
         * Minimum accelerometer deviation from gravity to consider device as "moving".
         * 0.5 m/s² filters out sensor noise while detecting walking/driving.
         */
        private const val MOVEMENT_THRESHOLD = 0.5f
    }
}
