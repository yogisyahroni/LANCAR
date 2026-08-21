package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.CustomerOrderCreateRequest
import com.tembus.customer.data.model.CustomerPriceEstimateRequest
import com.tembus.customer.data.model.DimensionsPayload
import com.tembus.customer.data.model.LocationPayload
import com.tembus.customer.data.model.MapsGeocodeResult
import com.tembus.customer.data.model.PackageDetailsPayload
import com.tembus.customer.data.model.PriceBreakdown
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ServiceBookingUiState(
    val isLoading: Boolean = false,
    val priceEstimate: ServicePriceEstimate? = null,
    val rawPriceBreakdown: PriceBreakdown? = null,
    val error: String? = null,
    val orderId: String? = null,
    val customerLat: Double = 0.0,
    val customerLng: Double = 0.0,
    val customerAddress: String = "",
    val dropoffQuery: String = "",
    val dropoffAddress: String = "",
    val dropoffLat: Double = 0.0,
    val dropoffLng: Double = 0.0,
    val dropoffResults: List<MapsGeocodeResult> = emptyList(),
    val isResolvingLocation: Boolean = false
)

data class ServicePriceEstimate(
    val courierServicePrice: Long = 0,
    val perKmRate: Long = 0,
    val distanceKm: Double = 0.0,
    val baseFare: Long = 0,
    val distanceBase: Long = 0,
    val platformFee: Long = 0,
    val dynamicPrice: Long = 0,
    val totalPrice: Long = 0
)

