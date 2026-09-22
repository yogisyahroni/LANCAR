package com.tembus.customer.ui.screens.booking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.OrderTrackingDetail
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AggregatorEResiViewModel @Inject constructor(
    val orderRepository: OrderRepository
) : ViewModel() {

    private val _detail = MutableStateFlow<OrderTrackingDetail?>(null)
    val detail: StateFlow<OrderTrackingDetail?> = _detail.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    fun loadTracking(orderId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            orderRepository.getOrderTrackingDetail(orderId).fold(
                onSuccess = {
                    _detail.value = it
                    _isLoading.value = false
                },
                onFailure = {
                    _errorMessage.value = it.localizedMessage ?: "Gagal memuat status e-resi"
                    _isLoading.value = false
                }
            )
        }
    }
}
