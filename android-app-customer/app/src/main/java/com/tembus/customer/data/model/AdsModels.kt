package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AdsPlacementResponse(
    @SerialName("items") val items: List<AdsDeliveryItem> = emptyList(),
    @SerialName("source") val source: String = "organic_fallback",
    @SerialName("fallback") val fallback: String? = null,
)

@Serializable
data class AdsDeliveryItem(
    @SerialName("campaign_id") val campaignId: String = "",
    @SerialName("merchant_id") val merchantId: String = "",
    @SerialName("creative_headline") val headline: String = "",
    @SerialName("creative_body") val body: String? = null,
    @SerialName("creative_image_url") val imageUrl: String? = null,
    @SerialName("creative_alt_text") val altText: String = "",
    @SerialName("ad_delivery_token") val adDeliveryToken: String = "",
    @SerialName("source_type") val sourceType: String = "sponsored_ad",
    @SerialName("disclosure_label") val disclosureLabel: String = "Sponsored / Iklan",
    @SerialName("organic_facts") val organicFacts: AdsOrganicFacts = AdsOrganicFacts(),
)

@Serializable
data class AdsOrganicFacts(
    @SerialName("serviceable") val serviceable: Boolean = false,
    @SerialName("availability") val availability: String = "server_resolved",
    @SerialName("rating") val rating: Double? = null,
    @SerialName("eta_minutes") val etaMinutes: Int? = null,
)

@Serializable
data class AdsEventRequest(
    @SerialName("ad_delivery_token") val adDeliveryToken: String,
    @SerialName("user_hash") val userHash: String? = null,
    @SerialName("session_hash") val sessionHash: String? = null,
)

@Serializable
data class AdsEventResponse(
    @SerialName("accepted") val accepted: Boolean = false,
    @SerialName("deduplicated") val deduplicated: Boolean = false,
    @SerialName("reason") val reason: String? = null,
)