@HiltViewModel
class ServiceBookingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServiceBookingUiState())
    val uiState: StateFlow<ServiceBookingUiState> = _uiState.asStateFlow()

    fun setLocation(lat: Double, lng: Double) {
        _uiState.update {
            it.copy(
                customerLat = lat,
                customerLng = lng,
                priceEstimate = null,
                rawPriceBreakdown = null
            )
        }
        if (_uiState.value.customerAddress.isBlank()) {
            resolveAddress(lat, lng)
        }
    }

    fun updateDropoffQuery(query: String) {
        _uiState.update {
            it.copy(
                dropoffQuery = query,
                dropoffResults = if (query.length < 3) emptyList() else it.dropoffResults,
                priceEstimate = null,
                rawPriceBreakdown = null
            )
        }
    }

    fun searchDropoffAddress() {
        val query = _uiState.value.dropoffQuery.trim()
        if (query.length < 3) {
            _uiState.update { it.copy(error = "Ketik minimal 3 karakter alamat tujuan") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            orderRepository.geocodeAddress(query)
                .onSuccess { results ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            dropoffResults = results,
                            error = if (results.isEmpty()) "Alamat tujuan tidak ditemukan. Coba kata kunci lain." else null
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            dropoffResults = emptyList(),
                            error = e.localizedMessage ?: "Gagal mencari alamat tujuan"
                        )
                    }
                }
        }
    }

    fun selectDropoff(result: MapsGeocodeResult) {
        _uiState.update {
            it.copy(
                dropoffQuery = result.label,
                dropoffAddress = result.label,
                dropoffLat = result.latitude,
                dropoffLng = result.longitude,
                dropoffResults = emptyList(),
                priceEstimate = null,
                rawPriceBreakdown = null,
                error = null
            )
        }
    }

    fun resolveAddress(lat: Double, lng: Double) {
        viewModelScope.launch {
            _uiState.update { it.copy(isResolvingLocation = true) }
            orderRepository.reverseGeocodePoint(LocationPayload(lat, lng))
                .onSuccess { result ->
                    _uiState.update {
                        it.copy(
                            isResolvingLocation = false,
                            customerAddress = result.label.ifBlank { "Lokasi saat ini" }
                        )
                    }
                }
                .onFailure {
                    _uiState.update {
                        it.copy(
                            isResolvingLocation = false,
                            customerAddress = "Lokasi saat ini"
                        )
                    }
                }
        }
    }

    fun fetchEstimate(serviceSubType: String, lat: Double, lng: Double, courierId: String? = null) {
        val state = _uiState.value
        val isTowing = serviceSubType.startsWith("towing")
        val dropoffLat = if (isTowing) state.dropoffLat else lat
        val dropoffLng = if (isTowing) state.dropoffLng else lng
        if (isTowing && (dropoffLat == 0.0 || dropoffLng == 0.0 || state.dropoffAddress.isBlank())) {
            _uiState.update { it.copy(error = "Pilih alamat tujuan towing sebelum cek harga") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val req = CustomerPriceEstimateRequest(
                pickup = LocationPayload(lat, lng),
                dropoff = LocationPayload(dropoffLat, dropoffLng),
                dimensions = DimensionsPayload(0, 0, 0),
                weightKg = 0.0,
                serviceCode = serviceSubType,
                courierId = courierId
            )
            orderRepository.calculateCustomerOrderPrice(req)
                .onSuccess { breakdown ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            rawPriceBreakdown = breakdown,
                            priceEstimate = ServicePriceEstimate(
                                totalPrice = breakdown.totalPriceIdr,
                                baseFare = breakdown.basePriceIdr,
                                distanceKm = breakdown.distanceKm,
                                platformFee = breakdown.platformFeeIdr,
                                dynamicPrice = breakdown.dynamicPriceIdr,
                                perKmRate = breakdown.serviceSnapshot?.perKmIdr ?: 0,
                                // 0-1km = base fare produk (sudah termasuk di basePrice server)
                                distanceBase = breakdown.serviceSnapshot?.baseFareIdr ?: 0
                            )
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update { it.copy(isLoading = false, error = e.localizedMessage ?: "Gagal menghitung estimasi") }
                }
        }
    }

    fun createOrder(
        serviceSubType: String,
        vehicleType: String,
        damageType: String,
        notes: String,
        preferredCourierId: String?
    ) {
        val breakdown = _uiState.value.rawPriceBreakdown
        val state = _uiState.value
        if (breakdown == null) {
            _uiState.update { it.copy(error = "Estimasi harga belum tersedia") }
            return
        }
        if (state.customerLat == 0.0 || state.customerLng == 0.0) {
            _uiState.update { it.copy(error = "Lokasi belum tersedia. Nyalakan GPS dan coba lagi.") }
            return
        }
        val isTowing = serviceSubType.startsWith("towing")
        if (isTowing && (state.dropoffLat == 0.0 || state.dropoffLng == 0.0 || state.dropoffAddress.isBlank())) {
            _uiState.update { it.copy(error = "Pilih alamat tujuan towing sebelum membuat pesanan") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            val dropoffAddress = if (isTowing) state.dropoffAddress else state.customerAddress
            val dropoffLat = if (isTowing) state.dropoffLat else state.customerLat
            val dropoffLng = if (isTowing) state.dropoffLng else state.customerLng
            val itemDesc = "Kendaraan: $vehicleType\nKerusakan: $damageType\nCatatan: $notes"

            val req = CustomerOrderCreateRequest(
                pickupAddress = state.customerAddress,
                pickupLocation = LocationPayload(state.customerLat, state.customerLng),
                dropoffAddress = dropoffAddress,
                dropoffLocation = LocationPayload(dropoffLat, dropoffLng),
                recipientName = "Customer",
                recipientPhone = "-",
                packageDetails = PackageDetailsPayload(
                    sizeTier = "small",
                    weightKg = 0.0,
                    dimensions = DimensionsPayload(0, 0, 0),
                    dimensionsScanned = false,
                    requiresDeliveryCode = false,
                    itemDescription = itemDesc
                ),
                priceBreakdown = breakdown,
                serviceCode = serviceSubType,
                preferredCourierId = preferredCourierId
            )

            orderRepository.createCustomerOnDemandOrder(req).collectLatest { result ->
                result.onSuccess { order ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            orderId = order.id
                        )
                    }
                }
                result.onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = e.localizedMessage ?: "Gagal membuat pesanan"
                        )
                    }
                }
            }
        }
    }
}
