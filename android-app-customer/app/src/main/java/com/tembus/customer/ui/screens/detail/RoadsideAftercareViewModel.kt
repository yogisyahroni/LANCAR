package com.tembus.customer.ui.screens.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.*
import com.tembus.customer.data.repository.RoadsideAftercareRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RoadsideAftercareUiState(
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val report: RoadsideFinalReportResponse? = null,
    val payment: RoadsidePaymentIntent? = null,
    val claim: RoadsideClaimResponse? = null,
    val rating: RoadsideRatingResponse? = null,
    val error: String? = null,
    val message: String? = null
)

@HiltViewModel
class RoadsideAftercareViewModel @Inject constructor(
    private val repository: RoadsideAftercareRepository
) : ViewModel() {
    private val _state = MutableStateFlow(RoadsideAftercareUiState())
    val state = _state.asStateFlow()
    private var currentOrderId: String? = null

    fun resetForOrder(orderId: String) {
        if (currentOrderId != orderId) {
            currentOrderId = orderId
            _state.value = RoadsideAftercareUiState()
        }
    }

    fun load(orderId: String) {
        resetForOrder(orderId)
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            repository.finalReport(orderId)
                .onSuccess { report -> _state.update { it.copy(isLoading = false, report = report) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message ?: "Laporan akhir belum tersedia") } }
        }
    }

    fun collect(adjustmentId: String, onRefresh: () -> Unit) {
        if (_state.value.isSubmitting) return
        viewModelScope.launch {
            _state.update { it.copy(isSubmitting = true, error = null, message = null) }
            repository.collect(adjustmentId)
                .onSuccess { payment ->
                    _state.update { it.copy(isSubmitting = false, payment = payment,
                        message = if (payment.status == "paid") "Pembayaran sudah terverifikasi." else "Gunakan QR berikut untuk membayar nominal yang disetujui.") }
                    onRefresh()
                }
                .onFailure { error -> _state.update { it.copy(isSubmitting = false, error = error.message ?: "Pembayaran belum tersedia") } }
        }
    }

    fun submitClaim(request: RoadsideClaimRequest) {
        if (_state.value.isSubmitting) return
        viewModelScope.launch {
            _state.update { it.copy(isSubmitting = true, error = null, message = null) }
            repository.claim(request)
                .onSuccess { claim -> _state.update { it.copy(isSubmitting = false, claim = claim, message = "Klaim tercatat dan menunggu peninjauan.") } }
                .onFailure { error -> _state.update { it.copy(isSubmitting = false, error = error.message ?: "Klaim belum terkirim") } }
        }
    }

    fun submitRating(request: RoadsideRatingRequest) {
        if (_state.value.isSubmitting) return
        viewModelScope.launch {
            _state.update { it.copy(isSubmitting = true, error = null, message = null) }
            repository.rating(request)
                .onSuccess { rating -> _state.update { it.copy(isSubmitting = false, rating = rating, message = "Penilaian teknisi tersimpan.") } }
                .onFailure { error -> _state.update { it.copy(isSubmitting = false, error = error.message ?: "Penilaian belum tersimpan") } }
        }
    }

    fun clearMessage() { _state.update { it.copy(error = null, message = null) } }
    fun closePayment() { _state.update { it.copy(payment = null) } }
}
