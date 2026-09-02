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
import com.tembus.customer.data.model.FoodOrderItemVariantRequest
import com.tembus.customer.data.model.FavoriteMerchant
import com.tembus.customer.data.model.FavoriteActionResponse
import com.tembus.customer.data.model.FavoriteMerchantsResponse
import com.tembus.customer.data.model.FavoriteCheckResponse
import com.tembus.customer.data.model.MapsGeocodeResult
import com.tembus.customer.data.model.FoodQuoteResponse
import com.tembus.customer.data.model.VoucherValidateRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Response
import java.util.UUID
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

    // ── ADR 003: filter halal — "all" (default) | "halal_certified" | "non_halal" ──
    private val _halalFilter = MutableStateFlow("all")
    val halalFilter: StateFlow<String> = _halalFilter.asStateFlow()

    // ── Cart state (FB-084: shared via CartStore @Singleton) ──
    val cart: StateFlow<List<CartItem>> = cartStore.cart
    val cartSize: StateFlow<Int> = cartStore.cartSize
    val cartTotal: StateFlow<Long> = cartStore.cartTotal

    // ── Checkout result ──
    private val _checkoutResult = MutableStateFlow<FoodOrderCreateResponse?>(null)
    val checkoutResult: StateFlow<FoodOrderCreateResponse?> = _checkoutResult.asStateFlow()

    private val _foodQuote = MutableStateFlow<FoodQuoteResponse?>(null)
    val foodQuote: StateFlow<FoodQuoteResponse?> = _foodQuote.asStateFlow()
    private var foodCreateIdempotencyKey: String? = null

    // ── FB-078: Voucher redeem ──
    private val _voucherState = MutableStateFlow<VoucherState>(VoucherState.Idle)
    val voucherState: StateFlow<VoucherState> = _voucherState.asStateFlow()

    // Discovery location and checkout destination are separate contracts.
    // There is deliberately no geographic fallback here: checkout must use
    // a coordinate explicitly selected for the destination.
    private val _checkoutLat = MutableStateFlow<Double?>(null)
    val checkoutLat: StateFlow<Double?> = _checkoutLat.asStateFlow()
    private val _checkoutLng = MutableStateFlow<Double?>(null)
    val checkoutLng: StateFlow<Double?> = _checkoutLng.asStateFlow()
    private val _checkoutAddressResults = MutableStateFlow<List<MapsGeocodeResult>>(emptyList())
    val checkoutAddressResults: StateFlow<List<MapsGeocodeResult>> = _checkoutAddressResults.asStateFlow()
    private val _checkoutAddressSearchError = MutableStateFlow<String?>(null)
    val checkoutAddressSearchError: StateFlow<String?> = _checkoutAddressSearchError.asStateFlow()
    private val _checkoutAddressSearching = MutableStateFlow(false)
    val checkoutAddressSearching: StateFlow<Boolean> = _checkoutAddressSearching.asStateFlow()
    private var discoveryLat: Double? = null
    private var discoveryLng: Double? = null

    // ── FB-090: Saved addresses — reuse alamat favorit customer di checkout food ──
    private val _addressBook = MutableStateFlow<List<CustomerAddress>>(emptyList())
    val addressBook: StateFlow<List<CustomerAddress>> = _addressBook.asStateFlow()

    // ── FOOD-BIKE-070: Favorite Merchants (C3) ──
    private val _favoriteMerchants = MutableStateFlow<List<FavoriteMerchant>>(emptyList())
    val favoriteMerchants: StateFlow<List<FavoriteMerchant>> = _favoriteMerchants.asStateFlow()

    private val _favoritesLoading = MutableStateFlow(false)
    val favoritesLoading: StateFlow<Boolean> = _favoritesLoading.asStateFlow()

    private val _favoritesError = MutableStateFlow<String?>(null)
    val favoritesError: StateFlow<String?> = _favoritesError.asStateFlow()

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

    fun setCheckoutLocation(lat: Double, lng: Double) {
        if (lat !in -90.0..90.0 || lng !in -180.0..180.0 || (lat == 0.0 && lng == 0.0)) {
            clearCheckoutLocation()
            return
        }
        _checkoutLat.value = lat
        _checkoutLng.value = lng
        clearFoodQuote()
    }

    fun clearCheckoutLocation() {
        _checkoutLat.value = null
        _checkoutLng.value = null
        clearFoodQuote()
    }

    fun searchCheckoutAddress(query: String) {
        val normalized = query.trim()
        if (normalized.length < 3) {
            _checkoutAddressResults.value = emptyList()
            _checkoutAddressSearchError.value = "Ketik minimal 3 karakter untuk mencari titik alamat."
            return
        }
        viewModelScope.launch {
            _checkoutAddressSearching.value = true
            _checkoutAddressSearchError.value = null
            try {
                val res = apiService.geocodeAddress(normalized, "customer_mobile")
                if (res.isSuccessful) {
                    val results = res.body()?.results.orEmpty().filter {
                        it.latitude in -90.0..90.0 &&
                            it.longitude in -180.0..180.0 &&
                            !(it.latitude == 0.0 && it.longitude == 0.0)
                    }
                    _checkoutAddressResults.value = results
                    if (results.isEmpty()) _checkoutAddressSearchError.value = "Alamat tidak ditemukan."
                } else {
                    _checkoutAddressResults.value = emptyList()
                    _checkoutAddressSearchError.value = "Gagal mencari titik alamat (${res.code()})."
                }
            } catch (e: Exception) {
                _checkoutAddressResults.value = emptyList()
                _checkoutAddressSearchError.value = e.localizedMessage ?: "Gagal mencari titik alamat."
            } finally {
                _checkoutAddressSearching.value = false
            }
        }
    }

    fun selectCheckoutAddress(result: MapsGeocodeResult) {
        if (result.latitude !in -90.0..90.0 || result.longitude !in -180.0..180.0 ||
            (result.latitude == 0.0 && result.longitude == 0.0)
        ) {
            _checkoutAddressSearchError.value = "Hasil alamat tidak memiliki titik koordinat yang valid."
            return
        }
        setCheckoutLocation(result.latitude, result.longitude)
        _checkoutAddressResults.value = emptyList()
        _checkoutAddressSearchError.value = null
    }

    fun clearCheckoutAddressSearch() {
        _checkoutAddressResults.value = emptyList()
        _checkoutAddressSearchError.value = null
    }

    fun clearFoodQuote() {
        _foodQuote.value = null
        foodCreateIdempotencyKey = null
    }

    fun loadMerchants(lat: Double, lng: Double, search: String = "") {
        discoveryLat = lat
        discoveryLng = lng
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                // ADR 003: filter halal — null/all (semua) | halal_certified | non_halal
                val halal = _halalFilter.value.takeIf { it != "all" }
                val res = apiService.listFoodMerchants(lat, lng, search.ifBlank { null }, halal)
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

    /** ADR 003: set filter halal lalu reload daftar merchant. */
    fun setHalalFilter(filter: String) {
        if (_halalFilter.value == filter) return
        _halalFilter.value = filter
        // The browse screen owns its discovery coordinates and reloads them
        // explicitly; never reuse checkout destination state here.
        val lat = discoveryLat
        val lng = discoveryLng
        if (lat != null && lng != null) loadMerchants(lat, lng)
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
        val newMerchantName: String?,
        // FB-108: pilihan varian ikut disimpan untuk dipakai saat retry.
        val selectedVariants: List<FoodOrderItemVariantRequest> = emptyList(),
        val variantLabels: List<String> = emptyList()
    )

    private val _conflictRequest = MutableStateFlow<CartConflictRequest?>(null)
    val conflictRequest: StateFlow<CartConflictRequest?> = _conflictRequest.asStateFlow()

    fun addToCart(
        item: FoodMenuItem,
        notes: String = "",
        merchantName: String? = null,
        // FB-108: pilihan varian (opsi per grup) + label untuk ditampilkan.
        selectedVariants: List<FoodOrderItemVariantRequest> = emptyList(),
        variantLabels: List<String> = emptyList()
    ) {
        when (val result = cartStore.addToCart(item, notes, merchantName, selectedVariants, variantLabels)) {
            is CartStore.AddToCartResult.Conflict -> {
                _conflictRequest.value = CartConflictRequest(
                    item = item,
                    notes = notes,
                    otherMerchantName = result.otherMerchantName,
                    newMerchantName = merchantName,
                    selectedVariants = selectedVariants,
                    variantLabels = variantLabels
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
            cartStore.addToCart(
                request.item, request.notes, request.newMerchantName,
                request.selectedVariants, request.variantLabels
            )
        }
    }

    fun incrementItem(itemId: String, variants: List<FoodOrderItemVariantRequest> = emptyList()) =
        cartStore.incrementItem(itemId, variants)

    fun decrementItem(itemId: String, variants: List<FoodOrderItemVariantRequest> = emptyList()) =
        cartStore.decrementItem(itemId, variants)

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
        orderNotes: String? = null, // FB-121: catatan level order
        // FB-123: pesanan terjadwal — isScheduled + scheduledAt (ISO-8601).
        isScheduled: Boolean = false,
        scheduledAt: String? = null,
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
                val idempotencyKey = foodCreateIdempotencyKey
                    ?: UUID.randomUUID().toString().also { foodCreateIdempotencyKey = it }
                val request = CreateFoodOrderRequest(
                    merchantId = merchantId,
                    items = items.map {
                        com.tembus.customer.data.model.FoodOrderItemRequest(
                            menuItemId = it.menuItem.id,
                            quantity = it.quantity,
                            notes = it.notes.ifBlank { null },
                            // FB-108: kirim pilihan varian (kosong kalau item polos).
                            variants = it.selectedVariants
                        )
                    },
                    dropoffAddress = dropoffAddress,
                    dropoffLat = dropoffLat,
                    dropoffLng = dropoffLng,
                    receiverName = receiverName,
                    receiverPhone = receiverPhone,
                    voucherCode = voucherCode?.ifBlank { null },
                    orderNotes = orderNotes?.ifBlank { null },
                    quoteId = _foodQuote.value?.quoteId,
                    quoteInputFingerprint = _foodQuote.value?.inputFingerprint,
                    // FB-123: kalau jadwalkan, kirim flag + waktu ISO-8601.
                    isScheduled = isScheduled,
                    scheduledAt = if (isScheduled) scheduledAt?.ifBlank { null } else null
                )
                val res: Response<FoodOrderCreateResponse> = apiService.createFoodOrder(idempotencyKey, request)
                if (res.isSuccessful && res.body() != null) {
                    _checkoutResult.value = res.body()
                    foodCreateIdempotencyKey = null
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

    fun quote(
        merchantId: String,
        dropoffAddress: String,
        dropoffLat: Double,
        dropoffLng: Double,
        voucherCode: String? = null,
        isScheduled: Boolean = false,
        scheduledAt: String? = null,
        onResult: (Result<FoodQuoteResponse>) -> Unit
    ) {
        val items = cartStore.cart.value.filter { it.quantity > 0 }
        if (items.isEmpty()) {
            onResult(Result.failure(Exception("Keranjang kosong")))
            return
        }
        viewModelScope.launch {
            _loading.value = true
            try {
                val request = CreateFoodOrderRequest(
                    merchantId = merchantId,
                    items = items.map {
                        com.tembus.customer.data.model.FoodOrderItemRequest(
                            menuItemId = it.menuItem.id,
                            quantity = it.quantity,
                            notes = it.notes.ifBlank { null },
                            variants = it.selectedVariants
                        )
                    },
                    dropoffAddress = dropoffAddress,
                    dropoffLat = dropoffLat,
                    dropoffLng = dropoffLng,
                    voucherCode = voucherCode?.ifBlank { null },
                    isScheduled = isScheduled,
                    scheduledAt = if (isScheduled) scheduledAt?.ifBlank { null } else null
                )
                val res = apiService.quoteFoodOrder(request)
                val quote = res.body()
                if (res.isSuccessful && quote != null) {
                    _foodQuote.value = quote
                    onResult(Result.success(quote))
                } else {
                    onResult(Result.failure(Exception("Gagal menghitung harga food (${res.code()})")))
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

    // ============================================================
    // FOOD-BIKE-070: Favorite Merchants (C3)
    // ============================================================

    fun loadFavoriteMerchants() {
        viewModelScope.launch {
            _favoritesLoading.value = true
            _favoritesError.value = null
            try {
                val res = apiService.listFavoriteMerchants()
                if (res.isSuccessful) {
                    _favoriteMerchants.value = res.body()?.merchants ?: emptyList()
                } else {
                    _favoritesError.value = "Gagal memuat favorit (${res.code()})"
                }
            } catch (e: Exception) {
                _favoritesError.value = e.message ?: "Gagal memuat favorit"
            } finally {
                _favoritesLoading.value = false
            }
        }
    }

    fun addFavoriteMerchant(merchantId: String, onResult: (Result<FavoriteActionResponse>) -> Unit) {
        viewModelScope.launch {
            _favoritesLoading.value = true
            try {
                val res = apiService.addFavoriteMerchant(merchantId)
                if (res.isSuccessful && res.body()?.success == true) {
                    onResult(Result.success(res.body()!!))
                    loadFavoriteMerchants() // Refresh list
                } else {
                    onResult(Result.failure(Exception(res.body()?.message ?: "Gagal menambahkan favorit")))
                }
            } catch (e: Exception) {
                onResult(Result.failure(e))
            } finally {
                _favoritesLoading.value = false
            }
        }
    }

    fun removeFavoriteMerchant(merchantId: String, onResult: (Result<FavoriteActionResponse>) -> Unit) {
        viewModelScope.launch {
            _favoritesLoading.value = true
            try {
                val res = apiService.removeFavoriteMerchant(merchantId)
                if (res.isSuccessful && res.body()?.success == true) {
                    onResult(Result.success(res.body()!!))
                    loadFavoriteMerchants() // Refresh list
                } else {
                    onResult(Result.failure(Exception(res.body()?.message ?: "Gagal menghapus favorit")))
                }
            } catch (e: Exception) {
                onResult(Result.failure(e))
            } finally {
                _favoritesLoading.value = false
            }
        }
    }

    fun checkIsFavoriteMerchant(merchantId: String, onResult: (Result<Boolean>) -> Unit) {
        viewModelScope.launch {
            try {
                val res = apiService.checkIsFavoriteMerchant(merchantId)
                if (res.isSuccessful) {
                    onResult(Result.success(res.body()?.isFavorite ?: false))
                } else {
                    onResult(Result.failure(Exception("Gagal cek status favorit")))
                }
            } catch (e: Exception) {
                onResult(Result.failure(e))
            }
        }
    }
}

/** FB-078: state voucher di checkout food. */
sealed class VoucherState {
    object Idle : VoucherState()
    object Loading : VoucherState()
    data class Applied(val code: String, val name: String, val discountIdr: Long) : VoucherState()
    data class Error(val message: String) : VoucherState()
}
