package com.tembus.customer.data.config

import java.util.Locale

/** Pure delivery checks shared by the network staging path and unit tests. */
object ExperienceAssetDeliveryPolicy {
    const val MAX_ASSET_BYTES = 5L * 1024L * 1024L
    const val ASPECT_RATIO_TOLERANCE = 0.02

    fun contentTypeMatches(kind: String, expected: String, actual: String?): Boolean {
        val normalizedExpected = expected.trim().lowercase(Locale.ROOT)
        if (normalizedExpected.isBlank()) return true
        val normalizedActual = actual?.substringBefore(';')?.trim()?.lowercase(Locale.ROOT) ?: return false
        if (normalizedExpected != normalizedActual) return false
        return if (kind == "video") normalizedExpected.startsWith("video/") else normalizedExpected.startsWith("image/")
    }

    fun withinByteLimit(bytes: Long, declaredLimit: Long): Boolean =
        bytes >= 0 && declaredLimit in 1L..MAX_ASSET_BYTES && bytes <= declaredLimit

    fun dimensionsMatch(
        width: Int,
        height: Int,
        expectedWidth: Int?,
        expectedHeight: Int?,
        expectedAspectRatio: Double?,
    ): Boolean {
        if (expectedWidth != null && width != expectedWidth) return false
        if (expectedHeight != null && height != expectedHeight) return false
        if (expectedAspectRatio != null && kotlin.math.abs((width.toDouble() / height) - expectedAspectRatio) > ASPECT_RATIO_TOLERANCE) return false
        return true
    }
}
