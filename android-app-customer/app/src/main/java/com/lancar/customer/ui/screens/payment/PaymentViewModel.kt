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
    data class Ready(val url: String, val status: String = "pending") : PaymentUiState()
    object Verifying : PaymentUiState()
    object Paid : PaymentUiState()
    data class Expired(val message: String) : PaymentUiState()
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
            repository.createCustomerPaymentSession(orderId).collectLatest { result ->
                result.onSuccess { payment ->
                    val status = payment.paymentStatus.ifBlank { payment.status }
                    val url = payment.redirectUrl
                    when {
                        status == "paid" -> _uiState.value = PaymentUiState.Paid
                        status == "expired" -> _uiState.value = PaymentUiState.Expired("Sesi pembayaran sudah kedaluwarsa. Silakan buat sesi baru.")
                        !url.isNullOrBlank() -> _uiState.value = PaymentUiState.Ready(url, status)
                        else -> _uiState.value = PaymentUiState.Error("Link pembayaran belum tersedia. Coba ulangi beberapa saat lagi.")
                    }
                }
                result.onFailure { error ->
                    _uiState.value = PaymentUiState.Error(error.localizedMessage ?: "Gagal memproses pembayaran")
                }
            }
        }
    }

    fun verifyPayment(orderId: String) {
        viewModelScope.launch {
            _uiState.value = PaymentUiState.Verifying
            val result = repository.confirmCustomerPayment(orderId)
            result.onSuccess { payment ->
                val status = payment.paymentStatus.ifBlank { payment.status }
                if (status == "paid" || payment.orderStatus == "pending") {
                    _uiState.value = PaymentUiState.Paid
                } else {
                    _uiState.value = PaymentUiState.Ready(payment.redirectUrl.orEmpty(), status)
                }
            }
            result.onFailure { error ->
                val statusResult = repository.getCustomerPaymentStatus(orderId)
                statusResult.onSuccess { payment ->
                    val status = payment.paymentStatus.ifBlank { payment.status }
                    when {
                        status == "paid" || payment.orderStatus == "pending" -> {
                            _uiState.value = PaymentUiState.Paid
                        }
                        status == "expired" -> _uiState.value = PaymentUiState.Expired("Sesi pembayaran sudah kedaluwarsa. Silakan buat sesi baru.")
                        !payment.redirectUrl.isNullOrBlank() -> _uiState.value = PaymentUiState.Ready(payment.redirectUrl, status)
                        else -> _uiState.value = PaymentUiState.Error(error.localizedMessage ?: "Pembayaran belum terkonfirmasi")
                    }
                }
                statusResult.onFailure {
                    _uiState.value = PaymentUiState.Error(error.localizedMessage ?: "Gagal mengecek pembayaran")
                }
            }
        }
    }
}
