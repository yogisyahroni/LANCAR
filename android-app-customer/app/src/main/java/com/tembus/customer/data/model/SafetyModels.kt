package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SafetyCenterResponse(
    @SerialName("success") val success: Boolean,
    @SerialName("data") val data: SafetyCenterData? = null,
    @SerialName("message") val message: String? = null
)

@Serializable
data class SafetyActionResponse(
    @SerialName("success") val success: Boolean,
    @SerialName("data") val data: SafetyIncident? = null,
    @SerialName("escalation") val escalation: String? = null,
    @SerialName("provider_response_claimed") val providerResponseClaimed: Boolean = false,
    @SerialName("message") val message: String? = null
)

@Serializable
data class SafetyIncidentRequest(
    @SerialName("category") val category: String,
    @SerialName("severity") val severity: String,
    @SerialName("message") val message: String
)

@Serializable
data class SafetyCenterData(
    @SerialName("active_order_reachable") val activeOrderReachable: Boolean = true,
    @SerialName("order") val order: SafetyOrder? = null,
    @SerialName("policy") val policy: SafetyPolicy = SafetyPolicy(),
    @SerialName("incidents") val incidents: List<SafetyIncident> = emptyList()
)

@Serializable
data class SafetyOrder(
    @SerialName("id") val id: String,
    @SerialName("service_code") val serviceCode: String? = null,
    @SerialName("status") val status: String? = null,
    @SerialName("market_code") val marketCode: String? = null
)

@Serializable
data class SafetyPolicy(
    @SerialName("activeOrderReachable") val activeOrderReachable: Boolean = true,
    @SerialName("actions") val actions: List<String> = emptyList(),
    @SerialName("sos") val sos: SafetySosPolicy = SafetySosPolicy(),
    @SerialName("share") val share: SafetySharePolicy = SafetySharePolicy()
)

@Serializable
data class SafetySosPolicy(
    @SerialName("configured") val configured: Boolean = false,
    @SerialName("status") val status: String = "fallback",
    @SerialName("consequence") val consequence: String = "Insiden dicatat; respons vendor tidak dijanjikan."
)

@Serializable
data class SafetySharePolicy(
    @SerialName("minimumData") val minimumData: List<String> = emptyList(),
    @SerialName("ttlMinutes") val ttlMinutes: Int = 360,
    @SerialName("revocable") val revocable: Boolean = true,
    @SerialName("mutation") val mutation: Boolean = false
)

@Serializable
data class SafetyIncident(
    @SerialName("id") val id: String,
    @SerialName("order_id") val orderId: String? = null,
    @SerialName("category") val category: String? = null,
    @SerialName("severity") val severity: String? = null,
    @SerialName("state") val state: String? = null,
    @SerialName("escalation_state") val escalationState: String? = null,
    @SerialName("sla_due_at") val slaDueAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)
