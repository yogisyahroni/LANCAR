package com.tembus.customer.ui.screens.tip

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TipUiState(
    val showDialog: Boolean = false,
    val isSubmitting: Boolean = false,
    val isSubmitted: Boolean = false,
    val error: String? = null,
    // Data kurir untuk ditampilkan di dialog
    val orderId: String = "",
    val orderNumber: String = "",
    val courierName: String = "",
    // Status tip order ini (true = sudah tip, sembunyikan tombol)
    val tipped: Boolean = false,
    val tipChecked: Boolean = false
)

/**
 * FB-077: Tips driver — dialog pilih nominal tip ke kurir.
 * Berlaku untuk semua service (parcel, tambal ban, towing, food).
 */
@HiltViewModel
class TipViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TipUiState())
    val uiState: StateFlow<TipUiState> = _uiState.asStateFlow()

    /** Cek apakah order sudah di-tip (panggil sekali saat tracking aktif). */
    fun checkTipStatus(orderId: String) {
        if (_uiState.value.tipChecked) return
        viewModelScope.launch {
            orderRepository.getTipStatus(orderId).onSuccess { tipped ->
                _uiState.update { it.copy(tipped = tipped, tipChecked = true) }
            }.onFailure {
                // Jangan blokir UI kalau gagal cek — tombol tetap tampil
                _uiState.update { it.copy(tipChecked = true) }
            }
        }
    }

    /** Buka dialog tip untuk order tertentu. */
    fun prepare(
        orderId: String,
        orderNumber: String,
        courierName: String
    ) {
        _uiState.update {
            it.copy(
                showDialog = true,
                isSubmitting = false,
                isSubmitted = false,
                error = null,
                orderId = orderId,
                orderNumber = orderNumber,
                courierName = courierName
            )
        }
    }

    /** Submit tip nominal tertentu. */
    fun submitTip(amountIdr: Long) {
        val orderId = _uiState.value.orderId
        if (orderId.isBlank() || _uiState.value.isSubmitting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            orderRepository.giveTip(orderId, amountIdr).onSuccess {
                _uiState.update { it.copy(isSubmitting = false, isSubmitted = true, tipped = true) }
            }.onFailure { err ->
                _uiState.update { it.copy(isSubmitting = false, error = err.message ?: "Gagal mengirim tip") }
            }
        }
    }

    fun dismiss() {
        _uiState.update { it.copy(showDialog = false) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun reset() {
        _uiState.value = TipUiState()
    }
}
