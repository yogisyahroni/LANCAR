package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.CustomerOrderCreateRequest
import com.tembus.customer.data.model.CustomerPriceEstimateRequest
import com.tembus.customer.data.model.DimensionsPayload
import com.tembus.customer.data.model.LocationPayload
import com.tembus.customer.data.model.MapsGeocodeResult
import com.tembus.customer.data.model.NearbyCourier
import com.tembus.customer.data.model.PackageDetailsPayload
import com.tembus.customer.data.model.PriceBreakdown
import com.tembus.customer.data.model.TambalBanMaterial
import com.tembus.customer.data.model.VehicleDetailsPayload
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
    val isResolvingLocation: Boolean = false,
    val materials: List<TambalBanMaterial> = emptyList(),
    val selectedMaterialCodes: Set<String> = emptySet(),
    val nearbyCouriers: List<NearbyCourier> = emptyList(),
    val preferredCourierAvailable: Boolean? = null,
    val requiresPriceConsent: Boolean = false,
    val priceDeltaIdr: Long = 0,
    val priceConsent: Boolean = false
)

data class ServicePriceEstimate(
    val courierServicePrice: Long = 0,
    val perKmRate: Long = 0,
    val distanceKm: Double = 0.0,
    val baseFare: Long = 0,
    val distanceBase: Long = 0,
    val platformFee: Long = 0,
    val dynamicPrice: Long = 0,
    val materialCost: Long = 0,
    val tollCost: Long = 0,
    val totalPrice: Long = 0
)

internal fun isPreferredRoadsideCourierAvailable(
    preferredCourierId: String?,
    couriers: List<NearbyCourier>
): Boolean? {
    val preferred = preferredCourierId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    return couriers.any { courier ->
        courier.courierId == preferred &&
            courier.status.lowercase() in setOf("available", "conditional")
    }
}

