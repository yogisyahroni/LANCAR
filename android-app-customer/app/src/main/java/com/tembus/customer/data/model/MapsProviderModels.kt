package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class MapsProviderConfig(
    @SerialName("enabled")
    val enabled: Boolean = true,

    @SerialName("requested_provider")
    val requestedProvider: String = "openstreetmap",

    @SerialName("active_provider")
    val activeProvider: String = "openstreetmap",

    @SerialName("fallback_provider")
    val fallbackProvider: String = "openstreetmap",

    @SerialName("scope")
    val scope: String = "customer_mobile",

    @SerialName("ttl_seconds")
    val ttlSeconds: Int = 300,

    @SerialName("reason")
    val reason: String? = null,

    @SerialName("capabilities")
    val capabilities: MapsProviderCapabilities = MapsProviderCapabilities(),

    @SerialName("openstreetmap")
    val openStreetMap: OpenStreetMapRuntimeConfig = OpenStreetMapRuntimeConfig()
)

@Serializable
data class MapsProviderCapabilities(
    @SerialName("tiles")
    val tiles: Boolean = false,

    @SerialName("routing")
    val routing: Boolean = false,

    @SerialName("geocoding")
    val geocoding: Boolean = false
)

@Serializable
data class OpenStreetMapRuntimeConfig(
    @SerialName("tile_url_template")
    val tileUrlTemplate: String? = null,

    @SerialName("attribution")
    val attribution: String? = null
)

@Serializable
data class MapsGeocodeResponse(
    @SerialName("results")
    val results: List<MapsGeocodeResult> = emptyList()
)

@Serializable
data class MapsReverseGeocodeResponse(
    @SerialName("result")
    val result: MapsGeocodeResult? = null
)

@Serializable
data class MapsGeocodeResult(
    @SerialName("label")
    val label: String = "",

    @SerialName("latitude")
    val latitude: Double = 0.0,

    @SerialName("longitude")
    val longitude: Double = 0.0,

    @SerialName("provider")
    val provider: String = "",

    @SerialName("confidence")
    val confidence: Double? = null
)
