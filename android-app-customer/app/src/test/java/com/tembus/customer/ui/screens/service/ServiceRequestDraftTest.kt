package com.tembus.customer.ui.screens.service

import androidx.lifecycle.SavedStateHandle
import org.junit.Assert.assertEquals
import org.junit.Test

class ServiceRequestDraftTest {
    @Test
    fun `request draft survives navigation handoff`() {
        val handle = SavedStateHandle()

        stageServiceRequestDraft(
            handle = handle,
            damageType = "Ban Bocor Kena Paku / Benda Tajam; Ban Kempis / Kurang Angin",
            notes = "Ban depan kiri terkena paku",
        )

        assertEquals(
            ServiceRequestDraft(
                damageType = "Ban Bocor Kena Paku / Benda Tajam; Ban Kempis / Kurang Angin",
                notes = "Ban depan kiri terkena paku",
            ),
            restoreServiceRequestDraft(handle),
        )
    }

    @Test
    fun `missing request draft restores empty values`() {
        assertEquals(ServiceRequestDraft(), restoreServiceRequestDraft(SavedStateHandle()))
        assertEquals(ServiceRequestDraft(), restoreServiceRequestDraft(null))
    }
}
