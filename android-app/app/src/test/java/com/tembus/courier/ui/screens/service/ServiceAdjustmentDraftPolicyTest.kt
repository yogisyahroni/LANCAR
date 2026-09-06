package com.tembus.courier.ui.screens.service

import com.tembus.courier.data.model.ServiceAdjustmentItem
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ServiceAdjustmentDraftPolicyTest {

    private fun item(quantity: Long = 1, unitPrice: Long = 25_000) = ServiceAdjustmentItem(
        code = "material_1_patch",
        label = "Patch kit tambahan",
        type = "material",
        quantity = quantity,
        unitPriceIdr = unitPrice,
        totalIdr = quantity * unitPrice
    )

    @Test
    fun `valid structured adjustment can be submitted`() {
        assertTrue(
            isValidServiceAdjustmentDraft(
                reason = "Butuh patch tambahan setelah inspeksi",
                items = listOf(item())
            )
        )
    }

    @Test
    fun `empty reason and zero value are rejected`() {
        assertFalse(isValidServiceAdjustmentDraft("", listOf(item())))
        assertFalse(
            isValidServiceAdjustmentDraft(
                "Butuh material tambahan",
                listOf(item(unitPrice = 0))
            )
        )
    }

    @Test
    fun `draft above server safety cap is rejected`() {
        assertFalse(
            isValidServiceAdjustmentDraft(
                "Pekerjaan tambahan sangat besar",
                listOf(item(quantity = 2, unitPrice = 5_000_001))
            )
        )
    }
}
