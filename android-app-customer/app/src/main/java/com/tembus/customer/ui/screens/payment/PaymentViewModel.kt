package com.tembus.customer.ui.screens.payment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class CustomerPaymentMethod(val apiValue: String, val title: String, val description: String) {
    LAPAY(
        apiValue = "lapay",
        title = "LAPAY",
        description = "Bayar dari saldo TEMBUS. Saldo didebit otomatis lewat ledger."
    ),
    QRIS(
        apiValue = "qris",
        title = "QRIS",
        description = "Bayar dengan QRIS melalui gateway Midtrans yang terverifikasi."
    )
}

sealed class PaymentUiState {
    data class Choosing(
        val selectedMethod: CustomerPaymentMethod = CustomerPaymentMethod.LAPAY,
        val amountIdr: Long = 0L,
        val walletBalanceIdr: Long = 0L,
        val message: String? = null
    ) : PaymentUiState()
    data class Loading(val method: CustomerPaymentMethod) : PaymentUiState()
    data class Ready(val url: String, val status: String = "pending") : PaymentUiState()
    object Verifying : PaymentUiState()
    object Paid : PaymentUiState()
    data class Expired(val message: String, val selectedMethod: CustomerPaymentMethod) : PaymentUiState()
    data class Error(val message: String, val selectedMethod: CustomerPaymentMethod) : PaymentUiState()
}

@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val repository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<PaymentUiState>(PaymentUiState.Choosing())
    val uiState: StateFlow<PaymentUiState> = _uiState.asStateFlow()

    fun loadPaymentStatus(orderId: String) {
        viewModelScope.launch {
            val current = _uiState.value
            val selected = selectedMethodFrom(current)
            val result = repository.getCustomerPaymentStatus(orderId)
            result.onSuccess { payment ->
                val status = payment.paymentStatus.ifBlank { payment.status }
                when {
                    status == "paid" || payment.orderStatus == "pending" -> _uiState.value = PaymentUiState.Paid
                    status == "expired" -> _uiState.value = PaymentUiState.Choosing(
                        selectedMethod = selected,
                        amountIdr = payment.amountIdr,
                        walletBalanceIdr = payment.walletBalanceIdr,
                        message = "Sesi pembayaran sebelumnya kedaluwarsa. Pilih metode pembayaran lagi."
                    )
                    !payment.redirectUrl.isNullOrBlank() && payment.method.equals("QRIS", ignoreCase = true) -> {
                        _uiState.value = PaymentUiState.Choosing(
                            selectedMethod = CustomerPaymentMethod.QRIS,
                            amountIdr = payment.amountIdr,
                            walletBalanceIdr = payment.walletBalanceIdr,
                            message = "Sesi QRIS tersedia. Lanjutkan jika ingin memakai QRIS."
                        )
                    }
                    else -> _uiState.value = PaymentUiState.Choosing(
                        selectedMethod = selected,
                        amountIdr = payment.amountIdr,
                        walletBalanceIdr = payment.walletBalanceIdr
                    )
                }
            }
            result.onFailure {
                _uiState.value = PaymentUiState.Choosing(selectedMethod = selected)
            }
        }
    }

    fun selectMethod(method: CustomerPaymentMethod) {
        val current = _uiState.value
        val amount = amountFrom(current)
        val wallet = walletFrom(current)
        _uiState.value = PaymentUiState.Choosing(
            selectedMethod = method,
            amountIdr = amount,
            walletBalanceIdr = wallet
        )
    }

    fun startPayment(orderId: String) {
        val selected = selectedMethodFrom(_uiState.value)
        viewModelScope.launch {
            _uiState.value = PaymentUiState.Loading(selected)
            repository.createCustomerPaymentSession(orderId, selected.apiValue).collectLatest { result ->
                result.onSuccess { payment ->
                    val status = payment.paymentStatus.ifBlank { payment.status }
                    val url = payment.redirectUrl
                    when {
                        status == "paid" || payment.orderStatus == "pending" -> _uiState.value = PaymentUiState.Paid
                        status == "expired" -> _uiState.value = PaymentUiState.Expired(
                            message = "Sesi pembayaran sudah kedaluwarsa. Silakan buat sesi baru.",
                            selectedMethod = selected
                        )
                        selected == CustomerPaymentMethod.QRIS && !url.isNullOrBlank() -> {
                            _uiState.value = PaymentUiState.Ready(url, status)
                        }
                        selected == CustomerPaymentMethod.LAPAY -> {
                            _uiState.value = PaymentUiState.Error(
                                message = "Pembayaran LAPAY belum selesai. Silakan cek saldo dan coba lagi.",
                                selectedMethod = selected
                            )
                        }
                        else -> _uiState.value = PaymentUiState.Error(
                            message = "Link pembayaran QRIS sedang disiapkan. Coba ulangi beberapa saat lagi.",
                            selectedMethod = selected
                        )
                    }
                }
                result.onFailure { _ ->
                    _uiState.value = PaymentUiState.Error(
                        message = "Pembayaran belum dapat diproses. Coba lagi.",
                        selectedMethod = selected
                    )
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
                        status == "expired" -> _uiState.value = PaymentUiState.Expired(
                            message = "Sesi pembayaran sudah kedaluwarsa. Silakan buat sesi baru.",
                            selectedMethod = CustomerPaymentMethod.QRIS
                        )
                        !payment.redirectUrl.isNullOrBlank() -> _uiState.value = PaymentUiState.Ready(payment.redirectUrl, status)
                        else -> _uiState.value = PaymentUiState.Error(
                            message = error.localizedMessage ?: "Pembayaran sedang menunggu konfirmasi gateway.",
                            selectedMethod = CustomerPaymentMethod.QRIS
                        )
                    }
                }
                statusResult.onFailure {
                    _uiState.value = PaymentUiState.Error(
                        message = error.localizedMessage ?: "Gagal mengecek pembayaran",
                        selectedMethod = CustomerPaymentMethod.QRIS
                    )
                }
            }
        }
    }

    private fun selectedMethodFrom(state: PaymentUiState): CustomerPaymentMethod {
        return when (state) {
            is PaymentUiState.Choosing -> state.selectedMethod
            is PaymentUiState.Loading -> state.method
            is PaymentUiState.Expired -> state.selectedMethod
            is PaymentUiState.Error -> state.selectedMethod
            else -> CustomerPaymentMethod.LAPAY
        }
    }

    private fun amountFrom(state: PaymentUiState): Long {
        return when (state) {
            is PaymentUiState.Choosing -> state.amountIdr
            else -> 0L
        }
    }

    private fun walletFrom(state: PaymentUiState): Long {
        return when (state) {
            is PaymentUiState.Choosing -> state.walletBalanceIdr
            else -> 0L
        }
    }
}
