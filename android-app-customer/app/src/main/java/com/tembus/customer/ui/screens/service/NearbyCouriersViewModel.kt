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
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NearbyCouriersUiState(
    val isLoading: Boolean = false,
    val couriers: List<NearbyCourier> = emptyList(),
    val priceRange: PriceRange? = null,
    val error: String? = null
)

@HiltViewModel
class NearbyCouriersViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(NearbyCouriersUiState())
    val uiState: StateFlow<NearbyCouriersUiState> = _uiState.asStateFlow()

    fun loadNearbyCouriers(serviceSubType: String, lat: Double, lng: Double) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            orderRepository.getNearbyCouriers(serviceSubType, lat, lng)
                .onSuccess { response ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            couriers = response.couriers,
                            priceRange = response.priceRange
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = e.message ?: "Gagal memuat data petugas"
                        )
                    }
                }
        }
    }
}
