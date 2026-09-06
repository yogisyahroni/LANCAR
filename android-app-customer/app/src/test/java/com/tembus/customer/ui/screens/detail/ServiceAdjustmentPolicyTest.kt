package com.tembus.customer.ui.screens.detail

import com.tembus.customer.data.model.ServiceAdjustment
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServiceAdjustmentPolicyTest {

    private fun adjustment(id: String, status: String) = ServiceAdjustment(
        id = id,
        orderId = "order-1",
        reason = "Tambahan material hasil inspeksi",
        status = status
    )

    @Test
    fun `pending adjustment is selected for explicit customer consent`() {
        val result = pendingServiceAdjustment(
            listOf(
                adjustment("approved-old", "approved"),
                adjustment("pending-now", "pending"),
                adjustment("rejected-old", "rejected")
            )
        )

        assertEquals("pending-now", result?.id)
    }

    @Test
    fun `decided adjustments do not request consent again`() {
        val result = pendingServiceAdjustment(
            listOf(
                adjustment("approved-old", "approved"),
                adjustment("rejected-old", "rejected")
            )
        )

        assertNull(result)
    }
}
