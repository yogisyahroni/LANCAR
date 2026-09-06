package com.tembus.customer.ui.screens.detail

import com.tembus.customer.data.model.ServiceAdjustment
import com.tembus.customer.data.model.ServiceAdjustmentItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServiceAdjustmentSectionTest {

    @Test
    fun `pending adjustment is selected for explicit customer consent`() {
        val approved = adjustment(id = "approved-1", status = "approved")
        val pending = adjustment(id = "pending-1", status = "pending")

        assertEquals("pending-1", pendingServiceAdjustment(listOf(approved, pending))?.id)
    }

    @Test
    fun `no consent card is returned after all adjustments are decided`() {
        assertNull(
            pendingServiceAdjustment(
                listOf(
                    adjustment(id = "approved-1", status = "approved"),
                    adjustment(id = "rejected-1", status = "rejected")
                )
            )
        )
    }

    @Test
    fun `pending status matching is case insensitive`() {
        assertEquals(
            "pending-1",
            pendingServiceAdjustment(listOf(adjustment(id = "pending-1", status = "PENDING")))?.id
        )
    }

    private fun adjustment(id: String, status: String) = ServiceAdjustment(
        id = id,
        orderId = "order-1",
        reason = "Material tambahan setelah inspeksi",
        items = listOf(
            ServiceAdjustmentItem(
                code = "material_1_patch_kit",
                label = "Patch kit",
                type = "material",
                quantity = 1,
                unitPriceIdr = 20_000,
                totalIdr = 20_000
            )
        ),
        initialQuoteId = "quote-1",
        originalTotalIdr = 50_000,
        deltaIdr = 20_000,
        proposedTotalIdr = 70_000,
        status = status,
        financialState = if (status.equals("approved", ignoreCase = true)) "pending_collection" else "not_due"
    )
}
