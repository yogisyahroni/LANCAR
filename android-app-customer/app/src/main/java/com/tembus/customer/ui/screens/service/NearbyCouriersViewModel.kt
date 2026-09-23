package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.NearbyCourier
import com.tembus.customer.data.model.NearbyCouriersResponse
import com.tembus.customer.data.model.PriceRange
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NearbyCouriersUiState(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val couriers: List<NearbyCourier> = emptyList(),
    val priceRange: PriceRange? = null,
    val searchRadiusKm: Double? = null,
    val searchRadiiKm: List<Double> = emptyList(),
    val lastUpdatedAt: String? = null,
    val error: String? = null
)

@HiltViewModel
class NearbyCouriersViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(NearbyCouriersUiState())
    val uiState: StateFlow<NearbyCouriersUiState> = _uiState.asStateFlow()
    private val refreshMutex = Mutex()

    fun loadNearbyCouriers(serviceSubType: String, lat: Double, lng: Double) {
        viewModelScope.launch {
            loadNearbyCouriersAwait(serviceSubType, lat, lng, showLoading = true)
        }
    }

    suspend fun loadNearbyCouriersAwait(
        serviceSubType: String,
        lat: Double,
        lng: Double,
        showLoading: Boolean,
    ) {
        refreshMutex.withLock {
            _uiState.update {
                it.copy(
                    isLoading = showLoading && it.couriers.isEmpty(),
                    isRefreshing = true,
                    error = null,
                )
            }

            orderRepository.getNearbyCouriers(serviceSubType, lat, lng)
                .onSuccess { response ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            couriers = response.couriers,
                            priceRange = response.priceRange,
                            searchRadiusKm = response.searchRadiusKm,
                            searchRadiiKm = response.searchRadiiKm,
                            lastUpdatedAt = response.lastUpdatedAt,
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            error = e.message ?: "Gagal memuat data petugas",
                        )
                    }
                }
        }
    }
}
