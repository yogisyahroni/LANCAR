package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

@Serializable
data class ExperienceManifestEnvelope(
    @SerialName("success") val success: Boolean = false,
    @SerialName("data") val data: ExperienceManifest? = null,
    @SerialName("message") val message: String? = null,
)

@Serializable
data class ExperienceManifest(
    @SerialName("manifest_id") val manifestId: String = "",
    @SerialName("revision") val revision: Int = 0,
    @SerialName("market_code") val marketCode: String = "",
    @SerialName("locale") val locale: String = "",
    @SerialName("resolved_locale") val resolvedLocale: String? = null,
    @SerialName("surface") val surface: String = "",
    @SerialName("sections") val sections: List<ExperienceSection> = emptyList(),
)

@Serializable
data class ExperienceSection(
    @SerialName("id") val id: String = "",
    @SerialName("component") val component: String = "",
    @SerialName("properties") val properties: JsonObject = buildJsonObject {},
)
