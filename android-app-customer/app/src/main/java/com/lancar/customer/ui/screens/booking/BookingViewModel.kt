package com.lancar.customer.ui.screens.booking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.maps.model.LatLng
import com.lancar.customer.data.model.CustomerOrderCreateRequest
import com.lancar.customer.data.model.CustomerPriceEstimateRequest
import com.lancar.customer.data.model.DeliveryServiceProduct
import com.lancar.customer.data.model.DimensionsPayload
import com.lancar.customer.data.model.LocationPayload
import com.lancar.customer.data.model.PackageDetailsPayload
import com.lancar.customer.data.model.PriceBreakdown
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
    val pickupAddress: String = "Monas, Jakarta Pusat",
    val destinationLocation: LatLng? = null,
    val destinationAddress: String = "",
    val estimatedPrice: Long = 0,
    val isLoading: Boolean = false,
    val error: String? = null,
    val services: List<DeliveryServiceProduct> = emptyList(),
    val selectedServiceCode: String = "",
    val priceBreakdowns: Map<String, PriceBreakdown> = emptyMap(),
    val packageLength: Int = 40,
    val packageWidth: Int = 40,
    val packageHeight: Int = 17,
    val packageWeight: Double = 1.0,
    val sizeTier: String = "small",
    val itemDescription: String = "Paket on-demand",
    val recipientName: String = "",
    val recipientPhone: String = "",
    val deliveryCodeEnabled: Boolean = false,
    val insuranceEnabled: Boolean = false,
    val itemValue: Long = 0,
    val dimensionsScanned: Boolean = false
)

@HiltViewModel
class BookingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _bookingState = MutableStateFlow(BookingState())
    val bookingState: StateFlow<BookingState> = _bookingState.asStateFlow()

    private val _bookingSuccess = MutableSharedFlow<String>()
    val bookingSuccess = _bookingSuccess.asSharedFlow()

    init {
        val monas = LatLng(-6.175392, 106.827153)
        _bookingState.value = _bookingState.value.copy(pickupLocation = monas)
        loadServices()
    }

    fun loadServices() {
        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(isLoading = true, error = null)
            orderRepository.getCustomerDeliveryServices().collectLatest { result ->
                result.onSuccess { services ->
                    val onDemandServices = services
                        .filter { it.serviceCategory == "on_demand" && it.isEnabled }
                        .sortedBy { it.displayOrder }
                    _bookingState.value = _bookingState.value.copy(
                        isLoading = false,
                        services = onDemandServices,
                        selectedServiceCode = _bookingState.value.selectedServiceCode
                            .ifBlank { onDemandServices.firstOrNull()?.code.orEmpty() }
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
            pickupAddress = address
        )
        calculateRoute()
    }

    fun setDestination(location: LatLng, address: String) {
        _bookingState.value = _bookingState.value.copy(
            destinationLocation = location,
            destinationAddress = address
        )
        calculateRoute()
    }

    fun setDimensions(l: Int, w: Int, h: Int) {
        _bookingState.value = _bookingState.value.copy(
            packageLength = l,
            packageWidth = w,
            packageHeight = h,
            dimensionsScanned = true
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
            dimensionsScanned = true
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
        _bookingState.value = _bookingState.value.copy(insuranceEnabled = enabled)
        calculateRoute()
    }

    private fun calculateRoute() {
        val state = _bookingState.value
        if (state.pickupLocation != null && state.destinationLocation != null && state.services.isNotEmpty()) {
            viewModelScope.launch {
                val dimensions = DimensionsPayload(state.packageLength, state.packageWidth, state.packageHeight)
                val estimates = mutableMapOf<String, PriceBreakdown>()
                state.services.forEach { service ->
                    val estimate = orderRepository.calculateCustomerOrderPrice(
                        CustomerPriceEstimateRequest(
                            pickup = LocationPayload(state.pickupLocation.latitude, state.pickupLocation.longitude),
                            dropoff = LocationPayload(state.destinationLocation.latitude, state.destinationLocation.longitude),
                            dimensions = dimensions,
                            weightKg = state.packageWeight,
                            hasInsurance = state.insuranceEnabled,
                            itemValue = state.itemValue,
                            dimensionScanVerified = true,
                            serviceCode = service.code,
                            sizeTier = state.sizeTier
                        )
                    )
                    estimate.onSuccess { estimates[service.code] = it }
                }

                val selectedCode = state.selectedServiceCode.ifBlank { state.services.firstOrNull()?.code.orEmpty() }
                _bookingState.value = _bookingState.value.copy(
                    priceBreakdowns = estimates,
                    selectedServiceCode = selectedCode,
                    estimatedPrice = estimates[selectedCode]?.totalPriceIdr ?: 0
                )
            }
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

    fun clearError() {
        _bookingState.value = _bookingState.value.copy(error = null)
    }
}
