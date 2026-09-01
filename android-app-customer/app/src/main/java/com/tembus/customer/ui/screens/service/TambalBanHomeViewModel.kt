package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.CourierDetail
import com.tembus.customer.data.model.NearbyCourier
import com.tembus.customer.data.model.PriceRange
import com.tembus.customer.data.model.TambalBanHomeResponse
import com.tembus.customer.data.model.TambalBanServiceProduct
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TambalBanHomeUiState(
    val isLoading: Boolean = false,
    val services: List<TambalBanServiceProduct> = emptyList(),
    val couriers: List<NearbyCourier> = emptyList(),
    val priceRange: PriceRange? = null,
    val towingAlternatives: List<NearbyCourier> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class TambalBanHomeViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TambalBanHomeUiState())
    val uiState: StateFlow<TambalBanHomeUiState> = _uiState.asStateFlow()

    fun loadHome(lat: Double, lng: Double) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            orderRepository.getTambalBanHome(lat, lng)
                .onSuccess { response: TambalBanHomeResponse ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            services = response.services,
                            couriers = response.couriers,
                            priceRange = response.priceRange
                        )
                    }
                    val alternatives = buildList {
                        orderRepository.getNearbyCouriers("towing_motor", lat, lng)
                            .onSuccess { addAll(it.couriers) }
                        orderRepository.getNearbyCouriers("towing_mobil", lat, lng)
                            .onSuccess { addAll(it.couriers) }
                    }
                    _uiState.update { it.copy(towingAlternatives = alternatives.distinctBy { courier -> courier.courierId }) }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(isLoading = false, error = e.message ?: "Gagal memuat halaman tambal ban")
                    }
                }
        }
    }
}

data class CourierDetailUiState(
    val isLoading: Boolean = false,
    val detail: CourierDetail? = null,
    val error: String? = null
)

@HiltViewModel
class CourierDetailViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CourierDetailUiState())
    val uiState: StateFlow<CourierDetailUiState> = _uiState.asStateFlow()

    fun loadDetail(courierId: String, serviceSubType: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            orderRepository.getCourierDetail(courierId, serviceSubType)
                .onSuccess { detail ->
                    _uiState.update { it.copy(isLoading = false, detail = detail) }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(isLoading = false, error = e.message ?: "Gagal memuat detail petugas")
                    }
                }
        }
    }
}

data class TambalBanSearchUiState(
    val isLoading: Boolean = false,
    val query: String = "",
    val couriers: List<NearbyCourier> = emptyList(),
    val priceRange: PriceRange? = null,
    val error: String? = null
)

@HiltViewModel
class TambalBanSearchViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TambalBanSearchUiState())
    val uiState: StateFlow<TambalBanSearchUiState> = _uiState.asStateFlow()

    fun search(query: String, lat: Double, lng: Double, serviceSubType: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, query = query, error = null) }
            orderRepository.searchTambalBanCouriers(query, lat, lng, serviceSubType)
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
                        it.copy(isLoading = false, error = e.message ?: "Gagal mencari petugas")
                    }
                }
        }
    }

    fun clear() {
        _uiState.update { it.copy(query = "", couriers = emptyList(), priceRange = null, error = null) }
    }
}
