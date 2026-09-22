package com.tembus.customer.ui.screens.food

import java.time.Instant

/** Pure rules for keeping the Food checkout honest when server state changes. */
object FoodCheckoutPolicy {
    fun isQuoteExpired(expiresAt: String, now: Instant = Instant.now()): Boolean {
        if (expiresAt.isBlank()) return true
        return runCatching { !Instant.parse(expiresAt).isAfter(now) }.getOrDefault(true)
    }

    fun quoteExpiryMessage(expiresAt: String, now: Instant = Instant.now()): String? =
        if (isQuoteExpired(expiresAt, now)) {
            "Harga dan ETA sudah kedaluwarsa. Hitung ulang sebelum melanjutkan."
        } else {
            null
        }
}
