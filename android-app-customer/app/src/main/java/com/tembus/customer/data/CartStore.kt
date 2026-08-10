package com.tembus.customer.data

import com.tembus.customer.data.model.CartItem
import com.tembus.customer.data.model.FoodMenuItem
import com.tembus.customer.data.model.FoodOrderItemVariantRequest
import com.tembus.customer.data.model.ReorderItem
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * FB-084 REORDER: shared cart state (in-memory, @Singleton).
 *
 * Sebelumnya cart food disimpan di dalam FoodViewModel (`hiltViewModel()` di tiap
 * screen) — karena Navigation Compose memberi ViewModelStore terpisah per
 * backstack entry, cart HILANG saat pindah FoodHome → FoodCart → Checkout.
 * Dengan CartStore singleton, semua screen (termasuk OrderHistory untuk
 * "Pesan Lagi") membaca/menulis keranjang yang sama.
 *
 * FB-102: cart divalidasi satu merchant — menambah item dari merchant lain
 * ditolak (return Conflict) supaya checkout tidak campur 2 toko.
 */
@Singleton
class CartStore @Inject constructor() {

    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart.asStateFlow()

    private val _cartSize = MutableStateFlow(0)
    val cartSize: StateFlow<Int> = _cartSize.asStateFlow()

    private val _cartTotal = MutableStateFlow(0L)
    val cartTotal: StateFlow<Long> = _cartTotal.asStateFlow()

    // FB-102: nama merchant pemilik isi cart saat ini (null = cart kosong /
    // berasal dari reorder yang tidak menyimpan nama merchant).
    private val _cartMerchantName = MutableStateFlow<String?>(null)
    val cartMerchantName: StateFlow<String?> = _cartMerchantName.asStateFlow()

    init {
        // Keep derived flows in sync with the cart whenever it changes.
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Default).launch {
            _cart.collect { list ->
                _cartSize.value = list.sumOf { it.quantity }
                _cartTotal.value = list.sumOf { it.subtotal }
                if (list.isEmpty()) _cartMerchantName.value = null
            }
        }
    }

    /**
     * FB-102: hasil tambah ke cart. [Added] sukses; [Conflict] ditolak karena
     * cart sudah berisi item dari merchant lain (name = nama merchant lama).
     */
    sealed interface AddToCartResult {
        data object Added : AddToCartResult
        data class Conflict(val otherMerchantName: String?) : AddToCartResult
    }

    fun addToCart(
        item: FoodMenuItem,
        notes: String = "",
        merchantName: String? = null,
        // FB-108: pilihan varian (opsi per grup) + label untuk ditampilkan.
        selectedVariants: List<FoodOrderItemVariantRequest> = emptyList(),
        variantLabels: List<String> = emptyList()
    ): AddToCartResult {
        val currentMerchantId = _cart.value.firstOrNull()?.menuItem?.merchantId
        if (currentMerchantId != null && currentMerchantId != item.merchantId) {
            // Cart berisi merchant lain — tolak, biarkan UI konfirmasi dulu.
            return AddToCartResult.Conflict(_cartMerchantName.value)
        }
        _cart.update { current ->
            // FB-108: entri berbeda per kombinasi varian — Nasi Goreng (level 1)
            // dan Nasi Goreng (level 3) adalah 2 baris cart terpisah.
            val existing = current.find {
                it.menuItem.id == item.id && it.selectedVariants == selectedVariants
            }
            if (existing != null) {
                current.map {
                    if (it.menuItem.id == item.id && it.selectedVariants == selectedVariants) {
                        it.copy(quantity = it.quantity + 1)
                    } else it
                }
            } else {
                current + CartItem(
                    menuItem = item,
                    quantity = 1,
                    notes = notes,
                    selectedVariants = selectedVariants,
                    variantLabels = variantLabels
                )
            }
        }
        if (merchantName != null && _cartMerchantName.value == null) {
            _cartMerchantName.value = merchantName
        }
        return AddToCartResult.Added
    }

    // FB-108: increment/decrement per KOMBINASI varian — cart bisa punya
    // 2 baris item yang sama dengan pilihan berbeda.
    fun incrementItem(itemId: String, variants: List<FoodOrderItemVariantRequest> = emptyList()) {
        _cart.update { current ->
            current.map {
                if (it.menuItem.id == itemId && it.selectedVariants == variants) {
                    it.copy(quantity = it.quantity + 1)
                } else it
            }
        }
    }

    fun decrementItem(itemId: String, variants: List<FoodOrderItemVariantRequest> = emptyList()) {
        _cart.update { current ->
            current.map {
                if (it.menuItem.id == itemId && it.selectedVariants == variants) {
                    if (it.quantity <= 1) it.copy(quantity = 0) else it.copy(quantity = it.quantity - 1)
                } else it
            }.filter { it.quantity > 0 }
        }
    }

    fun updateNotes(itemId: String, notes: String) {
        _cart.update { current ->
            current.map { if (it.menuItem.id == itemId) it.copy(notes = notes) else it }
        }
    }

    /** FB-084: isi ulang keranjang dari order lama (reorder). Mengganti isi cart. */
    fun setItems(items: List<CartItem>) {
        _cart.value = items
    }

    /**
     * FB-084: prefill cart dari hasil CheckReorder backend. Hanya item yang
     * masih available yang dimasukkan; item tidak tersedia dilewati (tetap
     * ditampilkan di dialog reorder sebagai info, tapi tidak di-checkout).
     */
    fun prefillFromReorder(reorderItems: List<ReorderItem>) {
        _cart.value = reorderItems.filter { it.available && it.quantity > 0 }.map { item ->
            CartItem(
                menuItem = FoodMenuItem(
                    id = item.menuItemId,
                    name = item.itemName,
                    price = item.newPrice
                ),
                quantity = item.quantity,
                notes = item.notes
            )
        }
    }

    fun clearCart() {
        _cart.value = emptyList()
    }
}
