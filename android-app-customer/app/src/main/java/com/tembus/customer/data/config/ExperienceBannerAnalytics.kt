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
}

data class ExperienceBannerEvent(
    val type: ExperienceBannerEventType,
    val component: String,
    val campaignId: String,
    val sectionId: String,
    val manifestRevision: Int,
    val marketCode: String,
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
        if (event.manifestRevision < 1 || event.campaignId.isBlank() || event.sectionId.isBlank()) return@withContext false
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
                ),
            )
            response.isSuccessful && response.body()?.data?.accepted == true
        }.getOrDefault(false)
    }
}
