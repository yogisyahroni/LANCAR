package com.lancar.customer.ui.screens.booking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.maps.model.LatLng
import com.lancar.customer.data.model.CustomerOrderCreateRequest
import com.lancar.customer.data.model.CustomerAddress
import com.lancar.customer.data.model.CustomerAddressRequest
import com.lancar.customer.data.model.CustomerPriceEstimateRequest
import com.lancar.customer.data.model.DeliveryServiceProduct
import com.lancar.customer.data.model.DimensionsPayload
import com.lancar.customer.data.model.LocationPayload
import com.lancar.customer.data.model.MapsGeocodeResult
import com.lancar.customer.data.model.MapsProviderConfig
import com.lancar.customer.data.model.PackageDetailsPayload
import com.lancar.customer.data.model.PriceBreakdown
import com.lancar.customer.data.model.ReceiverLocationCreateRequest
import com.lancar.customer.data.model.ReceiverLocationLink
import com.lancar.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BookingState(
    val pickupLocation: LatLng? = null,
    val pickupAddress: String = "",
    val destinationLocation: LatLng? = null,
    val destinationAddress: String = "",
    val estimatedPrice: Long = 0,
    val isLoading: Boolean = false,
    val isCalculatingRoute: Boolean = false,
    val error: String? = null,
    val services: List<DeliveryServiceProduct> = emptyList(),
    val selectedServiceCode: String = "",
    val priceBreakdowns: Map<String, PriceBreakdown> = emptyMap(),
    val packageLength: Int = 40,
    val packageWidth: Int = 40,
    val packageHeight: Int = 17,
    val packageWeight: Double = 1.0,
    val sizeTier: String = "small",
    val itemDescription: String = "",
    val recipientName: String = "",
    val recipientPhone: String = "",
    val deliveryCodeEnabled: Boolean = false,
    val insuranceEnabled: Boolean = false,
    val itemValue: Long = 0,
    val dimensionsScanned: Boolean = false,
    val receiverLocationLink: ReceiverLocationLink? = null,
    val isCreatingLocationLink: Boolean = false,
    val addressBook: List<CustomerAddress> = emptyList(),
    val isSavingAddress: Boolean = false,
    val geocodeResults: List<MapsGeocodeResult> = emptyList(),
    val isSearchingLocation: Boolean = false,
    val geocodeError: String? = null,
    val mapPickerLocation: LatLng? = null,
    val mapPickerAddress: String = "",
    val isResolvingMapPoint: Boolean = false,
    val mapsProviderConfig: MapsProviderConfig = MapsProviderConfig(),
    val mapsProviderError: String? = null
)