@HiltViewModel
class ServiceBookingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServiceBookingUiState())
    val uiState: StateFlow<ServiceBookingUiState> = _uiState.asStateFlow()

    private var activeServiceSubType: String? = null
    private var activePreferredCourierId: String? = null

    fun setLocation(lat: Double, lng: Double) {
        // Reject invalid/zero coords: never allow 0,0 as a transactional fallback.
        if (lat !in -90.0..90.0 || lng !in -180.0..180.0 || lat == 0.0 || lng == 0.0) {
            _uiState.update { it.copy(error = "Lokasi tidak valid. Pilih lokasi di peta atau perbaiki pin.") }
            return
        }
        _uiState.update {
            it.copy(
                customerLat = lat,
                customerLng = lng,
                priceEstimate = null,
                rawPriceBreakdown = null,
                preferredCourierAvailable = null
            )
        }
        if (_uiState.value.customerAddress.isBlank()) {
            resolveAddress(lat, lng)
        }

        // TIRE-2026-001: once a booking context has produced/asked for a quote,
        // changing the pickup pin is a transactional input change. Refresh both
        // technician availability and the server-authoritative quote instead of
        // leaving the old technician/price attached to a new location.
        activeServiceSubType?.let { serviceSubType ->
            fetchEstimate(serviceSubType, lat, lng, activePreferredCourierId)
        }
    }

    fun setLocationError(message: String) {
        _uiState.update { it.copy(error = message) }
    }

    /**
     * Manual pin correction: user memperbaiki lat/lng melalui input angka atau peta.
     * Memicu resolveAddress + technician availability + price estimate refresh otomatis.
     */
    fun correctPin(lat: Double, lng: Double) {
        setLocation(lat, lng)
    }

    fun loadMaterials(serviceSubType: String) {
        if (!serviceSubType.startsWith("tambal_ban")) return
        viewModelScope.launch {
            orderRepository.getTambalBanMaterials(serviceSubType)
                .onSuccess { response -> _uiState.update { it.copy(materials = response.data) } }
                .onFailure { e -> _uiState.update { it.copy(error = e.localizedMessage ?: "Gagal memuat katalog material") } }
        }
    }

    fun toggleMaterial(code: String) {
        _uiState.update { state ->
            val next = state.selectedMaterialCodes.toMutableSet()
            if (!next.add(code)) next.remove(code)
            state.copy(
                selectedMaterialCodes = next,
                priceEstimate = null,
                rawPriceBreakdown = null,
                error = null
            )
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
        val state = _uiState.value
        activeServiceSubType?.takeIf { it.startsWith("towing") }?.let { serviceSubType ->
            if (state.customerLat != 0.0 && state.customerLng != 0.0) {
                fetchEstimate(serviceSubType, state.customerLat, state.customerLng, activePreferredCourierId)
            }
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
        val normalizedCourierId = courierId?.trim()?.takeIf { it.isNotEmpty() }
        activeServiceSubType = serviceSubType
        activePreferredCourierId = normalizedCourierId

        val state = _uiState.value
        val isTowing = serviceSubType.startsWith("towing")
        val isRoadside = serviceSubType.startsWith("tambal_ban") || isTowing
        val dropoffLat = if (isTowing) state.dropoffLat else lat
        val dropoffLng = if (isTowing) state.dropoffLng else lng
        if (isTowing && (dropoffLat == 0.0 || dropoffLng == 0.0 || state.dropoffAddress.isBlank())) {
            _uiState.update { it.copy(error = "Pilih alamat tujuan towing sebelum cek harga") }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = true,
                    error = null,
                    preferredCourierAvailable = if (normalizedCourierId == null) null else it.preferredCourierAvailable
                )
            }

            var effectiveCourierId = normalizedCourierId
            var availabilityWarning: String? = null

            if (isRoadside) {
                val availability = orderRepository.getNearbyCouriers(
                    serviceSubType = serviceSubType,
                    lat = lat,
                    lng = lng
                )
                availability.onSuccess { response ->
                    val preferredAvailable = isPreferredRoadsideCourierAvailable(normalizedCourierId, response.couriers)
                    if (preferredAvailable == false) {
                        effectiveCourierId = null
                        availabilityWarning = "Teknisi pilihan tidak lagi tersedia di lokasi terbaru. Pilih teknisi lain atau gunakan pencarian otomatis."
                    }
                    _uiState.update {
                        it.copy(
                            nearbyCouriers = response.couriers,
                            preferredCourierAvailable = preferredAvailable
                        )
                    }
                }.onFailure { error ->
                    if (normalizedCourierId != null) {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                preferredCourierAvailable = null,
                                rawPriceBreakdown = null,
                                priceEstimate = null,
                                error = error.localizedMessage
                                    ?: "Ketersediaan teknisi pilihan belum dapat diverifikasi. Coba lagi atau gunakan pencarian otomatis."
                            )
                        }
                        return@launch
                    }
                    availabilityWarning = error.localizedMessage ?: "Daftar teknisi terbaru belum dapat dimuat."
                    _uiState.update { it.copy(nearbyCouriers = emptyList()) }
                }
            }

            val latestState = _uiState.value
            val req = CustomerPriceEstimateRequest(
                pickup = LocationPayload(lat, lng),
                dropoff = LocationPayload(dropoffLat, dropoffLng),
                dimensions = if (isTowing) null else DimensionsPayload(0, 0, 0),
                weightKg = if (isTowing) null else 0.0,
                serviceCode = serviceSubType,
                courierId = effectiveCourierId,
                materialCodes = latestState.selectedMaterialCodes.toList()
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
                                materialCost = breakdown.materialCostIdr,
                                tollCost = breakdown.tollCostIdr,
                                perKmRate = breakdown.serviceSnapshot?.perKmIdr ?: 0,
                                // 0-1km = base fare produk (sudah termasuk di basePrice server)
                                distanceBase = breakdown.serviceSnapshot?.baseFareIdr ?: 0
                            ),
                            error = availabilityWarning
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
        vehicleMake: String,
        vehicleModel: String,
        vehicleCondition: String,
        accessConstraints: String,
        notes: String,
        destinationContactName: String,
        destinationContactPhone: String,
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
        val normalizedPreferredCourierId = preferredCourierId?.trim()?.takeIf { it.isNotEmpty() }
        val isRoadside = serviceSubType.startsWith("tambal_ban") || serviceSubType.startsWith("towing")
        if (isRoadside && normalizedPreferredCourierId != null && state.preferredCourierAvailable != true) {
            _uiState.update {
                it.copy(
                    error = if (state.preferredCourierAvailable == false) {
                        "Teknisi pilihan tidak lagi tersedia di pickup terbaru. Pilih teknisi lain atau gunakan pencarian otomatis."
                    } else {
                        "Ketersediaan teknisi pilihan belum terverifikasi. Perbarui estimasi sebelum membuat pesanan."
                    }
                )
            }
            return
        }

        val isTowing = serviceSubType.startsWith("towing")
        if (isTowing) {
            val trustError = validateTowingBookingTrust(
                TowingBookingTrustInput(
                    vehicleType = vehicleType,
                    vehicleMake = vehicleMake,
                    vehicleModel = vehicleModel,
                    vehicleCondition = vehicleCondition,
                    accessConstraints = accessConstraints,
                    destinationAddress = state.dropoffAddress,
                    destinationLatitude = state.dropoffLat,
                    destinationLongitude = state.dropoffLng,
                    destinationContactName = destinationContactName,
                    destinationContactPhone = destinationContactPhone
                )
            )
            if (trustError != null) {
                _uiState.update { it.copy(error = trustError) }
                return
            }
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            val dropoffAddress = if (isTowing) state.dropoffAddress else state.customerAddress
            val dropoffLat = if (isTowing) state.dropoffLat else state.customerLat
            val dropoffLng = if (isTowing) state.dropoffLng else state.customerLng
            val itemDesc = "Towing ${vehicleType.trim()} ${vehicleMake.trim()} ${vehicleModel.trim()} — ${vehicleCondition.trim()}"

            val req = CustomerOrderCreateRequest(
                pickupAddress = state.customerAddress,
                pickupLocation = LocationPayload(state.customerLat, state.customerLng),
                dropoffAddress = dropoffAddress,
                dropoffLocation = LocationPayload(dropoffLat, dropoffLng),
                recipientName = if (isTowing) destinationContactName.trim() else "Customer",
                recipientPhone = if (isTowing) destinationContactPhone.trim().ifBlank { null } else null,
                packageDetails = PackageDetailsPayload(
                    sizeTier = null,
                    weightKg = null,
                    dimensions = null,
                    dimensionsScanned = false,
                    requiresDeliveryCode = false,
                    itemDescription = itemDesc,
                    vehicleDetails = if (isTowing) VehicleDetailsPayload(
                        type = vehicleType.trim(), make = vehicleMake.trim(), model = vehicleModel.trim(),
                        condition = vehicleCondition.trim(), damage = damageType.trim(),
                        accessConstraints = accessConstraints.trim(), notes = notes.trim()
                    ) else null
                ),
                priceBreakdown = breakdown,
                serviceCode = serviceSubType,
                preferredCourierId = normalizedPreferredCourierId,
                materialCodes = state.selectedMaterialCodes.toList(),
                quoteTotalPriceIdr = breakdown.totalPriceIdr,
                quoteId = breakdown.quoteId,
                quoteInputFingerprint = breakdown.inputFingerprint,
                quoteSnapshotHash = breakdown.snapshotHash ?: breakdown.routeSnapshot?.snapshotHash,
                quoteExpiresAt = breakdown.expiresAt,
                quoteConsent = state.priceConsent
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
                    val consentError = e as? OrderRepository.PriceConsentRequiredException
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            requiresPriceConsent = consentError != null,
                            priceDeltaIdr = consentError?.deltaIdr ?: 0,
                            rawPriceBreakdown = consentError?.trustedPriceBreakdown ?: it.rawPriceBreakdown,
                            priceEstimate = consentError?.trustedPriceBreakdown?.let { breakdown ->
                                ServicePriceEstimate(
                                    totalPrice = breakdown.totalPriceIdr,
                                    baseFare = breakdown.basePriceIdr,
                                    distanceKm = breakdown.distanceKm,
                                    platformFee = breakdown.platformFeeIdr,
                                    dynamicPrice = breakdown.dynamicPriceIdr,
                                    materialCost = breakdown.materialCostIdr,
                                    tollCost = breakdown.tollCostIdr,
                                    perKmRate = breakdown.serviceSnapshot?.perKmIdr ?: 0,
                                    distanceBase = breakdown.serviceSnapshot?.baseFareIdr ?: 0
                                )
                            } ?: it.priceEstimate,
                            error = e.localizedMessage ?: "Gagal membuat pesanan"
                        )
                    }
                }
            }
        }
    }

    fun setPriceConsent(accepted: Boolean) {
        _uiState.update { it.copy(priceConsent = accepted, error = if (accepted) null else it.error) }
    }
}