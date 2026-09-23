package com.tembus.customer.ui.screens.booking

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.data.model.CustomerOrderCreateRequest
import com.tembus.customer.data.model.CustomerAddress
import com.tembus.customer.data.model.CustomerAddressRequest
import com.tembus.customer.data.model.CustomerPriceEstimateRequest
import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.data.model.DimensionsPayload
import com.tembus.customer.data.model.AggregatorTariffService
import com.tembus.customer.data.model.AggregatorPackageCategory
import com.tembus.customer.data.model.LogisticsLocationOption
import com.tembus.customer.data.model.LogisticsProviderOption
import com.tembus.customer.data.model.LocationPayload
import com.tembus.customer.data.model.MapsGeocodeResult
import com.tembus.customer.data.model.MapsProviderConfig
import com.tembus.customer.data.model.PackageDetailsPayload
import com.tembus.customer.data.model.PriceBreakdown
import com.tembus.customer.data.model.ReceiverLocationCreateRequest
import com.tembus.customer.data.model.ReceiverLocationLink
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import java.util.UUID
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import com.tembus.customer.ui.policy.PackageOrderFlowPolicy
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

data class PackagePhotoUploadPayload(
    val bytes: ByteArray,
    val mimeType: String,
    val fileName: String
)

data class BookingState(
    val pickupPoint: BookingAddressPoint? = null,
    val pickupLocation: LatLng? = null,
    val pickupAddress: String = "",
    val destinationPoint: BookingAddressPoint? = null,
    val destinationLocation: LatLng? = null,
    val destinationAddress: String = "",
    val estimatedPrice: Long = 0,
    val isLoading: Boolean = false,
    val isCalculatingRoute: Boolean = false,
    val error: String? = null,
    val services: List<DeliveryServiceProduct> = emptyList(),
    val selectedServiceCode: String = "",
    val priceBreakdowns: Map<String, PriceBreakdown> = emptyMap(),
    val packageLength: Int = 0,
    val packageWidth: Int = 0,
    val packageHeight: Int = 0,
    val packageWeight: Double = 0.0,
    val packageCategory: String = "",
    val packageQuantity: Int = 1,
    val packageIsFragile: Boolean = false,
    val packageIsProhibited: Boolean = false,
    val sizeTier: String = "",
    val isPackageSizeSelected: Boolean = false,
    val itemDescription: String = "",
    val recipientName: String = "",
    val recipientPhone: String = "",
    val deliveryCodeEnabled: Boolean = false,
    val insuranceEnabled: Boolean = false,
    val itemValue: Long = 0,
    val scheduleType: String = "now",
    val scheduledAt: String? = null,
    val scheduledAtMillis: Long? = null,
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
    val mapsProviderError: String? = null,
    val promoCode: String = "",
    // FB-078: voucher redeem
    val voucherCode: String = "",
    val voucherDiscountIdr: Long = 0,
    val voucherName: String = "",
    val voucherApplied: Boolean = false,
    val voucherLoading: Boolean = false,
    val voucherError: String? = null,
    val aggregatorProviders: List<LogisticsProviderOption> = emptyList(),
    val aggregatorLocations: List<LogisticsLocationOption> = emptyList(),
    val aggregatorProvider: String = "",
    val aggregatorOriginCode: String = "",
    val aggregatorDestinationCode: String = "",
    val aggregatorQuotes: List<AggregatorTariffService> = emptyList(),
    val aggregatorSelectedQuoteId: String? = null,
    val aggregatorQuoteLoading: Boolean = false,
    val aggregatorError: String? = null,
    val aggregatorPackageCategories: List<AggregatorPackageCategory> = emptyList(),
    val aggregatorPackageCategoriesError: String? = null,
    val packagePhotoUploadError: String? = null,
    val packagePhotoUploadCount: Int = 0,
    val packagePhotoUploadTotal: Int = 0
)

@Serializable
private data class BookingDraft(
    val pickupLatitude: Double? = null,
    val pickupLongitude: Double? = null,
    val pickupAddress: String = "",
    val destinationLatitude: Double? = null,
    val destinationLongitude: Double? = null,
    val destinationAddress: String = "",
    val packageLength: Int = 0,
    val packageWidth: Int = 0,
    val packageHeight: Int = 0,
    val packageWeight: Double = 0.0,
    val packageCategory: String = "",
    val packageQuantity: Int = 1,
    val packageIsFragile: Boolean = false,
    val packageIsProhibited: Boolean = false,
    val sizeTier: String = "",
    val isPackageSizeSelected: Boolean = false,
    val itemDescription: String = "",
    val recipientName: String = "",
    val recipientPhone: String = "",
    val deliveryCodeEnabled: Boolean = false,
    val insuranceEnabled: Boolean = false,
    val itemValue: Long = 0,
    val scheduleType: String = "now",
    val scheduledAt: String? = null,
    val scheduledAtMillis: Long? = null,
    val promoCode: String = "",
    val voucherCode: String = ""
)

private const val BOOKING_DRAFT_KEY = "customer_booking_draft_v1"
private val bookingDraftJson = Json { ignoreUnknownKeys = true }

