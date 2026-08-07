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
