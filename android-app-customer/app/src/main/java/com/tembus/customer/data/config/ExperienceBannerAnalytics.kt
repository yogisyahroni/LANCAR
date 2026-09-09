package com.tembus.customer.data.config

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.config.model.ExperienceBannerEventRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

enum class ExperienceBannerEventType(val wireValue: String) {
    IMPRESSION("impression"),
    CLICK("click"),
    DISMISS("dismiss"),
    MANIFEST_FETCH_SUCCESS("manifest_fetch_success"),
    MANIFEST_FETCH_FAILURE("manifest_fetch_failure"),
    MANIFEST_CACHE_HIT("manifest_cache_hit"),
    MANIFEST_PARSE_FAILURE("manifest_parse_failure"),
    MANIFEST_SCHEMA_FALLBACK("manifest_schema_fallback"),
    SECTION_RENDER_FAILURE("section_render_failure"),
    ASSET_BROKEN("asset_broken"),
    DEEPLINK_FAILURE("deeplink_failure"),
    STARTUP_REGRESSION("startup_regression"),
    NETWORK_REGRESSION("network_regression"),
}

data class ExperienceBannerEvent(
    val type: ExperienceBannerEventType,
    val component: String,
    val campaignId: String,
    val sectionId: String,
    val manifestRevision: Int,
    val marketCode: String,
    val manifestId: String? = null,
    val latencyMs: Long? = null,
    val cacheHit: Boolean? = null,
    val errorCode: String? = null,
)

@Singleton
class ExperienceBannerAnalytics @Inject constructor(
    private val api: TEMBUSApiService,
) {
    /**
     * Telemetry is best-effort from the presentation surface. The server
     * persists accepted events to the canonical outbox; a failed call must
     * never block or crash the customer's dashboard.
     */
    suspend fun record(event: ExperienceBannerEvent): Boolean = withContext(Dispatchers.IO) {
        val marketingEvent = event.type in setOf(
            ExperienceBannerEventType.IMPRESSION,
            ExperienceBannerEventType.CLICK,
            ExperienceBannerEventType.DISMISS,
        )
        if (event.manifestRevision < 0 || (marketingEvent && event.manifestRevision < 1) || event.campaignId.isBlank() || event.sectionId.isBlank()) {
            return@withContext false
        }
        if (event.latencyMs != null && event.latencyMs !in 0L..60_000L) return@withContext false
        runCatching {
            val response = api.recordCustomerExperienceEvent(
                ExperienceBannerEventRequest(
                    eventId = UUID.randomUUID().toString(),
                    eventType = event.type.wireValue,
                    component = event.component,
                    campaignId = event.campaignId,
                    sectionId = event.sectionId,
                    manifestRevision = event.manifestRevision,
                    marketCode = event.marketCode,
                    manifestId = event.manifestId,
                    appVersion = com.tembus.customer.BuildConfig.VERSION_NAME,
                    latencyMs = event.latencyMs,
                    cacheHit = event.cacheHit,
                    errorCode = event.errorCode,
                ),
            )
            response.isSuccessful && response.body()?.data?.accepted == true
        }.getOrDefault(false)
    }
}
