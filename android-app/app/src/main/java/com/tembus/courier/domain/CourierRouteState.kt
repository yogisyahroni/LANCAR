package com.tembus.courier.domain

enum class CourierRouteScreen {
    HOME,
    ORDER_DETAIL,
    SCAN,
    PROOF,
    CHAT,
    CALL,
    FACE_VERIFY,
    INBOX,
    SERVICE_UPGRADE,
    TAMBAL_BAN_FLOW,
    TOWING_FLOW
}

data class CourierRouteState(
    val screen: CourierRouteScreen = CourierRouteScreen.HOME,
    val orderId: String? = null,
    val callId: String? = null,
    val callTargetType: String = "customer",
    val scanType: String = CourierProofTypes.PICKUP_SCAN,
    val proofMode: String = CourierProofTypes.DELIVERY_POD_PHOTO
) {
    val hasOrderContext: Boolean
        get() = !orderId.isNullOrBlank()
}

object CourierRouteReducer {
    fun home(): CourierRouteState = CourierRouteState()

    fun serviceUpgrade(): CourierRouteState = CourierRouteState(screen = CourierRouteScreen.SERVICE_UPGRADE)

    fun tambalBanFlow(orderId: String): CourierRouteState =
        CourierRouteState(screen = CourierRouteScreen.TAMBAL_BAN_FLOW, orderId = orderId)

    fun towingFlow(orderId: String): CourierRouteState =
        CourierRouteState(screen = CourierRouteScreen.TOWING_FLOW, orderId = orderId)

    fun inbox(): CourierRouteState = CourierRouteState(screen = CourierRouteScreen.INBOX)

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

    fun call(orderId: String, callId: String? = null, targetType: String = "customer"): CourierRouteState =
        CourierRouteState(
            screen = CourierRouteScreen.CALL,
            orderId = orderId,
            callId = callId?.takeIf { it.isNotBlank() },
            callTargetType = normalizeCallTargetType(targetType)
        )

    fun faceVerify(orderId: String): CourierRouteState =
        CourierRouteState(screen = CourierRouteScreen.FACE_VERIFY, orderId = orderId)

    fun backFromChild(state: CourierRouteState): CourierRouteState {
        return if (state.hasOrderContext && state.screen in setOf(
            CourierRouteScreen.SCAN,
            CourierRouteScreen.PROOF,
            CourierRouteScreen.CHAT,
            CourierRouteScreen.CALL,
            CourierRouteScreen.FACE_VERIFY
        )) {
            state.copy(screen = CourierRouteScreen.ORDER_DETAIL)
        } else {
            home()
        }
    }

    private fun normalizeCallTargetType(value: String): String = when (value.trim().lowercase()) {
        "recipient" -> "recipient"
        "support" -> "support"
        else -> "customer"
    }
}
