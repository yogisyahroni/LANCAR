package com.tembus.customer.ui.policy

import com.tembus.customer.ui.screens.booking.BookingAddressPoint
import java.time.Instant

/**
 * Customer Paket flow decisions. These functions only decide presentation and
 * retry affordances; price, state and proof remain server-authoritative.
 */
object PackageOrderFlowPolicy {
    enum class PaymentOutcome { PENDING, PAID, FAILED, LATE_CALLBACK_REVIEW }
    enum class CourierOutcome { SEARCHING, ASSIGNED, NO_SUPPLY_RETRYABLE, INVALID }
    enum class PickupOutcome { AWAITING_VERIFICATION, VERIFIED, REJECTED }
    enum class TrackingOutcome { LIVE, CACHED, UNAVAILABLE }
    enum class RecoveryAction { RETRY, CONTACT_SUPPORT, RETURN_TO_SENDER, SUBMIT_POD }

    fun hasResolvedAddress(point: BookingAddressPoint?): Boolean {
        if (point == null || point.address.isBlank()) return false
        return point.latitude.isFinite() && point.longitude.isFinite() &&
            point.latitude in -90.0..90.0 && point.longitude in -180.0..180.0 &&
            !(point.latitude == 0.0 && point.longitude == 0.0)
    }

    fun quoteExpired(expiresAt: String?, now: Instant = Instant.now()): Boolean {
        if (expiresAt.isNullOrBlank()) return true
        return runCatching { !Instant.parse(expiresAt).isAfter(now) }.getOrDefault(true)
    }

    fun shouldSubmitCreate(isLoading: Boolean): Boolean = !isLoading

    fun paymentOutcome(paymentStatus: String, orderStatus: String): PaymentOutcome {
        val payment = paymentStatus.trim().lowercase()
        val order = orderStatus.trim().lowercase()
        if (payment in setOf("paid", "settled") && order in setOf("cancelled", "canceled", "failed", "payment_failed")) {
            return PaymentOutcome.LATE_CALLBACK_REVIEW
        }
        return when {
            payment in setOf("paid", "settled") -> PaymentOutcome.PAID
            payment in setOf("failed", "cancelled", "canceled", "payment_failed") -> PaymentOutcome.FAILED
            else -> PaymentOutcome.PENDING
        }
    }

    fun courierOutcome(orderStatus: String, hasAssignedCourier: Boolean): CourierOutcome {
        val status = orderStatus.trim().lowercase()
        return when {
            hasAssignedCourier || status in setOf("assigned", "accepted", "picked_up", "delivering") -> CourierOutcome.ASSIGNED
            status in setOf("searching", "pending_assignment", "dispatching", "offered", "matched") -> CourierOutcome.SEARCHING
            status == "no_courier_found" -> CourierOutcome.NO_SUPPLY_RETRYABLE
            else -> CourierOutcome.INVALID
        }
    }

    fun pickupOutcome(orderStatus: String, proofAccepted: Boolean): PickupOutcome {
        if (proofAccepted) return PickupOutcome.VERIFIED
        return if (orderStatus.trim().lowercase() in setOf("assigned", "accepted", "pickup_arrived", "picking_up")) {
            PickupOutcome.AWAITING_VERIFICATION
        } else {
            PickupOutcome.REJECTED
        }
    }

    fun trackingOutcome(networkAvailable: Boolean, cachedSnapshotAvailable: Boolean): TrackingOutcome = when {
        networkAvailable -> TrackingOutcome.LIVE
        cachedSnapshotAvailable -> TrackingOutcome.CACHED
        else -> TrackingOutcome.UNAVAILABLE
    }

    fun failedDeliveryActions(orderStatus: String): Set<RecoveryAction> = when (orderStatus.trim().lowercase()) {
        "failed_delivery" -> setOf(RecoveryAction.RETRY, RecoveryAction.CONTACT_SUPPORT, RecoveryAction.RETURN_TO_SENDER)
        "return_to_sender" -> setOf(RecoveryAction.CONTACT_SUPPORT, RecoveryAction.SUBMIT_POD)
        else -> emptySet()
    }
}
