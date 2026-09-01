package com.tembus.merchant.data.cache

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.tembus.merchant.data.model.MerchantOrder

/**
 * Encrypted last-known cache for the merchant's order history.
 * It is deliberately read-only while offline: mutations still require the
 * server so an offline merchant can never acknowledge an order accidentally.
 */
class MerchantOfflineCache(
    context: Context,
    private val userIdProvider: () -> String?
) {
    private val gson = Gson()
    private val preferences: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "merchant_offline_cache",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveOrders(orders: List<MerchantOrder>) {
        val key = ordersKey() ?: return
        preferences.edit().putString(key, gson.toJson(orders)).apply()
    }

    fun readOrders(): List<MerchantOrder> {
        val raw = preferences.getString(ordersKey() ?: return emptyList(), null) ?: return emptyList()
        return runCatching {
            gson.fromJson<List<MerchantOrder>>(
                raw,
                object : TypeToken<List<MerchantOrder>>() {}.type
            ).orEmpty()
        }.getOrDefault(emptyList())
    }

    private fun ordersKey(): String? = userIdProvider()?.takeIf { it.isNotBlank() }?.let { "orders_$it" }
}
