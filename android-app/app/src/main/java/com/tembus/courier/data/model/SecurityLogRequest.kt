package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SecurityLogRequest(
    @SerialName("action_type")
    val actionType: String,
    
    @SerialName("status")
    val status: String,
    
    @SerialName("order_id")
    val orderId: String? = null
)
