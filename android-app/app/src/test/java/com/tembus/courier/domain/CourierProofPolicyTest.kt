package com.tembus.courier.domain

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CourierProofPolicyTest {
    @Test
    fun `contactless delivery uses dropoff photo without recipient signature`() {
        assertFalse(requiresRecipientSignature(contactless = true, isPickupProof = false))
    }

    @Test
    fun `normal delivery keeps recipient signature requirement`() {
        assertTrue(requiresRecipientSignature(contactless = false, isPickupProof = false))
    }

    @Test
    fun `pickup proof never asks for recipient signature`() {
        assertFalse(requiresRecipientSignature(contactless = false, isPickupProof = true))
    }
}