private fun BookingState.toBookingDraft(): BookingDraft = BookingDraft(
    pickupLatitude = pickupLocation?.latitude,
    pickupLongitude = pickupLocation?.longitude,
    pickupAddress = pickupAddress,
    destinationLatitude = destinationLocation?.latitude,
    destinationLongitude = destinationLocation?.longitude,
    destinationAddress = destinationAddress,
    packageLength = packageLength,
    packageWidth = packageWidth,
    packageHeight = packageHeight,
    packageWeight = packageWeight,
    packageCategory = packageCategory,
    packageQuantity = packageQuantity,
    packageIsFragile = packageIsFragile,
    packageIsProhibited = packageIsProhibited,
    sizeTier = sizeTier,
    isPackageSizeSelected = isPackageSizeSelected,
    itemDescription = itemDescription,
    recipientName = recipientName,
    recipientPhone = recipientPhone,
    deliveryCodeEnabled = deliveryCodeEnabled,
    insuranceEnabled = insuranceEnabled,
    itemValue = itemValue,
    scheduleType = scheduleType,
    scheduledAt = scheduledAt,
    scheduledAtMillis = scheduledAtMillis,
    promoCode = promoCode,
    voucherCode = voucherCode
)

private fun BookingDraft.toBookingState(): BookingState {
    val pickup = if (pickupLatitude != null && pickupLongitude != null && pickupAddress.isNotBlank()) {
        LatLng(pickupLatitude, pickupLongitude)
    } else null
    val destination = if (destinationLatitude != null && destinationLongitude != null && destinationAddress.isNotBlank()) {
        LatLng(destinationLatitude, destinationLongitude)
    } else null
    return BookingState(
        pickupPoint = pickup?.let {
            BookingAddressPoint("restored-pickup", pickupAddress, pickupAddress, it.latitude, it.longitude, source = BookingAddressPoint.Source.MANUAL)
        },
        pickupLocation = pickup,
        pickupAddress = pickupAddress,
        destinationPoint = destination?.let {
            BookingAddressPoint("restored-destination", destinationAddress, destinationAddress, it.latitude, it.longitude, source = BookingAddressPoint.Source.MANUAL)
        },
        destinationLocation = destination,
        destinationAddress = destinationAddress,
        packageLength = packageLength,
        packageWidth = packageWidth,
        packageHeight = packageHeight,
        packageWeight = packageWeight,
        packageCategory = packageCategory,
        packageQuantity = packageQuantity,
        packageIsFragile = packageIsFragile,
        packageIsProhibited = packageIsProhibited,
        sizeTier = sizeTier,
        isPackageSizeSelected = isPackageSizeSelected,
        itemDescription = itemDescription,
        recipientName = recipientName,
        recipientPhone = recipientPhone,
        deliveryCodeEnabled = deliveryCodeEnabled,
        insuranceEnabled = insuranceEnabled,
        itemValue = itemValue,
        scheduleType = scheduleType,
        scheduledAt = scheduledAt,
        scheduledAtMillis = scheduledAtMillis,
        promoCode = promoCode,
        voucherCode = voucherCode
    )
}

