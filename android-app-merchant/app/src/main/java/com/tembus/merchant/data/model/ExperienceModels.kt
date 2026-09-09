package com.tembus.merchant.data.model

import com.google.gson.annotations.SerializedName

data class ExperienceManifestEnvelope(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("data") val data: ExperienceManifest? = null,
    @SerializedName("message") val message: String? = null,
)

data class ExperienceManifest(
    @SerializedName("manifest_id") val manifestId: String = "",
    @SerializedName("revision") val revision: Int = 0,
    @SerializedName("market_code") val marketCode: String = "",
    @SerializedName("locale") val locale: String = "",
    @SerializedName("resolved_locale") val resolvedLocale: String? = null,
    @SerializedName("surface") val surface: String = "",
    @SerializedName("sections") val sections: List<ExperienceSection> = emptyList(),
)

data class ExperienceSection(
    @SerializedName("id") val id: String = "",
    @SerializedName("component") val component: String = "",
    @SerializedName("properties") val properties: Map<String, Any> = emptyMap(),
)
