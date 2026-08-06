package com.tembus.customer.ui.screens.rating

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.SubmitRatingRequest
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MerchantRatingUiState(
    val isSubmitting: Boolean = false,
    val isSubmitted: Boolean = false,
    val error: String? = null,
    // Data merchant yang ditampilkan di dialog
    val merchantName: String = "",
    val orderNumber: String = "",
    // Order yang sedang di-rating
    val activeOrderId: String = "",
    val showDialog: Boolean = false
)

/** FOOD-BIKE-060: rating merchant (makanan) terpisah dari rating driver. */
@HiltViewModel
class MerchantRatingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(MerchantRatingUiState())
    val uiState: StateFlow<MerchantRatingUiState> = _uiState.asStateFlow()

    /**
     * Buka dialog rating merchant dari halaman tracking saat order food delivered.
     */
    fun prepare(
        orderId: String,
        orderNumber: String,
        merchantName: String
    ) {
        _uiState.value = MerchantRatingUiState(
            merchantName = merchantName,
            orderNumber = orderNumber,
            activeOrderId = orderId,
            showDialog = true
        )
    }

    /** Tutup dialog rating merchant tanpa mengirim. */
    fun dismiss() {
        _uiState.value = MerchantRatingUiState()
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /** Submit rating 1-5 bintang untuk merchant. */
    fun submitRating(rating: Float, comment: String) {
        if (rating < 1f) return
        val orderId = _uiState.value.activeOrderId
        if (orderId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            val request = SubmitRatingRequest(rating = rating, comment = comment)
            orderRepository.submitMerchantRating(orderId, request).onSuccess {
                _uiState.update { it.copy(isSubmitting = false, isSubmitted = true) }
            }.onFailure { err ->
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        error = err.message ?: "Gagal mengirim penilaian, coba lagi"
                    )
                }
            }
        }
    }
}
