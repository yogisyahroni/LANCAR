package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.CustomerOrderCreateRequest
import com.tembus.customer.data.model.CustomerPriceEstimateRequest
import com.tembus.customer.data.model.DimensionsPayload
import com.tembus.customer.data.model.LocationPayload
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
    val orderId: String? = null
)

data class ServicePriceEstimate(
    val courierServicePrice: Long = 0,
    val perKmRate: Long = 0,
    val distanceKm: Double = 0.0,
    val baseFare: Long = 0,
    val totalPrice: Long = 0
)

@HiltViewModel
class ServiceBookingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServiceBookingUiState())
    val uiState: StateFlow<ServiceBookingUiState> = _uiState.asStateFlow()

    fun fetchEstimate(serviceSubType: String, lat: Double, lng: Double) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val req = CustomerPriceEstimateRequest(
                pickup = LocationPayload(lat, lng),
                dropoff = LocationPayload(lat, lng),
                dimensions = DimensionsPayload(0, 0, 0),
                weightKg = 0.0,
                serviceCode = serviceSubType
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
                                distanceKm = breakdown.distanceKm
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
        customerLat: Double,
        customerLng: Double,
        customerAddress: String
    ) {
        val breakdown = _uiState.value.rawPriceBreakdown
        if (breakdown == null) {
            _uiState.update { it.copy(error = "Estimasi harga belum tersedia") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            val itemDesc = "Kendaraan: $vehicleType\nKerusakan: $damageType\nCatatan: $notes"
            
            val req = CustomerOrderCreateRequest(
                pickupAddress = customerAddress,
                pickupLocation = LocationPayload(customerLat, customerLng),
                dropoffAddress = customerAddress,
                dropoffLocation = LocationPayload(customerLat, customerLng),
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
                serviceCode = serviceSubType
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
