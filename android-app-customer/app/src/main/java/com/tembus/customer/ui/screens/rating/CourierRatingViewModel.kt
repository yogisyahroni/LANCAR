package com.tembus.customer.ui.screens.rating

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.RatingReminderItem
import com.tembus.customer.data.model.SubmitRatingRequest
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CourierRatingUiState(
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val isSubmitted: Boolean = false,
    val error: String? = null,
    // Data kurir yang ditampilkan di dialog
    val courierName: String = "",
    val courierPhotoUrl: String = "",
    val courierPlate: String = "",
    val orderNumber: String = "",
    // Pending reminders yang belum di-dismiss
    val pendingReminders: List<RatingReminderItem> = emptyList(),
    // Index reminder yang sedang ditampilkan
    val currentReminderIndex: Int = 0
)

@HiltViewModel
class CourierRatingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CourierRatingUiState())
    val uiState: StateFlow<CourierRatingUiState> = _uiState.asStateFlow()

    /**
     * Load reminder rating yang pending dari server.
     * Dipanggil saat customer masuk ke halaman notifikasi atau history.
     */
    fun loadRatingReminders() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            orderRepository.getRatingReminders().onSuccess { reminders ->
                if (reminders.isNotEmpty()) {
                    val first = reminders.first()
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            pendingReminders = reminders,
                            currentReminderIndex = 0,
                            courierName = first.courierName,
                            courierPhotoUrl = first.courierPhotoUrl,
                            courierPlate = first.courierPlate,
                            orderNumber = first.orderNumber
                        )
                    }
                } else {
                    _uiState.update { it.copy(isLoading = false, pendingReminders = emptyList()) }
                }
            }.onFailure { err ->
                _uiState.update { it.copy(isLoading = false, error = err.message) }
            }
        }
    }

    /**
     * Populate dialog langsung dari data order yang sudah di-load (misalnya dari TrackingScreen).
     * Dipakai ketika order berubah status menjadi 'delivered' di halaman tracking.
     */
    fun prepareFromTrackingOrder(
        orderId: String,
        orderNumber: String,
        courierName: String,
        courierPhotoUrl: String,
        courierPlate: String
    ) {
        val reminder = RatingReminderItem(
            orderId = orderId,
            orderNumber = orderNumber,
            courierName = courierName,
            courierPhotoUrl = courierPhotoUrl,
            courierPlate = courierPlate
        )
        _uiState.update {
            it.copy(
                pendingReminders = listOf(reminder),
                currentReminderIndex = 0,
                courierName = courierName,
                courierPhotoUrl = courierPhotoUrl,
                courierPlate = courierPlate,
                orderNumber = orderNumber,
                isSubmitted = false,
                error = null
            )
        }
    }

    /**
     * Submit rating bintang (1-5) ke server untuk order dan kurir yang sedang aktif.
     * @param orderId ID order yang di-rating
     * @param rating  Float bintang (1.0 - 5.0)
     * @param comment Komentar opsional dari customer
     */
    fun submitRating(orderId: String, rating: Float, comment: String) {
        if (rating < 1f) return // Pastikan minimal 1 bintang
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            val request = SubmitRatingRequest(rating = rating, comment = comment)
            orderRepository.submitCourierRating(orderId, request).onSuccess {
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

    /**
     * Dismiss dialog rating untuk order saat ini dan pindah ke reminder berikutnya (jika ada).
     */
    fun dismissCurrentReminder() {
        val current = _uiState.value
        val nextIndex = current.currentReminderIndex + 1
        if (nextIndex < current.pendingReminders.size) {
            val next = current.pendingReminders[nextIndex]
            _uiState.update {
                it.copy(
                    currentReminderIndex = nextIndex,
                    courierName = next.courierName,
                    courierPhotoUrl = next.courierPhotoUrl,
                    courierPlate = next.courierPlate,
                    orderNumber = next.orderNumber,
                    isSubmitted = false,
                    error = null
                )
            }
        } else {
            // Semua reminder sudah selesai
            _uiState.update {
                it.copy(pendingReminders = emptyList(), currentReminderIndex = 0)
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
