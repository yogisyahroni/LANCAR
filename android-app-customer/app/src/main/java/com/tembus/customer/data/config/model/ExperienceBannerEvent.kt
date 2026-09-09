package com.tembus.customer.data.config.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ExperienceBannerEventRequest(
    @SerialName("event_id") val eventId: String,
    @SerialName("event_type") val eventType: String,
    @SerialName("surface") val surface: String = "customer_android",
    @SerialName("component") val component: String,
    @SerialName("campaign_id") val campaignId: String,
    @SerialName("section_id") val sectionId: String,
    @SerialName("manifest_revision") val manifestRevision: Int,
    @SerialName("market_code") val marketCode: String,
)

@Serializable
data class ExperienceBannerEventResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("data") val data: ExperienceBannerEventAccepted? = null,
)

@Serializable
data class ExperienceBannerEventAccepted(
    @SerialName("accepted") val accepted: Boolean = false,
    @SerialName("event_id") val eventId: String? = null,
)
