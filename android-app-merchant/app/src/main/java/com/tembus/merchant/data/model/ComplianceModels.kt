package com.tembus.merchant.data.model

import com.google.gson.annotations.SerializedName

/** Active market compliance policy used to keep legal consent versioned. */
data class CompliancePolicyEnvelope(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("data") val data: CompliancePolicy? = null
)

data class CompliancePolicy(
    @SerializedName("market_code") val marketCode: String = "",
    @SerializedName("requirements") val requirements: List<ComplianceRequirement> = emptyList()
)

data class ComplianceRequirement(
    @SerializedName("role_code") val roleCode: String = "",
    @SerializedName("requirement_code") val requirementCode: String = "",
    @SerializedName("requirement_kind") val requirementKind: String = "",
    @SerializedName("document_type") val documentType: String? = null,
    @SerializedName("document_version") val documentVersion: String? = null,
    @SerializedName("locale") val locale: String = "id-ID",
    @SerializedName("purpose") val purpose: String = "",
    @SerializedName("is_required") val isRequired: Boolean = false
)

data class ComplianceConsentRequest(
    @SerializedName("market_code") val marketCode: String,
    @SerializedName("requirement_code") val requirementCode: String,
    @SerializedName("document_type") val documentType: String,
    @SerializedName("document_version") val documentVersion: String,
    @SerializedName("locale") val locale: String,
    @SerializedName("purpose") val purpose: String,
    @SerializedName("consent") val consent: Boolean,
    @SerializedName("metadata") val metadata: Map<String, String>
)

data class ComplianceConsentEnvelope(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("data") val data: ComplianceConsentRecord? = null
)

data class ComplianceConsentRecord(
    @SerializedName("id") val id: String = "",
    @SerializedName("requirement_code") val requirementCode: String = "",
    @SerializedName("document_version") val documentVersion: String = "",
    @SerializedName("consented_at") val consentedAt: String? = null
)
