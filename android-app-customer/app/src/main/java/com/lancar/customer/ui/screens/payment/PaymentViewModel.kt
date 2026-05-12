package com.lancar.customer.ui.screens.payment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class PaymentUiState {
    object Idle : PaymentUiState()
    object Loading : PaymentUiState()
    data class Success(val url: String) : PaymentUiState()
    data class Error(val message: String) : PaymentUiState()
}

@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val repository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<PaymentUiState>(PaymentUiState.Idle)
    val uiState: StateFlow<PaymentUiState> = _uiState.asStateFlow()

    fun startPayment(orderId: String) {
        viewModelScope.launch {
            _uiState.value = PaymentUiState.Loading
            repository.initiatePayment(orderId).collectLatest { result ->
                result.onSuccess { url ->
                    _uiState.value = PaymentUiState.Success(url)
                }
                result.onFailure { error ->
                    _uiState.value = PaymentUiState.Error(error.localizedMessage ?: "Gagal memproses pembayaran")
                }
            }
        }
    }
}
