package com.tembus.customer.ui.screens.main

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TembusUniversalSearchTest {
    @Test
    fun `service intent search routes to safe service destination`() {
        assertEquals(listOf("food_delivery"), resolveTembusSearchIntents("makanan").map { it.code })
        assertEquals(listOf("tambal_ban"), resolveTembusSearchIntents("ban bocor").map { it.code })
        assertEquals(listOf("towing"), resolveTembusSearchIntents("derek").map { it.code })
    }

    @Test
    fun `unknown or blank query never creates an arbitrary deep link`() {
        assertEquals(5, resolveTembusSearchIntents("").size)
        assertTrue(resolveTembusSearchIntents("layanan yang tidak ada").isEmpty())
    }
}