@HiltViewModel
class BookingViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    val isAggregatorMode: Boolean = savedStateHandle.get<String>("mode") == "aggregator"

    private val _bookingState = MutableStateFlow(
        savedStateHandle.get<String>(BOOKING_DRAFT_KEY)
            ?.let { encoded -> runCatching { bookingDraftJson.decodeFromString<BookingDraft>(encoded).toBookingState() }.getOrNull() }
            ?: BookingState()
    )
    val bookingState: StateFlow<BookingState> = _bookingState.asStateFlow()

    private val _bookingSuccess = MutableSharedFlow<String>()
    val bookingSuccess = _bookingSuccess.asSharedFlow()
    private var routeCalculationVersion = 0
    private var createOrderIdempotencyKey: String? = null
    private var pendingPackagePhotoOrderId: String? = null
    private var pendingPackagePhotoUploads: List<PackagePhotoUploadPayload> = emptyList()

    private fun persistBookingDraft(state: BookingState) {
        val draft = state.toBookingDraft()
        val hasInput = draft.pickupAddress.isNotBlank() || draft.destinationAddress.isNotBlank() ||
            draft.recipientName.isNotBlank() || draft.itemDescription.isNotBlank() ||
            draft.sizeTier.isNotBlank() || draft.promoCode.isNotBlank() || draft.voucherCode.isNotBlank()
        if (hasInput) {
            savedStateHandle[BOOKING_DRAFT_KEY] = bookingDraftJson.encodeToString(draft)
        }
    }

    private fun PriceBreakdown.hasRoadRoute(): Boolean {
        val polyline = routeSnapshot?.routePolyline?.trim().orEmpty()
        val provider = routeSnapshot?.provider.orEmpty()
        return polyline.isNotBlank() &&
            !provider.contains("haversine", ignoreCase = true) &&
            (routeSnapshot?.distanceKm ?: distanceKm) > 0.0
    }

    init {
        viewModelScope.launch {
            bookingState.collect { persistBookingDraft(it) }
        }
        loadServices()
        loadAddressBook()
        loadMapsProviderConfig()
        if (isAggregatorMode) {
            loadAggregatorProviders()
            loadAggregatorPackageCategories()
        }
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
                    mapsProviderError = e.localizedMessage ?: "Konfigurasi peta sedang disinkronkan."
                )
            }
        }
    }

    fun loadAddressBook() {
        viewModelScope.launch {
            val result = orderRepository.getCustomerAddresses()
            result.onSuccess { addresses ->
                _bookingState.value = _bookingState.value.copy(addressBook = addresses)
                if (isAggregatorMode) initializeAggregatorFromAddressBook(addresses)
            }
        }
    }

    private fun initializeAggregatorFromAddressBook(addresses: List<CustomerAddress>) {
        val current = _bookingState.value
        val pickupAddress = addresses.firstOrNull { address ->
            address.kind.equals("pickup", ignoreCase = true) || address.kind.equals("sender", ignoreCase = true)
        } ?: addresses.firstOrNull()
        val destinationAddress = addresses.firstOrNull { address ->
            address.id != pickupAddress?.id && address.kind.equals("receiver", ignoreCase = true)
        } ?: addresses.firstOrNull { it.id != pickupAddress?.id }

        fun CustomerAddress.toPoint() = BookingAddressPoint(
            id = id,
            label = label,
            address = address,
            latitude = lat,
            longitude = lng,
            receiverName = contactName,
            contactPhone = contactPhoneMasked,
            instruction = notes,
            source = BookingAddressPoint.Source.SAVED,
        )

        val resolvedPickup = current.pickupPoint ?: pickupAddress?.toPoint()
        val resolvedDestination = current.destinationPoint ?: destinationAddress?.toPoint()
        _bookingState.value = current.copy(
            pickupPoint = resolvedPickup,
            pickupLocation = current.pickupLocation ?: resolvedPickup?.asLatLng(),
            pickupAddress = current.pickupAddress.ifBlank { resolvedPickup?.address.orEmpty() },
            destinationPoint = resolvedDestination,
            destinationLocation = current.destinationLocation ?: resolvedDestination?.asLatLng(),
            destinationAddress = current.destinationAddress.ifBlank { resolvedDestination?.address.orEmpty() },
            recipientName = current.recipientName.ifBlank { resolvedDestination?.receiverName.orEmpty() },
        )
    }

    fun loadServices() {
        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(isLoading = true, error = null)
            orderRepository.getCustomerDeliveryServices().collectLatest { result ->
                result.onSuccess { services ->
                    val category = if (isAggregatorMode) "aggregator" else "on_demand"
                    val availableServices = services
                        .filter { it.serviceCategory == category && it.isEnabled }
                        .filter { !it.requiresDimensionScan || it.allowsManualDimension }
                        .sortedBy { it.displayOrder }
                    _bookingState.value = _bookingState.value.copy(
                        isLoading = false,
                        services = availableServices,
                        selectedServiceCode = _bookingState.value.selectedServiceCode
                            .takeIf { selectedCode -> availableServices.any { it.code == selectedCode } }
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

    fun setPickup(location: LatLng, address: String, point: BookingAddressPoint? = null) {
        if (!location.isUsableBookingCoordinate() || address.isBlank()) {
            _bookingState.value = _bookingState.value.copy(error = "Pilih alamat pickup dengan titik koordinat yang valid.")
            return
        }
        val resolvedPoint = point ?: BookingAddressPoint(
            id = "pickup-${System.currentTimeMillis()}",
            label = address,
            address = address,
            latitude = location.latitude,
            longitude = location.longitude,
            source = BookingAddressPoint.Source.MANUAL
        )
        _bookingState.value = _bookingState.value.copy(
            pickupPoint = resolvedPoint,
            pickupLocation = location,
            pickupAddress = address,
            selectedServiceCode = "",
            estimatedPrice = 0,
            priceBreakdowns = emptyMap()
        )
        calculateRoute()
    }

    fun setDestination(location: LatLng, address: String, point: BookingAddressPoint? = null) {
        if (!location.isUsableBookingCoordinate() || address.isBlank()) {
            _bookingState.value = _bookingState.value.copy(error = "Pilih alamat tujuan dengan titik koordinat yang valid.")
            return
        }
        val resolvedPoint = point ?: BookingAddressPoint(
            id = "dropoff-${System.currentTimeMillis()}",
            label = address,
            address = address,
            latitude = location.latitude,
            longitude = location.longitude,
            source = BookingAddressPoint.Source.MANUAL
        )
        _bookingState.value = _bookingState.value.copy(
            destinationPoint = resolvedPoint,
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
        val point = BookingAddressPoint(
            id = savedAddress.id,
            label = savedAddress.label,
            address = savedAddress.address,
            latitude = savedAddress.lat,
            longitude = savedAddress.lng,
            receiverName = savedAddress.contactName,
            contactPhone = savedAddress.contactPhoneMasked,
            instruction = savedAddress.notes,
            source = BookingAddressPoint.Source.SAVED
        )
        if (asPickup) {
            setPickup(location, savedAddress.address, point)
        } else {
            setDestination(location, savedAddress.address, point)
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
        val location = LatLng(result.latitude, result.longitude)
        if (!location.isUsableBookingCoordinate()) {
            _bookingState.value = _bookingState.value.copy(geocodeError = "Hasil alamat tidak memiliki titik koordinat yang valid.")
            return
        }
        _bookingState.value = _bookingState.value.copy(
            mapPickerLocation = location,
            mapPickerAddress = result.label,
            geocodeError = null
        )
    }

    fun selectMapPoint(location: LatLng) {
        if (!location.isUsableBookingCoordinate()) {
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
                    mapPickerLocation = LatLng(address.latitude, address.longitude).takeIf { it.isUsableBookingCoordinate() },
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
            packageWeight = _bookingState.value.packageWeight.takeIf { it > 0.0 } ?: 1.0,
            sizeTier = _bookingState.value.sizeTier.ifBlank { "custom" },
            isPackageSizeSelected = true,
            dimensionsScanned = true,
            selectedServiceCode = "",
            estimatedPrice = 0,
            priceBreakdowns = emptyMap()
        )
        calculateRoute()
    }

    fun setCustomPackage(weight: String, length: String, width: String, height: String) {
        val normalizedWeight = weight.replace(',', '.').toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
        val normalizedLength = length.toIntOrNull()?.coerceAtLeast(0) ?: 0
        val normalizedWidth = width.toIntOrNull()?.coerceAtLeast(0) ?: 0
        val normalizedHeight = height.toIntOrNull()?.coerceAtLeast(0) ?: 0
        _bookingState.value = _bookingState.value.copy(
            packageWeight = normalizedWeight,
            packageLength = normalizedLength,
            packageWidth = normalizedWidth,
            packageHeight = normalizedHeight,
            sizeTier = "custom",
            isPackageSizeSelected = normalizedWeight > 0.0 && normalizedLength > 0 && normalizedWidth > 0 && normalizedHeight > 0,
            dimensionsScanned = false,
            selectedServiceCode = "",
            aggregatorSelectedQuoteId = null,
            estimatedPrice = 0,
            priceBreakdowns = emptyMap(),
            aggregatorQuotes = emptyList()
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

    fun selectAggregatorQuote(quoteId: String) {
        val state = _bookingState.value
        val quote = state.aggregatorQuotes.firstOrNull { it.quoteId == quoteId } ?: return
        val aggregatorServiceCode = state.services.firstOrNull()?.code.orEmpty()
        if (aggregatorServiceCode.isBlank()) return
        val price = state.priceBreakdowns[quoteId]?.totalPriceIdr ?: quote.customerTariffIdr
        _bookingState.value = state.copy(
            selectedServiceCode = aggregatorServiceCode,
            aggregatorSelectedQuoteId = quote.quoteId,
            estimatedPrice = price
        )
    }

    fun loadAggregatorProviders() {
        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(aggregatorQuoteLoading = true, aggregatorError = null)
            orderRepository.getCustomerLogisticsProviders().fold(
                onSuccess = { providers ->
                    val selected = providers.firstOrNull { it.available }?.code.orEmpty()
                    val currentProvider = _bookingState.value.aggregatorProvider
                        .takeIf { current -> providers.any { it.code == current } }
                        ?: selected
                    _bookingState.value = _bookingState.value.copy(
                        aggregatorProviders = providers,
                        aggregatorProvider = currentProvider,
                        aggregatorQuoteLoading = false,
                        aggregatorError = null
                    )
                    if (currentProvider.isNotBlank()) {
                        loadAggregatorLocations(currentProvider)
                    }
                },
                onFailure = { error ->
                    _bookingState.value = _bookingState.value.copy(
                        aggregatorQuoteLoading = false,
                        aggregatorError = error.localizedMessage ?: "Provider ekspedisi belum tersedia."
                    )
                }
            )
        }
    }

    fun loadAggregatorPackageCategories() {
        viewModelScope.launch {
            orderRepository.getCustomerAggregatorPackageCategories()
                .onSuccess { categories ->
                    _bookingState.value = _bookingState.value.copy(
                        aggregatorPackageCategories = categories,
                        aggregatorPackageCategoriesError = null,
                        packageCategory = _bookingState.value.packageCategory
                            .takeIf { current -> categories.any { it.code == current } }
                            ?: categories.firstOrNull()?.code.orEmpty()
                    )
                    calculateRoute()
                }
                .onFailure { error ->
                    _bookingState.value = _bookingState.value.copy(
                        aggregatorPackageCategoriesError = error.localizedMessage
                            ?: "Kategori paket belum tersedia dari server."
                    )
                }
        }
    }

    fun selectAggregatorProvider(provider: String) {
        val normalized = provider.trim().lowercase()
        if (normalized.isBlank()) return
        _bookingState.value = _bookingState.value.copy(
            aggregatorProvider = normalized,
            aggregatorQuotes = emptyList(),
            aggregatorSelectedQuoteId = null,
            selectedServiceCode = "",
            priceBreakdowns = emptyMap(),
            estimatedPrice = 0,
            aggregatorError = null
        )
        loadAggregatorLocations(normalized)
    }

    private fun loadAggregatorLocations(provider: String) {
        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(aggregatorQuoteLoading = true, aggregatorError = null)
            orderRepository.getCustomerLogisticsLocations(provider).fold(
                onSuccess = { locations ->
                    val origin = _bookingState.value.aggregatorOriginCode.ifBlank {
                        locations.firstOrNull { it.name.contains("Jakarta", ignoreCase = true) || it.code.startsWith("CGK") }?.code ?: locations.firstOrNull()?.code.orEmpty()
                    }
                    val dest = _bookingState.value.aggregatorDestinationCode.ifBlank {
                        locations.firstOrNull { it.code != origin }?.code ?: origin
                    }
                    _bookingState.value = _bookingState.value.copy(
                        aggregatorLocations = locations,
                        aggregatorOriginCode = origin,
                        aggregatorDestinationCode = dest,
                        aggregatorQuoteLoading = false,
                        aggregatorError = null
                    )
                    calculateRoute()
                },
                onFailure = { error ->
                    _bookingState.value = _bookingState.value.copy(
                        aggregatorQuoteLoading = false,
                        aggregatorError = error.localizedMessage ?: "Area ekspedisi belum tersedia."
                    )
                }
            )
        }
    }

    fun selectAggregatorLocation(code: String, origin: Boolean) {
        val next = if (origin) {
            _bookingState.value.copy(aggregatorOriginCode = code)
        } else {
            _bookingState.value.copy(aggregatorDestinationCode = code)
        }
        _bookingState.value = next.copy(
            aggregatorQuotes = emptyList(),
            aggregatorSelectedQuoteId = null,
            selectedServiceCode = "",
            priceBreakdowns = emptyMap(),
            estimatedPrice = 0,
            aggregatorError = null
        )
        calculateRoute()
    }

    fun setSizeTier(code: String, weightKg: Double, dimensions: DimensionsPayload) {
        _bookingState.value = _bookingState.value.copy(
            sizeTier = code,
            packageWeight = weightKg,
            packageLength = dimensions.length,
            packageWidth = dimensions.width,
            packageHeight = dimensions.height,
            isPackageSizeSelected = true,
            dimensionsScanned = false,
            selectedServiceCode = "",
            estimatedPrice = 0,
            priceBreakdowns = emptyMap()
        )
        calculateRoute()
    }

    fun setRecipientName(value: String) {
        invalidateQuote { copy(recipientName = value) }
    }

    fun setRecipientPhone(value: String) {
        invalidateQuote { copy(recipientPhone = value) }
    }

    fun setItemDescription(value: String) {
        invalidateQuote { copy(itemDescription = value) }
    }

    fun setPackageCategory(value: String) {
        invalidateQuote { copy(packageCategory = value) }
    }

    fun setPackageQuantity(value: String) {
        val quantity = value.toIntOrNull()?.coerceIn(1, 100) ?: 1
        invalidateQuote { copy(packageQuantity = quantity) }
    }

    fun setPackageFragile(value: Boolean) {
        invalidateQuote { copy(packageIsFragile = value) }
    }

    fun setPackageProhibited(value: Boolean) {
        invalidateQuote { copy(packageIsProhibited = value) }
    }

    fun setItemValue(value: String) {
        val itemValue = value.filter(Char::isDigit).toLongOrNull()?.coerceAtLeast(0) ?: 0
        invalidateQuote { copy(itemValue = itemValue) }
    }

    private fun invalidateQuote(update: BookingState.() -> BookingState) {
        _bookingState.value = _bookingState.value.update().copy(
            selectedServiceCode = "",
            estimatedPrice = 0,
            priceBreakdowns = emptyMap()
        )
        calculateRoute()
    }

    fun setPromoCode(value: String?) {
        val normalized = value
            ?.trim()
            ?.uppercase()
            ?.filter { it.isLetterOrDigit() || it == '_' || it == '-' }
            ?.take(32)
            .orEmpty()
        _bookingState.value = _bookingState.value.copy(promoCode = normalized)
    }

    fun clearPromoCode() {
        _bookingState.value = _bookingState.value.copy(promoCode = "")
    }

    // ── FB-078: Voucher redeem ──
    fun setVoucherCode(value: String) {
        val normalized = value.trim().uppercase()
            .filter { it.isLetterOrDigit() || it == '_' || it == '-' }
            .take(32)
        _bookingState.value = _bookingState.value.copy(voucherCode = normalized)
    }

    fun clearVoucher() {
        _bookingState.value = _bookingState.value.copy(
            voucherCode = "",
            voucherDiscountIdr = 0,
            voucherName = "",
            voucherApplied = false,
            voucherError = null
        )
    }

    fun validateVoucher() {
        val state = _bookingState.value
        val code = state.voucherCode.trim()
        if (code.isEmpty()) {
            clearVoucher()
            return
        }
        val base = state.estimatedPrice
        if (base <= 0) {
            _bookingState.value = state.copy(
                voucherError = "Hitung estimasi harga dulu sebelum pakai voucher.",
                voucherApplied = false
            )
            return
        }
        viewModelScope.launch {
            _bookingState.value = state.copy(voucherLoading = true, voucherError = null)
            orderRepository.validateVoucher(code, base).fold(
                onSuccess = { v ->
                    _bookingState.value = _bookingState.value.copy(
                        voucherLoading = false,
                        voucherApplied = true,
                        voucherName = v.name,
                        voucherDiscountIdr = v.discountIdr,
                        voucherError = null
                    )
                },
                onFailure = { e ->
                    _bookingState.value = _bookingState.value.copy(
                        voucherLoading = false,
                        voucherApplied = false,
                        voucherError = e.localizedMessage ?: "Voucher tidak valid"
                    )
                }
            )
        }
    }

    fun toggleDeliveryCode(enabled: Boolean) {
        invalidateQuote { copy(deliveryCodeEnabled = enabled) }
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

    fun setScheduleNow() {
        _bookingState.value = _bookingState.value.copy(
            scheduleType = "now",
            scheduledAt = null,
            scheduledAtMillis = null,
            error = null,
        )
    }

    fun setScheduledAt(epochMillis: Long) {
        if (!PackageOrderFlowPolicy.scheduledAtValid(epochMillis, System.currentTimeMillis())) {
            _bookingState.value = _bookingState.value.copy(
                error = "Pilih waktu pickup minimal 30 menit dari sekarang.",
            )
            return
        }
        val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).format(Date(epochMillis))
        _bookingState.value = _bookingState.value.copy(
            scheduleType = "scheduled",
            scheduledAt = iso,
            scheduledAtMillis = epochMillis,
            error = null,
        )
    }

    private fun calculateRoute() {
        val state = _bookingState.value
        if (isAggregatorMode) {
            calculateAggregatorQuotes(state)
            return
        }
        if (
            state.pickupLocation != null &&
            state.destinationLocation != null &&
            state.services.isNotEmpty() &&
            state.isPackageSizeSelected &&
            state.sizeTier.isNotBlank() &&
            state.packageWeight > 0.0 &&
            state.packageLength > 0 &&
            state.packageWidth > 0 &&
            state.packageHeight > 0
        ) {
            val calculationVersion = ++routeCalculationVersion
            _bookingState.value = state.copy(
                isCalculatingRoute = true,
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
                        sizeTier = state.sizeTier,
                        packageDetails = PackageDetailsPayload(
                            sizeTier = state.sizeTier,
                            weightKg = state.packageWeight,
                            dimensions = dimensions,
                            dimensionsScanned = state.dimensionsScanned,
                            requiresDeliveryCode = state.deliveryCodeEnabled,
                            itemDescription = state.itemDescription,
                            category = state.packageCategory,
                            quantity = state.packageQuantity,
                            itemValueIdr = state.itemValue,
                            isFragile = state.packageIsFragile,
                            isProhibited = state.packageIsProhibited
                        ),
                        recipientName = state.recipientName,
                        recipientPhone = state.recipientPhone
                    )
                )
                val estimates = estimateResult.getOrNull()
                    ?.filter { it.hasRoadRoute() }
                    ?.associateBy { it.serviceCode }
                    .orEmpty()
                val firstError = estimateResult.exceptionOrNull()?.localizedMessage
                    ?: if (estimates.isEmpty()) "Rute jalan sedang dihitung. Pilih alamat yang lebih spesifik." else null

                if (calculationVersion != routeCalculationVersion) {
                    return@launch
                }

                val preferredCode = when {
                    state.selectedServiceCode.isNotBlank() && estimates.containsKey(state.selectedServiceCode) -> state.selectedServiceCode
                    else -> ""
                }
                _bookingState.value = _bookingState.value.copy(
                    isCalculatingRoute = false,
                    priceBreakdowns = estimates,
                    selectedServiceCode = preferredCode,
                    estimatedPrice = estimates[preferredCode]?.totalPriceIdr ?: 0,
                    error = if (estimates.isEmpty()) {
                        firstError ?: "Rute jalan sedang dihitung. Coba pilih alamat yang lebih spesifik."
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

    private fun calculateAggregatorQuotes(state: BookingState) {
        val aggregatorServiceCode = state.services.firstOrNull()?.code.orEmpty()
        if (
            !state.isPackageReady() ||
            state.aggregatorProvider.isBlank() ||
            state.aggregatorOriginCode.isBlank() ||
            state.aggregatorDestinationCode.isBlank() ||
            state.packageCategory.isBlank() ||
            aggregatorServiceCode.isBlank()
        ) {
            routeCalculationVersion++
            _bookingState.value = state.copy(
                isCalculatingRoute = false,
                aggregatorQuoteLoading = false,
                aggregatorQuotes = emptyList(),
                aggregatorSelectedQuoteId = null,
                selectedServiceCode = "",
                estimatedPrice = 0,
                priceBreakdowns = emptyMap()
            )
            return
        }

        val calculationVersion = ++routeCalculationVersion
        _bookingState.value = state.copy(
            isCalculatingRoute = true,
            aggregatorQuoteLoading = true,
            aggregatorError = null
        )
        viewModelScope.launch {
            val dimensions = DimensionsPayload(state.packageLength, state.packageWidth, state.packageHeight)
            val tariffResult = orderRepository.checkCustomerLogisticsTariff(
                provider = state.aggregatorProvider,
                originCode = state.aggregatorOriginCode,
                destinationCode = state.aggregatorDestinationCode,
                weightKg = state.packageWeight,
                dimensions = dimensions,
                itemValueIdr = state.itemValue,
                category = state.packageCategory,
                insurance = state.insuranceEnabled
            )
            if (calculationVersion != routeCalculationVersion) return@launch
            tariffResult.fold(
                onSuccess = { tariff ->
                    val mapped = tariff.services.filter { it.quoteId.isNotBlank() && it.customerTariffIdr > 0 }
                    val breakdowns = mapped.associate { quote ->
                        quote.quoteId to PriceBreakdown(
                            quoteId = quote.quoteId,
                            expiresAt = tariff.expiresAt,
                            serviceCode = aggregatorServiceCode,
                            serviceName = quote.serviceName,
                            distanceKm = 0.0,
                            actualWeightKg = state.packageWeight,
                            chargeableWeightKg = tariff.chargeableWeightKg,
                            etaMinutes = 0,
                            totalPriceIdr = quote.customerTariffIdr,
                            basePriceIdr = quote.customerTariffIdr
                        )
                    }
                    val selectedQuote = mapped.firstOrNull()
                    _bookingState.value = _bookingState.value.copy(
                        isCalculatingRoute = false,
                        aggregatorQuoteLoading = false,
                        aggregatorQuotes = mapped,
                        aggregatorSelectedQuoteId = selectedQuote?.quoteId,
                        selectedServiceCode = aggregatorServiceCode,
                        priceBreakdowns = breakdowns,
                        estimatedPrice = selectedQuote?.customerTariffIdr ?: 0,
                        aggregatorError = if (mapped.isEmpty()) "Ekspedisi belum mengembalikan layanan untuk rute ini." else null,
                        error = null
                    )
                },
                onFailure = { error ->
                    _bookingState.value = _bookingState.value.copy(
                        isCalculatingRoute = false,
                        aggregatorQuoteLoading = false,
                        aggregatorQuotes = emptyList(),
                        aggregatorSelectedQuoteId = null,
                        selectedServiceCode = "",
                        priceBreakdowns = emptyMap(),
                        estimatedPrice = 0,
                        aggregatorError = error.localizedMessage ?: "Gagal mengambil tarif ekspedisi."
                    )
                }
            )
        }
    }

    fun setPackagePhotoUploads(uploads: List<PackagePhotoUploadPayload>) {
        pendingPackagePhotoUploads = uploads.take(3)
        _bookingState.value = _bookingState.value.copy(
            packagePhotoUploadError = null,
            packagePhotoUploadCount = 0,
            packagePhotoUploadTotal = pendingPackagePhotoUploads.size
        )
    }

    fun retryPackagePhotoUploads() {
        if (pendingPackagePhotoOrderId.isNullOrBlank() || pendingPackagePhotoUploads.isEmpty() || _bookingState.value.isLoading) return
        viewModelScope.launch { uploadPendingPackagePhotos() }
    }

    private suspend fun uploadPendingPackagePhotos() {
        val orderId = pendingPackagePhotoOrderId ?: return
        val uploads = pendingPackagePhotoUploads
        _bookingState.value = _bookingState.value.copy(
            isLoading = true,
            packagePhotoUploadError = null,
            packagePhotoUploadCount = 0,
            packagePhotoUploadTotal = uploads.size
        )

        uploads.forEachIndexed { index, upload ->
            val requestBody = upload.bytes.toRequestBody(upload.mimeType.toMediaTypeOrNull())
            val part = MultipartBody.Part.createFormData("file", upload.fileName, requestBody)
            val result = orderRepository.uploadPackagePhoto(orderId, part)
            if (result.isFailure) {
                _bookingState.value = _bookingState.value.copy(
                    isLoading = false,
                    packagePhotoUploadError = result.exceptionOrNull()?.message
                        ?: "Foto paket ke-${index + 1} belum tersimpan. Coba lagi.",
                    packagePhotoUploadCount = index
                )
                return
            }
            _bookingState.value = _bookingState.value.copy(packagePhotoUploadCount = index + 1)
        }

        pendingPackagePhotoOrderId = null
        pendingPackagePhotoUploads = emptyList()
        _bookingState.value = _bookingState.value.copy(isLoading = false, packagePhotoUploadError = null)
        createOrderIdempotencyKey = null
        _bookingSuccess.emit(orderId)
    }

    fun confirmBooking() {
        val state = _bookingState.value
        if (!PackageOrderFlowPolicy.shouldSubmitCreate(state.isLoading)) return
        if (state.pickupLocation == null || state.destinationLocation == null) {
            _bookingState.value = state.copy(error = "Lengkapi rute penjemputan dan tujuan.")
            return
        }
        if (
            !state.isPackageSizeSelected ||
            state.sizeTier.isBlank() ||
            state.packageWeight <= 0.0 ||
            state.packageLength <= 0 ||
            state.packageWidth <= 0 ||
            state.packageHeight <= 0
        ) {
            _bookingState.value = state.copy(error = "Pilih ukuran dan berat paket terlebih dahulu.")
            return
        }
        val priceBreakdown = state.priceBreakdowns[state.selectedServiceCode]
            ?: state.aggregatorSelectedQuoteId?.let { state.priceBreakdowns[it] }
        if (priceBreakdown == null) {
            _bookingState.value = state.copy(error = "Pilih layanan dan hitung harga terlebih dahulu.")
            return
        }
        if (PackageOrderFlowPolicy.quoteExpired(priceBreakdown.expiresAt)) {
            _bookingState.value = state.copy(error = "Harga paket sudah kedaluwarsa. Menghitung ulang harga terbaru…")
            calculateRoute()
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
        if (state.packageCategory.trim().isBlank()) {
            _bookingState.value = state.copy(error = "Pilih kategori barang agar fakta paket tercatat dengan benar.")
            return
        }
        if (state.packageIsProhibited) {
            _bookingState.value = state.copy(error = "Barang terlarang tidak dapat dikirim melalui TEMBUS.")
            return
        }
        val aggregatorQuote = if (isAggregatorMode) {
            state.aggregatorQuotes.firstOrNull { it.quoteId == state.aggregatorSelectedQuoteId }
                ?: state.aggregatorQuotes.firstOrNull()
        } else null
        if (isAggregatorMode && aggregatorQuote == null) {
            _bookingState.value = state.copy(error = "Pilih layanan ekspedisi sebelum melanjutkan.")
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
                    itemDescription = state.itemDescription,
                    category = state.packageCategory,
                    quantity = state.packageQuantity,
                    itemValueIdr = state.itemValue,
                    isFragile = state.packageIsFragile,
                    isProhibited = state.packageIsProhibited
                ),
                hasInsurance = state.insuranceEnabled,
                itemValue = state.itemValue,
                scheduleType = state.scheduleType,
                scheduledAt = state.scheduledAt,
                customerNotes = state.itemDescription,
                priceBreakdown = priceBreakdown,
                serviceCode = state.selectedServiceCode,
                logisticsProvider = if (isAggregatorMode) state.aggregatorProvider else null,
                logisticsServiceType = aggregatorQuote?.serviceCode,
                aggregatorQuoteId = aggregatorQuote?.quoteId,
                originCode = if (isAggregatorMode) state.aggregatorOriginCode else null,
                destinationCode = if (isAggregatorMode) state.aggregatorDestinationCode else null,
                promoCode = state.promoCode.ifBlank { null },
                voucherCode = if (state.voucherApplied) state.voucherCode else null, // FB-078
                quoteId = priceBreakdown.quoteId,
                quoteInputFingerprint = priceBreakdown.inputFingerprint,
                quoteSnapshotHash = priceBreakdown.snapshotHash ?: priceBreakdown.routeSnapshot?.snapshotHash,
                quoteExpiresAt = priceBreakdown.expiresAt
            )

            val idempotencyKey = createOrderIdempotencyKey ?: UUID.randomUUID().toString().also { createOrderIdempotencyKey = it }
            orderRepository.createCustomerOnDemandOrder(req, idempotencyKey).collectLatest { result ->
                result.onSuccess { order ->
                    savedStateHandle.remove<String>(BOOKING_DRAFT_KEY)
                    if (isAggregatorMode && pendingPackagePhotoUploads.isNotEmpty()) {
                        pendingPackagePhotoOrderId = order.id
                        uploadPendingPackagePhotos()
                    } else {
                        _bookingState.value = _bookingState.value.copy(isLoading = false)
                        createOrderIdempotencyKey = null
                        _bookingSuccess.emit(order.id)
                    }
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
                val submittedPoint = if (lat != null && lng != null) LatLng(lat, lng) else null
                if (link.status == "submitted" && submittedPoint?.isUsableBookingCoordinate() == true && submittedAddress.isNotBlank()) {
                    _bookingState.value = _bookingState.value.copy(
                        receiverLocationLink = link,
                        isCreatingLocationLink = false,
                        destinationPoint = BookingAddressPoint(
                            id = "receiver-link-${link.id}",
                            label = "Lokasi penerima",
                            address = submittedAddress,
                            latitude = submittedPoint.latitude,
                            longitude = submittedPoint.longitude,
                            receiverName = link.submittedContactName,
                            contactPhone = link.submittedContactPhoneMasked,
                            instruction = link.submittedNotes,
                            source = BookingAddressPoint.Source.PINNED
                        ),
                        destinationLocation = submittedPoint,
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

    fun revokeReceiverLocationLink() {
        val linkId = _bookingState.value.receiverLocationLink?.id
        if (linkId.isNullOrBlank()) {
            _bookingState.value = _bookingState.value.copy(error = "Belum ada link lokasi yang bisa dibatalkan.")
            return
        }

        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(isCreatingLocationLink = true, error = null)
            val result = orderRepository.revokeReceiverLocationRequest(linkId)
            result.onSuccess { link ->
                _bookingState.value = _bookingState.value.copy(
                    receiverLocationLink = link,
                    isCreatingLocationLink = false,
                    error = "Link lokasi penerima sudah dibatalkan."
                )
            }
            result.onFailure { e ->
                _bookingState.value = _bookingState.value.copy(
                    isCreatingLocationLink = false,
                    error = e.localizedMessage ?: "Gagal membatalkan link lokasi penerima"
                )
            }
        }
    }

    fun clearError() {
        _bookingState.value = _bookingState.value.copy(error = null)
    }
}
