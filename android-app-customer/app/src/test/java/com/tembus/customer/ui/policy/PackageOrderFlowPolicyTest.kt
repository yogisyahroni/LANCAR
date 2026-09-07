package com.tembus.customer.ui.policy

import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.ui.screens.booking.BookingAddressPoint
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PackageOrderFlowPolicyTest {
    private val now = Instant.parse("2026-09-07T10:00:00Z")
    private val address = BookingAddressPoint(
        id = "saved-1",
        label = "Rumah",
        address = "Jl. Paket 1",
        latitude = -6.2,
        longitude = 106.8,
        source = BookingAddressPoint.Source.SAVED
    )

    @Test
    fun addressVariantsRequireResolvedNonZeroCoordinates() {
        assertTrue(PackageOrderFlowPolicy.hasResolvedAddress(address))
        assertFalse(PackageOrderFlowPolicy.hasResolvedAddress(address.copy(address = "")))
        assertFalse(PackageOrderFlowPolicy.hasResolvedAddress(address.copy(latitude = 0.0, longitude = 0.0)))
        assertFalse(PackageOrderFlowPolicy.hasResolvedAddress(null))
        assertEquals(LatLng(-6.2, 106.8), address.asLatLng())
    }

    @Test
    fun expiredQuoteMustBeRecalculatedBeforeCreate() {
        assertFalse(PackageOrderFlowPolicy.quoteExpired("2026-09-07T10:01:00Z", now))
        assertTrue(PackageOrderFlowPolicy.quoteExpired("2026-09-07T10:00:00Z", now))
        assertTrue(PackageOrderFlowPolicy.quoteExpired(null, now))
    }

    @Test
    fun duplicateCreateIsBlockedWhileRequestIsInFlight() {
        assertTrue(PackageOrderFlowPolicy.shouldSubmitCreate(false))
        assertFalse(PackageOrderFlowPolicy.shouldSubmitCreate(true))
    }

    @Test
    fun paymentFailureAndLateCallbackNeverLookLikeSuccess() {
        assertEquals(PackageOrderFlowPolicy.PaymentOutcome.PAID, PackageOrderFlowPolicy.paymentOutcome("paid", "searching"))
        assertEquals(PackageOrderFlowPolicy.PaymentOutcome.FAILED, PackageOrderFlowPolicy.paymentOutcome("failed", "pending_payment"))
        assertEquals(
            PackageOrderFlowPolicy.PaymentOutcome.LATE_CALLBACK_REVIEW,
            PackageOrderFlowPolicy.paymentOutcome("paid", "cancelled")
        )
    }

    @Test
    fun courierRaceAndNoSupplyExposeSafeRecoveryState() {
        assertEquals(PackageOrderFlowPolicy.CourierOutcome.SEARCHING, PackageOrderFlowPolicy.courierOutcome("searching", false))
        assertEquals(PackageOrderFlowPolicy.CourierOutcome.ASSIGNED, PackageOrderFlowPolicy.courierOutcome("assigned", true))
        assertEquals(PackageOrderFlowPolicy.CourierOutcome.NO_SUPPLY_RETRYABLE, PackageOrderFlowPolicy.courierOutcome("no_courier_found", false))
    }

    @Test
    fun pickupRequiresAcceptedServerProof() {
        assertEquals(PackageOrderFlowPolicy.PickupOutcome.AWAITING_VERIFICATION, PackageOrderFlowPolicy.pickupOutcome("pickup_arrived", false))
        assertEquals(PackageOrderFlowPolicy.PickupOutcome.VERIFIED, PackageOrderFlowPolicy.pickupOutcome("pickup_arrived", true))
        assertEquals(PackageOrderFlowPolicy.PickupOutcome.REJECTED, PackageOrderFlowPolicy.pickupOutcome("delivering", false))
    }

    @Test
    fun offlineTrackingUsesCachedSnapshotOnlyWhenAvailable() {
        assertEquals(PackageOrderFlowPolicy.TrackingOutcome.LIVE, PackageOrderFlowPolicy.trackingOutcome(true, false))
        assertEquals(PackageOrderFlowPolicy.TrackingOutcome.CACHED, PackageOrderFlowPolicy.trackingOutcome(false, true))
        assertEquals(PackageOrderFlowPolicy.TrackingOutcome.UNAVAILABLE, PackageOrderFlowPolicy.trackingOutcome(false, false))
    }

    @Test
    fun failedDeliveryOffersRetrySupportReturnAndPodRecovery() {
        assertEquals(
            setOf(
                PackageOrderFlowPolicy.RecoveryAction.RETRY,
                PackageOrderFlowPolicy.RecoveryAction.CONTACT_SUPPORT,
                PackageOrderFlowPolicy.RecoveryAction.RETURN_TO_SENDER
            ),
            PackageOrderFlowPolicy.failedDeliveryActions("failed_delivery")
        )
        assertEquals(
            setOf(PackageOrderFlowPolicy.RecoveryAction.CONTACT_SUPPORT, PackageOrderFlowPolicy.RecoveryAction.SUBMIT_POD),
            PackageOrderFlowPolicy.failedDeliveryActions("return_to_sender")
        )
    }
}
