package com.tembus.courier.util

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.Choreographer
import com.google.firebase.analytics.FirebaseAnalytics
import com.tembus.courier.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/** Privacy-safe client telemetry with bounded event names and dimensions. */
@Singleton
class MobileTelemetry @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val analytics: FirebaseAnalytics? by lazy {
        runCatching {
            if (FirebaseInitializer.isInitialized(context)) FirebaseAnalytics.getInstance(context) else null
        }.getOrNull()
    }

    fun screenView(screenId: String, outcome: String = "visible") {
        record(Event.SCREEN_VIEW, mapOf(
            "app" to APP,
            "screen_id" to classifyScreen(screenId),
            "market_code" to MARKET,
            "app_version" to BuildConfig.VERSION_NAME.take(MAX_VALUE_LENGTH),
            "outcome" to boundedOutcome(outcome),
        ))
    }

    fun apiRequest(path: String, statusCode: Int? = null, outcome: String = "completed") {
        record(Event.API_REQUEST, mapOf(
            "app" to APP,
            "operation" to operationForPath(path),
            "status_class" to (statusCode?.let(::statusClass) ?: "network_error"),
            "market_code" to MARKET,
            "app_version" to BuildConfig.VERSION_NAME.take(MAX_VALUE_LENGTH),
            "outcome" to boundedOutcome(outcome),
        ))
    }

    fun startup(startedAtElapsedRealtime: Long, mode: String = "resume") {
        val elapsed = (SystemClock.elapsedRealtime() - startedAtElapsedRealtime).coerceAtLeast(0L)
        record(Event.APP_START, mapOf(
            "app" to APP,
            "startup_mode" to if (mode in STARTUP_MODES) mode else "unknown",
            "app_version" to BuildConfig.VERSION_NAME.take(MAX_VALUE_LENGTH),
            "outcome" to "completed",
            "latency_bucket" to latencyBucket(elapsed),
        ))
    }

    /** Samples 30 frames asynchronously and never blocks the UI thread. */
    fun sampleFrameBudget(activity: Activity, surface: String) {
        val choreographer = Choreographer.getInstance()
        var frameCount = 0
        var jankyFrames = 0
        var previousFrameNanos = 0L
        val callback = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                if (previousFrameNanos != 0L && frameTimeNanos - previousFrameNanos > FRAME_BUDGET_NANOS) {
                    jankyFrames++
                }
                previousFrameNanos = frameTimeNanos
                frameCount++
                if (frameCount < FRAME_SAMPLE_COUNT) {
                    choreographer.postFrameCallback(this)
                    return
                }
                val jankPercent = (jankyFrames * 100.0) / frameCount
                record(Event.FRAME_BUDGET, mapOf(
                    "app" to APP,
                    "surface" to classifyScreen(surface),
                    "device_tier" to deviceTier(activity),
                    "app_version" to BuildConfig.VERSION_NAME.take(MAX_VALUE_LENGTH),
                    "outcome" to if (jankPercent <= FRAME_BUDGET_PERCENT) "within_budget" else "over_budget",
                ))
            }
        }
        choreographer.postFrameCallback(callback)
    }

    internal fun recordForTest(eventName: String, values: Map<String, String>): Boolean =
        eventName in ALLOWED_EVENTS && values.keys.all { it in ALLOWED_DIMENSIONS }

    private fun record(event: Event, values: Map<String, String>) {
        if (event.wireName !in ALLOWED_EVENTS) return
        val bundle = Bundle().apply {
            values.forEach { (key, value) -> putString(key, value.take(MAX_VALUE_LENGTH)) }
        }
        runCatching { analytics?.logEvent(event.wireName, bundle) }
        if (BuildConfig.DEBUG) Log.d(TAG, "event=${event.wireName}")
    }

    private fun deviceTier(activity: Activity): String {
        val memoryClass = (activity.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.memoryClass ?: 0
        return when {
            memoryClass < 192 -> "low"
            memoryClass >= 384 -> "high"
            else -> "mid"
        }
    }

    companion object {
        private const val TAG = "MobileTelemetry"
        private const val APP = "courier"
        private const val MARKET = "id"
        private const val MAX_VALUE_LENGTH = 64
        private const val FRAME_SAMPLE_COUNT = 30
        private const val FRAME_BUDGET_NANOS = 16_666_667L
        private const val FRAME_BUDGET_PERCENT = 8.0
        private val STARTUP_MODES = setOf("cold", "warm", "resume", "unknown")
        private val ALLOWED_EVENTS = setOf("screen_view", "api_request", "app_start", "frame_budget", "network_recovery")
        private val ALLOWED_DIMENSIONS = setOf(
            "app", "screen_id", "market_code", "app_version", "outcome", "operation", "status_class",
            "startup_mode", "latency_bucket", "surface", "device_tier",
        )

        private enum class Event(val wireName: String) {
            SCREEN_VIEW("screen_view"),
            API_REQUEST("api_request"),
            APP_START("app_start"),
            FRAME_BUDGET("frame_budget"),
        }

        internal fun operationForPath(path: String): String {
            val normalized = path.lowercase(Locale.US)
            return when {
                "/auth/" in normalized -> "auth"
                "/food/" in normalized -> "food"
                "/tracking" in normalized -> "tracking"
                "/orders" in normalized -> "orders"
                "/customer/" in normalized -> "customer"
                "/experience/" in normalized -> "experience"
                "/notifications" in normalized -> "notifications"
                else -> "unknown"
            }
        }

        internal fun statusClass(statusCode: Int): String = when (statusCode) {
            in 200..299 -> "2xx"
            in 400..499 -> "4xx"
            in 500..599 -> "5xx"
            else -> "other"
        }

        internal fun latencyBucket(elapsedMs: Long): String = when {
            elapsedMs <= 500L -> "0_500"
            elapsedMs <= 1_500L -> "501_1500"
            elapsedMs <= 3_000L -> "1501_3000"
            else -> "3000_plus"
        }

        private fun classifyScreen(screenId: String): String {
            val normalized = screenId.lowercase(Locale.US).substringBefore('?')
            return when {
                normalized.contains("dashboard") || normalized == "main" -> "dashboard"
                normalized.contains("login") || normalized.contains("auth") -> "auth"
                normalized.contains("search") -> "search"
                normalized.contains("food") || normalized.contains("merchant") -> "food"
                normalized.contains("order") -> "orders"
                normalized.contains("payment") -> "payment"
                normalized.contains("track") -> "tracking"
                normalized.contains("chat") || normalized.contains("call") -> "communication"
                normalized.contains("notification") || normalized.contains("inbox") -> "notifications"
                normalized.contains("profile") -> "profile"
                normalized.contains("service") || normalized.contains("towing") || normalized.contains("ban") -> "service"
                else -> "unknown"
            }
        }

        private fun boundedOutcome(value: String): String = when (value.lowercase(Locale.US)) {
            "visible", "completed", "failed", "cancelled", "recovered", "unknown" -> value.lowercase(Locale.US)
            else -> "unknown"
        }
    }
}
