package com.tembus.customer.ui.screens.food

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.CartItem
import com.tembus.customer.data.model.CreateFoodOrderRequest
import com.tembus.customer.data.model.FoodMenuItem
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.data.model.FoodOrderCreateResponse
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.Response
import javax.inject.Inject

// FOOD-BIKE-055/056/057/075: state browse + cart + checkout food delivery
@HiltViewModel
class FoodViewModel @Inject constructor(
    private val apiService: TEMBUSApiService
) : ViewModel() {

    // ── Browse state ──
    private val _merchants = MutableStateFlow<List<FoodMerchant>>(emptyList())
    val merchants: StateFlow<List<FoodMerchant>> = _merchants.asStateFlow()

    private val _merchantDetail = MutableStateFlow<FoodMerchant?>(null)
    val merchantDetail: StateFlow<FoodMerchant?> = _merchantDetail.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    // ── Cart state (in-memory) ──
    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart.asStateFlow()

    val cartSize: StateFlow<Int> = MutableStateFlow(0).also { size ->
        viewModelScope.launch {
            _cart.collect { list -> size.value = list.sumOf { it.quantity } }
        }
    }
    val cartTotal: StateFlow<Long> = MutableStateFlow(0L).also { total ->
        viewModelScope.launch {
            _cart.collect { list -> total.value = list.sumOf { it.subtotal } }
        }
    }

    // ── Checkout result ──
    private val _checkoutResult = MutableStateFlow<FoodOrderCreateResponse?>(null)
    val checkoutResult: StateFlow<FoodOrderCreateResponse?> = _checkoutResult.asStateFlow()

    // Lokasi user terakhir — dipakai default dropoff saat checkout
    private val _userLat = MutableStateFlow(-6.2088)
    val userLat: StateFlow<Double> = _userLat.asStateFlow()
    private val _userLng = MutableStateFlow(106.8456)
    val userLng: StateFlow<Double> = _userLng.asStateFlow()

    fun loadMerchants(lat: Double, lng: Double, search: String = "") {
        _userLat.value = lat
        _userLng.value = lng
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                val res = apiService.listFoodMerchants(lat, lng, search.ifBlank { null })
                if (res.isSuccessful) {
                    _merchants.value = res.body()?.merchants ?: emptyList()
                } else {
                    _error.value = "Gagal memuat merchant (${res.code()})"
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Gagal memuat merchant"
            } finally {
                _loading.value = false
            }
        }
    }

    fun loadMerchantDetail(merchantId: String) {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                val res = apiService.getFoodMerchantDetail(merchantId)
                if (res.isSuccessful) {
                    _merchantDetail.value = res.body()?.merchant
                } else {
                    _error.value = "Gagal memuat detail (${res.code()})"
                }
            } catch (e: Exception) {
                _error.value = e.message ?: "Gagal memuat detail"
            } finally {
                _loading.value = false
            }
        }
    }

    // ── Cart operations ──
    fun addToCart(item: FoodMenuItem, notes: String = "") {
        _cart.update { current ->
            val existing = current.find { it.menuItem.id == item.id }
            if (existing != null) {
                current.map { if (it.menuItem.id == item.id) it.copy(quantity = it.quantity + 1) else it }
            } else {
                current + CartItem(menuItem = item, quantity = 1, notes = notes)
            }
        }
    }

    fun incrementItem(itemId: String) {
        _cart.update { current ->
            current.map { if (it.menuItem.id == itemId) it.copy(quantity = it.quantity + 1) else it }
        }
    }

    fun decrementItem(itemId: String) {
        _cart.update { current ->
            current.map {
                if (it.menuItem.id == itemId) {
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

    fun clearCart() {
        _cart.value = emptyList()
    }

    fun checkout(
        merchantId: String,
        dropoffAddress: String,
        dropoffLat: Double,
        dropoffLng: Double,
        receiverName: String?,
        receiverPhone: String?,
        onResult: (Result<FoodOrderCreateResponse>) -> Unit
    ) {
        val items = _cart.value.filter { it.quantity > 0 }
        if (items.isEmpty()) {
            onResult(Result.failure(Exception("Keranjang kosong")))
            return
        }
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                val request = CreateFoodOrderRequest(
                    merchantId = merchantId,
                    items = items.map {
                        com.tembus.customer.data.model.FoodOrderItemRequest(
                            menuItemId = it.menuItem.id,
                            quantity = it.quantity,
                            notes = it.notes.ifBlank { null }
                        )
                    },
                    dropoffAddress = dropoffAddress,
                    dropoffLat = dropoffLat,
                    dropoffLng = dropoffLng,
                    receiverName = receiverName,
                    receiverPhone = receiverPhone
                )
                val res: Response<FoodOrderCreateResponse> = apiService.createFoodOrder(request)
                if (res.isSuccessful && res.body() != null) {
                    _checkoutResult.value = res.body()
                    onResult(Result.success(res.body()!!))
                } else {
                    onResult(Result.failure(Exception("Gagal membuat order food (${res.code()})")))
                }
            } catch (e: Exception) {
                onResult(Result.failure(e))
            } finally {
                _loading.value = false
            }
        }
    }
}
