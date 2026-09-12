package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Search is discovery-only. These models intentionally do not contain price,
 * ETA, rating, discount, or transaction state; those values remain owned by
 * their authoritative service screens.
 */
@Serializable
data class UniversalSearchDocument(
    @SerialName("entity_id") val entityId: String,
    @SerialName("entity_type") val entityType: String,
    @SerialName("service_code") val serviceCode: String? = null,
    @SerialName("title") val title: String,
    @SerialName("canonical_route") val canonicalRoute: String = "",
    @SerialName("open_now") val openNow: Boolean? = null,
    @SerialName("available") val available: Boolean = true,
    @SerialName("unavailable_reason") val unavailableReason: String? = null,
    @SerialName("sponsored") val sponsored: Boolean = false,
)

@Serializable
data class UniversalSearchIntent(
    @SerialName("canonical_query") val canonicalQuery: String,
    @SerialName("service") val service: String? = null,
    @SerialName("filters") val filters: Map<String, String> = emptyMap(),
    @SerialName("confidence") val confidence: String = "low",
)

@Serializable
data class UniversalSearchResponse(
    @SerialName("schema_version") val schemaVersion: String = "search.v1",
    @SerialName("query") val query: String = "",
    @SerialName("intent") val intent: UniversalSearchIntent? = null,
    @SerialName("results") val results: List<UniversalSearchDocument> = emptyList(),
    @SerialName("total") val total: Int = 0,
    @SerialName("ranking_version") val rankingVersion: String? = null,
    @SerialName("organic_only") val organicOnly: Boolean = true,
    @SerialName("stale") val stale: Boolean = false,
)

@Serializable
data class UniversalSearchEnvelope(
    @SerialName("status") val status: String? = null,
    @SerialName("data") val data: UniversalSearchResponse? = null,
)

@Serializable
data class UniversalAutocompleteData(
    @SerialName("schema_version") val schemaVersion: String = "search.autocomplete.v1",
    @SerialName("suggestions") val suggestions: List<String> = emptyList(),
)

@Serializable
data class UniversalAutocompleteEnvelope(
    @SerialName("status") val status: String? = null,
    @SerialName("data") val data: UniversalAutocompleteData? = null,
)