@HiltViewModel
class BookingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _bookingState = MutableStateFlow(BookingState())
    val bookingState: StateFlow<BookingState> = _bookingState.asStateFlow()

    private val _bookingSuccess = MutableSharedFlow<String>()
    val bookingSuccess = _bookingSuccess.asSharedFlow()
    private var routeCalculationVersion = 0

    private fun PriceBreakdown.hasRoadRoute(): Boolean {
        val polyline = routeSnapshot?.routePolyline?.trim().orEmpty()
        val provider = routeSnapshot?.provider.orEmpty()
        return polyline.isNotBlank() &&
            !provider.contains("haversine", ignoreCase = true) &&
            (routeSnapshot?.distanceKm ?: distanceKm) > 0.0
    }

    init {
        loadServices()
        loadAddressBook()
        loadMapsProviderConfig()
    }

    fun loadMapsProviderConfig() {
        viewModelScope.launch {
            orderRepository.getMapsProviderConfig().onSuccess { config ->
                _bookingState.value = _bookingState.value.copy(
                    mapsProviderConfig = config,
                    mapsProviderError = null
                )
            }.onFailure { e ->
                _bookingState.value = _bookingState.value.copy(
                    mapsProviderError = e.localizedMessage ?: "Konfigurasi peta belum tersedia"
                )
            }
        }
    }

    fun loadAddressBook() {
        viewModelScope.launch {
            val result = orderRepository.getCustomerAddresses()
            result.onSuccess { addresses ->
                _bookingState.value = _bookingState.value.copy(addressBook = addresses)
            }
        }
    }

    fun loadServices() {
        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(isLoading = true, error = null)
            orderRepository.getCustomerDeliveryServices().collectLatest { result ->
                result.onSuccess { services ->
                    val onDemandServices = services
                        .filter { it.serviceCategory == "on_demand" && it.isEnabled }
                        .filter { !it.requiresDimensionScan || it.allowsManualDimension }
                        .sortedBy { it.displayOrder }
                    _bookingState.value = _bookingState.value.copy(
                        isLoading = false,
                        services = onDemandServices,
                        selectedServiceCode = _bookingState.value.selectedServiceCode
                            .takeIf { selectedCode -> onDemandServices.any { it.code == selectedCode } }
                            .orEmpty()
                    )
                    calculateRoute()
                }
                result.onFailure { e ->
                    _bookingState.value = _bookingState.value.copy(
                        isLoading = false,
                        error = e.localizedMessage ?: "Gagal memuat layanan"
                    )
                }
            }
        }
    }

    fun setPickup(location: LatLng, address: String) {
        _bookingState.value = _bookingState.value.copy(
            pickupLocation = location,
            pickupAddress = address,
            selectedServiceCode = "",
            estimatedPrice = 0,
            priceBreakdowns = emptyMap()
        )
        calculateRoute()
    }

    fun setDestination(location: LatLng, address: String) {
        _bookingState.value = _bookingState.value.copy(
            destinationLocation = location,
            destinationAddress = address,
            selectedServiceCode = "",
            estimatedPrice = 0,
            priceBreakdowns = emptyMap()
        )
        calculateRoute()
    }

    fun selectSavedAddress(savedAddress: CustomerAddress, asPickup: Boolean) {
        val location = LatLng(savedAddress.lat, savedAddress.lng)
        if (asPickup) {
            setPickup(location, savedAddress.address)
        } else {
            setDestination(location, savedAddress.address)
            if (savedAddress.contactName?.isNotBlank() == true && _bookingState.value.recipientName.isBlank()) {
                _bookingState.value = _bookingState.value.copy(recipientName = savedAddress.contactName)
            }
        }
    }

    fun saveAddressAndSelect(
        label: String,
        address: String,
        location: LatLng,
        kind: String,
        asPickup: Boolean
    ) {
        if (asPickup) {
            setPickup(location, address)
        } else {
            setDestination(location, address)
        }

        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(isSavingAddress = true, error = null)
            val result = orderRepository.createCustomerAddress(
                CustomerAddressRequest(
                    label = label.ifBlank { if (asPickup) "Pickup favorit" else "Tujuan favorit" },
                    address = address,
                    location = LocationPayload(location.latitude, location.longitude),
                    contactName = if (asPickup) null else _bookingState.value.recipientName.ifBlank { null },
                    contactPhone = if (asPickup) null else _bookingState.value.recipientPhone.ifBlank { null },
                    kind = kind,
                    isFavorite = true,
                    markUsed = true
                )
            )
            result.onSuccess { savedAddress ->
                _bookingState.value = _bookingState.value.copy(
                    isSavingAddress = false,
                    addressBook = listOf(savedAddress) + _bookingState.value.addressBook.filterNot { it.id == savedAddress.id }
                )
            }
            result.onFailure { e ->
                _bookingState.value = _bookingState.value.copy(
                    isSavingAddress = false,
                    error = e.localizedMessage ?: "Alamat dipakai untuk order, tapi gagal disimpan ke favorit."
                )
            }
        }
    }

    fun searchAddress(query: String) {
        val normalizedQuery = query.trim()
        if (normalizedQuery.length < 3) {
            _bookingState.value = _bookingState.value.copy(
                geocodeResults = emptyList(),
                geocodeError = "Ketik minimal 3 karakter untuk mencari alamat."
            )
            return
        }

        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(
                isSearchingLocation = true,
                geocodeError = null
            )
            val result = orderRepository.geocodeAddress(normalizedQuery)
            result.onSuccess { locations ->
                _bookingState.value = _bookingState.value.copy(
                    isSearchingLocation = false,
                    geocodeResults = locations,
                    geocodeError = if (locations.isEmpty()) "Alamat tidak ditemukan. Coba kata kunci yang lebih spesifik." else null
                )
            }
            result.onFailure { e ->
                _bookingState.value = _bookingState.value.copy(
                    isSearchingLocation = false,
                    geocodeResults = emptyList(),
                    geocodeError = e.localizedMessage ?: "Gagal mencari alamat."
                )
            }
        }
    }

    fun selectGeocodeResult(result: MapsGeocodeResult) {
        _bookingState.value = _bookingState.value.copy(
            mapPickerLocation = LatLng(result.latitude, result.longitude),
            mapPickerAddress = result.label,
            geocodeError = null
        )
    }

    fun selectMapPoint(location: LatLng) {
        if (location.latitude !in -90.0..90.0 || location.longitude !in -180.0..180.0) {
            _bookingState.value = _bookingState.value.copy(geocodeError = "Titik peta tidak valid.")
            return
        }

        viewModelScope.launch {
            val coordinateLabel = "Titik peta ${"%.5f".format(location.latitude)}, ${"%.5f".format(location.longitude)}"
            _bookingState.value = _bookingState.value.copy(
                mapPickerLocation = location,
                mapPickerAddress = coordinateLabel,
                isResolvingMapPoint = true,
                geocodeError = null
            )
            val result = orderRepository.reverseGeocodePoint(LocationPayload(location.latitude, location.longitude))
            result.onSuccess { address ->
                _bookingState.value = _bookingState.value.copy(
                    mapPickerLocation = LatLng(address.latitude, address.longitude),
                    mapPickerAddress = address.label.ifBlank { coordinateLabel },
                    isResolvingMapPoint = false
                )
            }
            result.onFailure { e ->
                _bookingState.value = _bookingState.value.copy(
                    isResolvingMapPoint = false,
                    geocodeError = e.localizedMessage ?: "Alamat titik peta belum terbaca. Titik tetap bisa digunakan."
                )
            }
        }
    }

    fun clearLocationSearch() {
        _bookingState.value = _bookingState.value.copy(
            geocodeResults = emptyList(),
            isSearchingLocation = false,
            geocodeError = null,
            mapPickerLocation = null,
            mapPickerAddress = "",
            isResolvingMapPoint = false
        )
    }

    fun setDimensions(l: Int, w: Int, h: Int) {
        _bookingState.value = _bookingState.value.copy(
            packageLength = l,
            packageWidth = w,
            packageHeight = h,
            dimensionsScanned = true,
            selectedServiceCode = "",
            estimatedPrice = 0,
            priceBreakdowns = emptyMap()
        )
        calculateRoute()
    }

    fun selectService(code: String) {
        val price = _bookingState.value.priceBreakdowns[code]?.totalPriceIdr ?: 0
        _bookingState.value = _bookingState.value.copy(
            selectedServiceCode = code,
            estimatedPrice = price
        )
    }

    fun setSizeTier(code: String, weightKg: Double, dimensions: DimensionsPayload) {
        _bookingState.value = _bookingState.value.copy(
            sizeTier = code,
            packageWeight = weightKg,
            packageLength = dimensions.length,
            packageWidth = dimensions.width,
            packageHeight = dimensions.height,
            dimensionsScanned = false,
            selectedServiceCode = "",
            estimatedPrice = 0,
            priceBreakdowns = emptyMap()
        )
        calculateRoute()
    }

    fun setRecipientName(value: String) {
        _bookingState.value = _bookingState.value.copy(recipientName = value)
    }

    fun setRecipientPhone(value: String) {
        _bookingState.value = _bookingState.value.copy(recipientPhone = value)
    }

    fun setItemDescription(value: String) {
        _bookingState.value = _bookingState.value.copy(itemDescription = value)
    }

    fun toggleDeliveryCode(enabled: Boolean) {
        _bookingState.value = _bookingState.value.copy(deliveryCodeEnabled = enabled)
    }

    fun toggleInsurance(enabled: Boolean) {
        _bookingState.value = _bookingState.value.copy(
            insuranceEnabled = enabled,
            selectedServiceCode = "",
            estimatedPrice = 0,
            priceBreakdowns = emptyMap()
        )
        calculateRoute()
    }

    private fun calculateRoute() {
        val state = _bookingState.value
        if (state.pickupLocation != null && state.destinationLocation != null && state.services.isNotEmpty()) {
            val calculationVersion = ++routeCalculationVersion
            _bookingState.value = state.copy(
                isCalculatingRoute = true,
                selectedServiceCode = "",
                estimatedPrice = 0,
                priceBreakdowns = emptyMap(),
                error = null
            )
            viewModelScope.launch {
                val dimensions = DimensionsPayload(state.packageLength, state.packageWidth, state.packageHeight)
                val estimateResult = orderRepository.calculateCustomerOrderPrices(
                    CustomerPriceEstimateRequest(
                        pickup = LocationPayload(state.pickupLocation.latitude, state.pickupLocation.longitude),
                        dropoff = LocationPayload(state.destinationLocation.latitude, state.destinationLocation.longitude),
                        dimensions = dimensions,
                        weightKg = state.packageWeight,
                        hasInsurance = state.insuranceEnabled,
                        itemValue = state.itemValue,
                        dimensionScanVerified = state.dimensionsScanned,
                        serviceCode = "ALL_ON_DEMAND",
                        sizeTier = state.sizeTier
                    )
                )
                val estimates = estimateResult.getOrNull()
                    ?.filter { it.hasRoadRoute() }
                    ?.associateBy { it.serviceCode }
                    .orEmpty()
                val firstError = estimateResult.exceptionOrNull()?.localizedMessage
                    ?: if (estimates.isEmpty()) "Rute jalan belum tersedia. Harga tidak dihitung dari garis lurus." else null

                if (calculationVersion != routeCalculationVersion) {
                    return@launch
                }

                val preferredCode = when {
                    state.selectedServiceCode.isNotBlank() && estimates.containsKey(state.selectedServiceCode) -> state.selectedServiceCode
                    estimates.containsKey("LANCAR_INSTANT") -> "LANCAR_INSTANT"
                    estimates.isNotEmpty() -> estimates.keys.first()
                    else -> ""
                }
                _bookingState.value = _bookingState.value.copy(
                    isCalculatingRoute = false,
                    priceBreakdowns = estimates,
                    selectedServiceCode = preferredCode,
                    estimatedPrice = estimates[preferredCode]?.totalPriceIdr ?: 0,
                    error = if (estimates.isEmpty()) {
                        firstError ?: "Rute jalan belum tersedia. Coba pilih alamat yang lebih spesifik."
                    } else {
                        null
                    }
                )
            }
        } else {
            routeCalculationVersion++
            _bookingState.value = state.copy(
                isCalculatingRoute = false,
                selectedServiceCode = "",
                estimatedPrice = 0,
                priceBreakdowns = emptyMap()
            )
        }
    }
    fun confirmBooking() {
        val state = _bookingState.value
        if (state.pickupLocation == null || state.destinationLocation == null) {
            _bookingState.value = state.copy(error = "Lengkapi rute penjemputan dan tujuan.")
            return
        }
        val priceBreakdown = state.priceBreakdowns[state.selectedServiceCode]
        if (priceBreakdown == null) {
            _bookingState.value = state.copy(error = "Pilih layanan dan hitung harga terlebih dahulu.")
            return
        }
        if (state.recipientName.isBlank() || state.recipientPhone.isBlank()) {
            _bookingState.value = state.copy(error = "Lengkapi nama dan nomor penerima.")
            return
        }
        if (state.recipientName.trim().length < 2 || state.recipientPhone.trim().length < 8) {
            _bookingState.value = state.copy(error = "Data penerima belum valid.")
            return
        }
        if (state.itemDescription.trim().length < 3) {
            _bookingState.value = state.copy(error = "Isi paket wajib diisi agar kurir tahu barang yang diambil.")
            return
        }

        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(isLoading = true, error = null)

            val req = CustomerOrderCreateRequest(
                pickupAddress = state.pickupAddress,
                pickupLocation = LocationPayload(state.pickupLocation.latitude, state.pickupLocation.longitude),
                dropoffAddress = state.destinationAddress,
                dropoffLocation = LocationPayload(state.destinationLocation.latitude, state.destinationLocation.longitude),
                recipientName = state.recipientName,
                recipientPhone = state.recipientPhone,
                packageDetails = PackageDetailsPayload(
                    sizeTier = state.sizeTier,
                    weightKg = state.packageWeight,
                    dimensions = DimensionsPayload(state.packageLength, state.packageWidth, state.packageHeight),
                    dimensionsScanned = state.dimensionsScanned,
                    requiresDeliveryCode = state.deliveryCodeEnabled,
                    itemDescription = state.itemDescription
                ),
                hasInsurance = state.insuranceEnabled,
                itemValue = state.itemValue,
                customerNotes = state.itemDescription,
                priceBreakdown = priceBreakdown,
                serviceCode = state.selectedServiceCode
            )

            orderRepository.createCustomerOnDemandOrder(req).collectLatest { result ->
                result.onSuccess { order ->
                    _bookingState.value = _bookingState.value.copy(isLoading = false)
                    _bookingSuccess.emit(order.id)
                }
                result.onFailure { e ->
                    _bookingState.value = _bookingState.value.copy(
                        isLoading = false,
                        error = e.localizedMessage ?: "Gagal melakukan pemesanan"
                    )
                }
            }
        }
    }

    fun createReceiverLocationLink() {
        val state = _bookingState.value
        val pickupLocation = state.pickupLocation
        if (state.pickupAddress.isBlank()) {
            _bookingState.value = state.copy(error = "Alamat pickup wajib diisi sebelum membuat link.")
            return
        }

        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(isCreatingLocationLink = true, error = null)
            val result = orderRepository.createReceiverLocationRequest(
                ReceiverLocationCreateRequest(
                    pickupAddress = state.pickupAddress,
                    pickupLocation = pickupLocation?.let { LocationPayload(it.latitude, it.longitude) },
                    recipientName = state.recipientName.ifBlank { null },
                    recipientPhone = state.recipientPhone.ifBlank { null },
                    expiresHours = 24
                )
            )
            result.onSuccess { link ->
                _bookingState.value = _bookingState.value.copy(
                    receiverLocationLink = link,
                    isCreatingLocationLink = false
                )
            }
            result.onFailure { e ->
                _bookingState.value = _bookingState.value.copy(
                    isCreatingLocationLink = false,
                    error = e.localizedMessage ?: "Gagal membuat link lokasi penerima"
                )
            }
        }
    }

    fun refreshReceiverLocationLink() {
        val linkId = _bookingState.value.receiverLocationLink?.id
        if (linkId.isNullOrBlank()) {
            _bookingState.value = _bookingState.value.copy(error = "Buat link lokasi penerima terlebih dahulu.")
            return
        }

        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(isCreatingLocationLink = true, error = null)
            val result = orderRepository.getReceiverLocationRequest(linkId)
            result.onSuccess { link ->
                val lat = link.submittedLat
                val lng = link.submittedLng
                val submittedAddress = link.submittedAddress.orEmpty()
                if (link.status == "submitted" && lat != null && lng != null && submittedAddress.isNotBlank()) {
                    _bookingState.value = _bookingState.value.copy(
                        receiverLocationLink = link,
                        isCreatingLocationLink = false,
                        destinationLocation = LatLng(lat, lng),
                        destinationAddress = submittedAddress,
                        recipientName = link.submittedContactName?.takeIf { it.isNotBlank() } ?: _bookingState.value.recipientName
                    )
                    calculateRoute()
                } else {
                    _bookingState.value = _bookingState.value.copy(
                        receiverLocationLink = link,
                        isCreatingLocationLink = false,
                        error = "Penerima belum mengirim lokasi."
                    )
                }
            }
            result.onFailure { e ->
                _bookingState.value = _bookingState.value.copy(
                    isCreatingLocationLink = false,
                    error = e.localizedMessage ?: "Gagal mengecek lokasi penerima"
                )
            }
        }
    }

    fun clearError() {
        _bookingState.value = _bookingState.value.copy(error = null)
    }
}
