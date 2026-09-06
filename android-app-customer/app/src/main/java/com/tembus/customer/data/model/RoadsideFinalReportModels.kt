package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TambalBanFinalReport(
    @SerialName("id") val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("tire_condition_before") val tireConditionBefore: String? = null,
    @SerialName("tire_photo_before_url") val tirePhotoBeforeUrl: String? = null,
    @SerialName("service_duration_minutes") val serviceDurationMinutes: Int? = null,
    @SerialName("materials_used_items") val materialsUsedItems: List<String> = emptyList(),
    @SerialName("notes") val notes: String? = null,
    @SerialName("tire_condition_after") val tireConditionAfter: String? = null,
    @SerialName("tire_photo_after_url") val tirePhotoAfterUrl: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class RoadsideFinalReportResponse(
    @SerialName("report") val report: TambalBanFinalReport,
    @SerialName("approved_adjustment") val approvedAdjustment: ServiceAdjustment? = null
)
