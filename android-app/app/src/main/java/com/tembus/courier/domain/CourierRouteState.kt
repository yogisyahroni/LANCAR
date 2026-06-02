package com.tembus.courier.domain

enum class CourierRouteScreen {
    HOME,
    ORDER_DETAIL,
    SCAN,
    PROOF,
    CHAT
}

data class CourierRouteState(
    val screen: CourierRouteScreen = CourierRouteScreen.HOME,
    val orderId: String? = null,
    val scanType: String = CourierProofTypes.PICKUP_SCAN,
    val proofMode: String = CourierProofTypes.DELIVERY_POD_PHOTO
) {
    val hasOrderContext: Boolean
        get() = !orderId.isNullOrBlank()
}

object CourierRouteReducer {
    fun home(): CourierRouteState = CourierRouteState()

    fun detail(orderId: String): CourierRouteState =
        CourierRouteState(screen = CourierRouteScreen.ORDER_DETAIL, orderId = orderId)

    fun scan(orderId: String?, scanType: String = CourierProofTypes.PICKUP_SCAN): CourierRouteState =
        CourierRouteState(
            screen = CourierRouteScreen.SCAN,
            orderId = orderId?.takeIf { it.isNotBlank() },
            scanType = when (scanType.trim().lowercase()) {
                "pickup", CourierProofTypes.PICKUP_SCAN -> CourierProofTypes.PICKUP_SCAN
                else -> CourierProofTypes.normalize(scanType)
            }
        )

    fun proof(orderId: String, proofMode: String = CourierProofTypes.DELIVERY_POD_PHOTO): CourierRouteState =
        CourierRouteState(
            screen = CourierRouteScreen.PROOF,
            orderId = orderId,
            proofMode = CourierProofTypes.normalize(proofMode)
        )

    fun chat(orderId: String): CourierRouteState =
        CourierRouteState(screen = CourierRouteScreen.CHAT, orderId = orderId)

    fun backFromChild(state: CourierRouteState): CourierRouteState {
        return if (state.hasOrderContext && state.screen in setOf(CourierRouteScreen.SCAN, CourierRouteScreen.PROOF, CourierRouteScreen.CHAT)) {
            state.copy(screen = CourierRouteScreen.ORDER_DETAIL)
        } else {
            home()
        }
    }
}
