package com.tembus.courier.data.model

/**
 * Public merchant availability invalidation received over the authenticated
 * Socket.IO courier channel. The API remains the source of truth.
 */
data class MerchantOperatingStateEvent(
    val eventId: String,
    val merchantId: String,
    val state: String,
    val isOpen: Boolean?,
    val stateVersion: Long?,
)
