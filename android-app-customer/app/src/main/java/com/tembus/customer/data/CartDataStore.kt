package com.tembus.customer.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.tembus.customer.data.model.CartItem
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.cartDataStore by preferencesDataStore(name = "food_cart")

/**
 * C6: Cart persistence — simpan cart food ke DataStore Preferences (JSON),
 * sehingga keranjang tidak hilang saat app di-kill / proses di-recycle.
 *
 * Cart disimpan per kombinasi (item + varian) sebagai daftar [CartItem]
 * yang diserialisasi dengan kotlinx.serialization. Restore dilakukan saat
 * [CartStore] init; save dilakukan setiap kali cart berubah.
 */
@Singleton
class CartDataStore @Inject constructor(private val context: Context) {

    private val cartKey = stringPreferencesKey("cart_json")
    private val merchantNameKey = stringPreferencesKey("cart_merchant_name")

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val cartSerializer = ListSerializer(CartItem.serializer())

    suspend fun loadCart(): Pair<List<CartItem>, String?> {
        return try {
            context.cartDataStore.data.map { prefs ->
                val raw = prefs[cartKey] ?: return@map emptyList<CartItem>() to null
                val items = json.decodeFromString(cartSerializer, raw)
                items to prefs[merchantNameKey]
            }.first()
        } catch (e: Exception) {
            emptyList<CartItem>() to null
        }
    }

    suspend fun saveCart(items: List<CartItem>, merchantName: String?) {
        try {
            context.cartDataStore.edit { prefs ->
                if (items.isEmpty()) {
                    prefs.remove(cartKey)
                    prefs.remove(merchantNameKey)
                } else {
                    prefs[cartKey] = json.encodeToString(cartSerializer, items)
                    if (merchantName != null) {
                        prefs[merchantNameKey] = merchantName
                    }
                }
            }
        } catch (e: Exception) {
            // DataStore gagal menulis — cart tetap hidup di memori, abaikan.
        }
    }
}
