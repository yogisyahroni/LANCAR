package com.tembus.courier.domain

import com.tembus.courier.data.db.Converters
import com.tembus.courier.data.db.OrderDatabase
import com.tembus.courier.data.model.CourierOrderPackage
import com.tembus.courier.data.model.Order
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CourierPackageContractTest {

    @Test
    fun `package proof helpers follow pickup scan photo and POD states`() {
        val scannedPackage = CourierOrderPackage(
            packageId = "package-1",
            packageCode = "PKG-001",
            status = "pickup_scanned"
        )
        val verifiedPackage = CourierOrderPackage(
            packageId = "package-2",
            packageCode = "PKG-002",
            status = "pickup_verified"
        )
        val deliveredPackage = CourierOrderPackage(
            packageId = "package-3",
            packageCode = "PKG-003",
            status = "delivered"
        )

        assertTrue(scannedPackage.pickupScanDone())
        assertFalse(scannedPackage.pickupPhotoDone())
        assertFalse(scannedPackage.podDone())
        assertTrue(verifiedPackage.pickupScanDone())
        assertTrue(verifiedPackage.pickupPhotoDone())
        assertFalse(verifiedPackage.podDone())
        assertTrue(deliveredPackage.pickupScanDone())
        assertTrue(deliveredPackage.pickupPhotoDone())
        assertTrue(deliveredPackage.podDone())
    }

    @Test
    fun `order carries admin-controlled courier service policies`() {
        val order = Order(
            orderId = "TMB-OD-001",
            status = "accepted",
            workflowRole = "on_demand",
            packageCount = 3,
            packages = listOf(
                CourierOrderPackage(packageId = "package-1", packageCode = "PKG-001", status = "pending"),
                CourierOrderPackage(packageId = "package-2", packageCode = "PKG-002", status = "pending"),
                CourierOrderPackage(packageId = "package-3", packageCode = "PKG-003", status = "pending")
            ),
            serviceMaxPackagesPerOrder = 4,
            serviceMaxActiveOrdersOnDemand = 2,
            serviceFaceVerificationRequired = true,
            serviceProofGeofenceRadiusM = 10,
            serviceProofMinAccuracyM = 30,
            serviceFailedDeliveryPolicy = "must_deliver"
        )

        assertEquals(3, order.packageCount)
        assertEquals(3, order.packages.size)
        assertEquals(4, order.serviceMaxPackagesPerOrder)
        assertEquals(2, order.serviceMaxActiveOrdersOnDemand)
        assertTrue(order.serviceFaceVerificationRequired)
        assertEquals(10, order.serviceProofGeofenceRadiusM)
        assertEquals(30, order.serviceProofMinAccuracyM)
        assertEquals("must_deliver", order.serviceFailedDeliveryPolicy)
    }

    @Test
    fun `room converter round trips multi package payloads`() {
        val converters = Converters()
        val packages = listOf(
            CourierOrderPackage(
                packageId = "package-1",
                packageCode = "PKG-001",
                description = "Dokumen",
                sizeTier = "small",
                weightKg = 2.0,
                status = "pickup_verified",
                pickupScanVerifiedAt = "2026-06-03T10:00:00Z",
                pickupPhotoVerifiedAt = "2026-06-03T10:01:00Z"
            ),
            CourierOrderPackage(
                packageId = "package-2",
                packageCode = "PKG-002",
                description = "Paket fragile",
                sizeTier = "medium",
                weightKg = 6.5,
                status = "pending"
            )
        )

        val encoded = converters.packagesToString(packages)
        val decoded = converters.stringToPackages(encoded)

        assertEquals(2, decoded.size)
        assertEquals("PKG-001", decoded[0].displayCode())
        assertEquals("pickup_verified", decoded[0].status)
        assertTrue(decoded[0].pickupPhotoDone())
        assertEquals("PKG-002", decoded[1].displayCode())
        assertEquals("medium", decoded[1].sizeTier)
        assertFalse(decoded[1].pickupScanDone())
    }

    @Test
    fun `database migration registry covers legacy direct upgrade paths to version 13`() {
        val paths = OrderDatabase.ALL_MIGRATIONS.map { it.startVersion to it.endVersion }.toSet()

        assertTrue(paths.contains(10 to 11))
        assertTrue(paths.contains(11 to 12))
        assertTrue(paths.contains(12 to 13))
        assertTrue(paths.contains(10 to 13))
        assertTrue(paths.contains(11 to 13))
    }
}
