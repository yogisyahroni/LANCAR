package com.tembus.merchant.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.MerchantReview
import com.tembus.merchant.data.model.MerchantRatingBucket
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CustomerReviewsUiState(
    val merchant: Merchant? = null,
    val reviews: List<MerchantReview> = emptyList(),
    val ratingDistribution: List<MerchantRatingBucket> = emptyList(),
    val activeFilter: CustomerReviewFilter = CustomerReviewFilter.ALL,
    val isLoading: Boolean = false,
    val isReplying: Boolean = false,
    val replyError: String? = null,
    val errorMessage: String? = null
)

enum class CustomerReviewFilter { ALL, FIVE_STARS, UNREPLIED }

/** Review screen membaca profile dan merchant_ratings dari API existing. */
class CustomerReviewsViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(CustomerReviewsUiState())
    val uiState: StateFlow<CustomerReviewsUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            val profile = merchantRepository.getProfile()
            if (profile.isFailure) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = profile.exceptionOrNull()?.message ?: "Gagal memuat profil toko"
                )
                return@launch
            }
            val reviews = merchantRepository.getCustomerReviews()
            reviews.onSuccess { response ->
                _uiState.value = _uiState.value.copy(
                    merchant = profile.getOrNull(),
                    reviews = response.reviews,
                    ratingDistribution = response.ratingDistribution,
                    isLoading = false,
                    errorMessage = null
                )
            }.onFailure { error ->
                _uiState.value = _uiState.value.copy(
                    merchant = profile.getOrNull(),
                    isLoading = false,
                    errorMessage = error.message ?: "Gagal memuat review customer"
                )
            }
        }
    }

    fun setFilter(filter: CustomerReviewFilter) {
        _uiState.value = _uiState.value.copy(activeFilter = filter)
    }

    fun replyToReview(reviewId: String, body: String) {
        _uiState.value = _uiState.value.copy(isReplying = true, replyError = null)
        viewModelScope.launch {
            merchantRepository.replyToCustomerReview(reviewId, body)
                .onSuccess { reply ->
                    _uiState.value = _uiState.value.copy(
                        isReplying = false,
                        reviews = _uiState.value.reviews.map { review ->
                            if (review.id == reviewId) review.copy(reply = reply) else review
                        }
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        isReplying = false,
                        replyError = error.message ?: "Gagal menyimpan tanggapan"
                    )
                }
        }
    }

    fun clearReplyError() {
        _uiState.value = _uiState.value.copy(replyError = null)
    }
}
