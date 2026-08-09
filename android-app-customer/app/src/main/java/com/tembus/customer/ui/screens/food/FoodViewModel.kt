package com.tembus.customer.ui.screens.food

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.CartStore
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.CartItem
import com.tembus.customer.data.model.CreateFoodOrderRequest
import com.tembus.customer.data.model.CustomerAddress
import com.tembus.customer.data.model.FoodMenuItem
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.data.model.FoodOrderCreateResponse
import com.tembus.customer.data.model.VoucherValidateRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Response
import javax.inject.Inject

// FOOD-BIKE-055/056/057/075: state browse + cart + checkout food delivery.
// FB-084: cart dipindah ke CartStore @Singleton supaya persist antar screen
// (Navigation Compose memberi ViewModelStore terpisah per backstack entry).
@HiltViewModel
class FoodViewModel @Inject constructor(
    private val apiService: TEMBUSApiService,
    private val cartStore: CartStore
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

    // ── Cart state (FB-084: shared via CartStore @Singleton) ──
    val cart: StateFlow<List<CartItem>> = cartStore.cart
    val cartSize: StateFlow<Int> = cartStore.cartSize
    val cartTotal: StateFlow<Long> = cartStore.cartTotal

    // ── Checkout result ──
    private val _checkoutResult = MutableStateFlow<FoodOrderCreateResponse?>(null)
    val checkoutResult: StateFlow<FoodOrderCreateResponse?> = _checkoutResult.asStateFlow()

    // ── FB-078: Voucher redeem ──
    private val _voucherState = MutableStateFlow<VoucherState>(VoucherState.Idle)
    val voucherState: StateFlow<VoucherState> = _voucherState.asStateFlow()

    // Lokasi user terakhir — dipakai default dropoff saat checkout
    private val _userLat = MutableStateFlow(-6.2088)
    val userLat: StateFlow<Double> = _userLat.asStateFlow()
    private val _userLng = MutableStateFlow(106.8456)
    val userLng: StateFlow<Double> = _userLng.asStateFlow()

    // ── FB-090: Saved addresses — reuse alamat favorit customer di checkout food ──
    private val _addressBook = MutableStateFlow<List<CustomerAddress>>(emptyList())
    val addressBook: StateFlow<List<CustomerAddress>> = _addressBook.asStateFlow()

    fun loadSavedAddresses() {
        viewModelScope.launch {
            try {
                val res = apiService.getCustomerAddresses(kind = "receiver")
                if (res.isSuccessful) {
                    _addressBook.value = res.body()?.data ?: emptyList()
                }
            } catch (_: Exception) {
                // Non-fatal — user tetap bisa isi alamat manual
            }
        }
    }

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

    // ── Cart operations (FB-084: delegasi ke CartStore) ──

    // FB-102: item yang ditolak karena cart berisi merchant lain (null = tidak
    // ada konflik). UI menampilkan dialog konfirmasi sebelum clear cart.
    data class CartConflictRequest(
        val item: FoodMenuItem,
        val notes: String,
        val otherMerchantName: String?,
        val newMerchantName: String?
    )

    private val _conflictRequest = MutableStateFlow<CartConflictRequest?>(null)
    val conflictRequest: StateFlow<CartConflictRequest?> = _conflictRequest.asStateFlow()

    fun addToCart(item: FoodMenuItem, notes: String = "", merchantName: String? = null) {
        when (val result = cartStore.addToCart(item, notes, merchantName)) {
            is CartStore.AddToCartResult.Conflict -> {
                _conflictRequest.value = CartConflictRequest(
                    item = item,
                    notes = notes,
                    otherMerchantName = result.otherMerchantName,
                    newMerchantName = merchantName
                )
            }
            CartStore.AddToCartResult.Added -> Unit
        }
    }

    /**
     * FB-102: hasil keputusan dialog konflik merchant. proceed=true → cart lama
     * di-clear lalu item baru ditambahkan; false → batal, cart tetap utuh.
     */
    fun resolveConflict(proceed: Boolean) {
        val request = _conflictRequest.value ?: return
        _conflictRequest.value = null
        if (proceed) {
            cartStore.clearCart()
            cartStore.addToCart(request.item, request.notes, request.newMerchantName)
        }
    }

    fun incrementItem(itemId: String) = cartStore.incrementItem(itemId)

    fun decrementItem(itemId: String) = cartStore.decrementItem(itemId)

    fun updateNotes(itemId: String, notes: String) = cartStore.updateNotes(itemId, notes)

    fun clearCart() = cartStore.clearCart()

    fun checkout(
        merchantId: String,
        dropoffAddress: String,
        dropoffLat: Double,
        dropoffLng: Double,
        receiverName: String?,
        receiverPhone: String?,
        voucherCode: String? = null,
        onResult: (Result<FoodOrderCreateResponse>) -> Unit
    ) {
        val items = cartStore.cart.value.filter { it.quantity > 0 }
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
                    receiverPhone = receiverPhone,
                    voucherCode = voucherCode?.ifBlank { null }
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

    // ── FB-078: validasi kode voucher (preview sebelum submit) ──
    fun validateVoucher(code: String, baseIdr: Long) {
        val trimmed = code.trim()
        if (trimmed.isEmpty()) {
            _voucherState.value = VoucherState.Idle
            return
        }
        viewModelScope.launch {
            _voucherState.value = VoucherState.Loading
            try {
                val res = apiService.validateVoucher(
                    VoucherValidateRequest(code = trimmed, baseIdr = baseIdr, model = "p2p")
                )
                val body = res.body()
                if (res.isSuccessful && body != null && body.valid) {
                    _voucherState.value = VoucherState.Applied(
                        code = body.code,
                        name = body.name,
                        discountIdr = body.discountIdr
                    )
                } else {
                    _voucherState.value = VoucherState.Error(
                        body?.error ?: "Kode voucher tidak valid (${res.code()})"
                    )
                }
            } catch (e: Exception) {
                _voucherState.value = VoucherState.Error(e.localizedMessage ?: "Gagal validasi voucher")
            }
        }
    }

    fun clearVoucher() {
        _voucherState.value = VoucherState.Idle
    }
}

/** FB-078: state voucher di checkout food. */
sealed class VoucherState {
    object Idle : VoucherState()
    object Loading : VoucherState()
    data class Applied(val code: String, val name: String, val discountIdr: Long) : VoucherState()
    data class Error(val message: String) : VoucherState()
}
