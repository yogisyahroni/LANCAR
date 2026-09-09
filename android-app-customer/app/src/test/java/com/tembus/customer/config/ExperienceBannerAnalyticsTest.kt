package com.tembus.customer.config

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.config.ExperienceBannerAnalytics
import com.tembus.customer.data.config.ExperienceBannerEvent
import com.tembus.customer.data.config.ExperienceBannerEventType
import com.tembus.customer.data.config.model.ExperienceBannerEventAccepted
import com.tembus.customer.data.config.model.ExperienceBannerEventResponse
import io.mockk.coEvery
import io.mockk.slot
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

class ExperienceBannerAnalyticsTest {
    @Test
    fun runtimeEventCarriesReleaseAndLatencyDimensions() = runTest {
        val api = mockk<TEMBUSApiService>()
        val request = slot<com.tembus.customer.data.config.model.ExperienceBannerEventRequest>()
        coEvery { api.recordCustomerExperienceEvent(capture(request)) } returns Response.success(
            ExperienceBannerEventResponse(
                success = true,
                data = ExperienceBannerEventAccepted(accepted = true),
            ),
        )

        val accepted = ExperienceBannerAnalytics(api).record(
            ExperienceBannerEvent(
                type = ExperienceBannerEventType.MANIFEST_FETCH_SUCCESS,
                component = "manifest",
                campaignId = "runtime",
                sectionId = "runtime",
                manifestRevision = 0,
                marketCode = "id-jk",
                manifestId = "550e8400-e29b-41d4-a716-446655440000",
                latencyMs = 125,
                cacheHit = false,
            ),
        )

        assertTrue(accepted)
        assertTrue(request.captured.eventType == "manifest_fetch_success")
        assertTrue(request.captured.manifestId != null)
        assertTrue(request.captured.latencyMs == 125L)
        assertTrue(request.captured.cacheHit == false)
    }

    @Test
    fun rejectsOutOfRangeLatencyBeforeCallingApi() = runTest {
        val api = mockk<TEMBUSApiService>()
        val analytics = ExperienceBannerAnalytics(api)

        val accepted = analytics.record(
            ExperienceBannerEvent(
                type = ExperienceBannerEventType.NETWORK_REGRESSION,
                component = "network",
                campaignId = "runtime",
                sectionId = "runtime",
                manifestRevision = 1,
                marketCode = "id-jk",
                latencyMs = 60_001,
            ),
        )

        assertFalse(accepted)
    }
}
