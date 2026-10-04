package com.tembus.merchant.data.model

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MerchantOperatingStateContractTest {

    @Test
    fun profileKeepsCanonicalOperatingStateAlongsideLegacyOpenFlag() {
        val merchant = Gson().fromJson(
            """
            {
              "is_open": true,
              "operating_state": "busy",
              "operating_state_reason": "merchant_busy",
              "operating_state_until": "2026-10-04T16:30:00Z",
              "operating_state_version": 7
            }
            """.trimIndent(),
            Merchant::class.java,
        )

        assertTrue(merchant.isOpen)
        assertEquals("busy", merchant.operatingState)
        assertEquals("merchant_busy", merchant.operatingStateReason)
        assertEquals("2026-10-04T16:30:00Z", merchant.operatingStateUntil)
        assertEquals(7L, merchant.operatingStateVersion)
    }
}
