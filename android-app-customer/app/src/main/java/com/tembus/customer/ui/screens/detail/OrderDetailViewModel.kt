package com.tembus.customer.ui.screens.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class OrderDetailUiState {
    object Idle : OrderDetailUiState()
    object Loading : OrderDetailUiState()
    data class Success(val order: Order) : OrderDetailUiState()
    data class Error(val message: String) : OrderDetailUiState()
}

@HiltViewModel
class OrderDetailViewModel @Inject constructor(
    private val repository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<OrderDetailUiState>(OrderDetailUiState.Idle)
    val uiState: StateFlow<OrderDetailUiState> = _uiState.asStateFlow()

    fun fetchOrderDetail(orderId: String) {
        viewModelScope.launch {
            _uiState.value = OrderDetailUiState.Loading
            repository.getOrderDetail(orderId).collectLatest { result ->
                result.onSuccess { order ->
                    _uiState.value = OrderDetailUiState.Success(order)
                }
                result.onFailure { error ->
                    _uiState.value = OrderDetailUiState.Error(error.localizedMessage ?: "Order tidak ditemukan")
                }
            }
        }
    }
}
