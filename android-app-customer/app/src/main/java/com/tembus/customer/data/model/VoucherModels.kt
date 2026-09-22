package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * FB-078: Voucher redeem customer di checkout.
 * Client hanya kirim kode — harga dihitung server-side (zero-trust).
 */

@Serializable
data class VoucherValidateRequest(
    @SerialName("code") val code: String,
    @SerialName("base_idr") val baseIdr: Long,
    @SerialName("model") val model: String = "p2p"
)

@Serializable
data class VoucherValidateResponse(
    @SerialName("valid") val valid: Boolean = false,
    @SerialName("voucher_id") val voucherId: String? = null,
    @SerialName("code") val code: String = "",
    @SerialName("name") val name: String = "",
    @SerialName("discount_idr") val discountIdr: Long = 0,
    @SerialName("error") val error: String? = null
)

@Serializable
data class CustomerEligiblePromo(
    @SerialName("id") val id: String = "",
    @SerialName("code") val code: String = "",
    @SerialName("name") val name: String = "",
    @SerialName("description") val description: String? = null,
    @SerialName("discount_type") val discountType: String = "",
    @SerialName("discount_value_idr") val discountValueIdr: Long = 0,
    @SerialName("discount_percent") val discountPercent: Double? = null,
    @SerialName("max_discount_idr") val maxDiscountIdr: Long? = null,
    @SerialName("min_order_idr") val minOrderIdr: Long? = null,
    @SerialName("service_codes") val serviceCodes: List<String> = emptyList(),
    @SerialName("starts_at") val startsAt: String? = null,
    @SerialName("ends_at") val endsAt: String? = null,
    @SerialName("notification_copy") val notificationCopy: Map<String, String> = emptyMap(),
)

@Serializable
data class CustomerEligiblePromosResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("data") val data: List<CustomerEligiblePromo> = emptyList(),
    @SerialName("message") val message: String? = null,
)
