package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RuntimeConfigData(
    @SerialName("courier_sync_interval_ms")
    val courierSyncIntervalMs: Long? = null
)

@Serializable
data class RuntimeConfigResponse(
    @SerialName("data")
    val data: RuntimeConfigData? = null
)
