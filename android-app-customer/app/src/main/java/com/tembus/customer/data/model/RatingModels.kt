package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Request body untuk submit rating ke kurir.
 * Rating 1-5 (Float, dari jumlah bintang yang dipilih).
 * Comment bersifat opsional.
 */
@Serializable
data class SubmitRatingRequest(
    @SerialName("rating")
    val rating: Float,
    @SerialName("comment")
    val comment: String = ""
)

/**
 * Response POST rating — handler backend return map[string]string:
 * {"status":"success","message":"...","order_id":"..."}
 * (bukan ApiResponse — field-nya `status`, bukan `success`)
 */
@Serializable
data class RatingSubmitResponse(
    @SerialName("status") val status: String = "",
    @SerialName("message") val message: String = "",
    @SerialName("order_id") val orderId: String = ""
)

/**
 * Satu item reminder rating yang dikembalikan dari endpoint /rating-reminders.
 * Berisi data kurir yang cukup untuk ditampilkan di RatingDialog
 * (foto, plat nomor, nama).
 */
@Serializable
data class RatingReminderItem(
    @SerialName("order_id")
    val orderId: String,
    @SerialName("order_number")
    val orderNumber: String = "",
    @SerialName("courier_name")
    val courierName: String = "",
    @SerialName("courier_photo_url")
    val courierPhotoUrl: String = "",
    @SerialName("courier_plate")
    val courierPlate: String = "",
    @SerialName("reminder_count")
    val reminderCount: Int = 0
)

@Serializable
data class RatingReminderListResponse(
    val success: Boolean = false,
    val data: List<RatingReminderItem> = emptyList()
)
