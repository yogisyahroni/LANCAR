package com.tembus.customer.data.api

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NetworkReliabilityPolicyTest {
    @Test
    fun `only safe reads are eligible for transparent retry`() {
        assertTrue(NetworkReliabilityPolicy.isSafeRead("GET"))
        assertTrue(NetworkReliabilityPolicy.isSafeRead("HEAD"))
        assertFalse(NetworkReliabilityPolicy.isSafeRead("POST"))
        assertFalse(NetworkReliabilityPolicy.isSafeRead("PATCH"))
    }

    @Test
    fun `mutation retry requires server idempotency and replay safety`() {
        assertTrue(NetworkReliabilityPolicy.canRetryMutation("order-key-1", replaySafe = true))
        assertFalse(NetworkReliabilityPolicy.canRetryMutation(null, replaySafe = true))
        assertFalse(NetworkReliabilityPolicy.canRetryMutation("order-key-1", replaySafe = false))
    }

    @Test
    fun `cancellation is never retried`() {
        assertTrue(NetworkReliabilityPolicy.shouldRetrySafeRead("GET", attempt = 0, callCanceled = false))
        assertFalse(NetworkReliabilityPolicy.shouldRetrySafeRead("GET", attempt = 0, callCanceled = true))
        assertFalse(NetworkReliabilityPolicy.shouldRetrySafeRead("POST", attempt = 0, callCanceled = false))
    }
}
