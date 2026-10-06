package com.tembus.merchant.ui.screens.access

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The authenticated TEMBUS identity is not, by itself, a merchant identity.
 * This state is resolved from the server-owned merchant context before the
 * operational shell is mounted.
 */
enum class MerchantAccessPhase {
    LOADING,
    REGISTRATION_REQUIRED,
    PENDING_REVIEW,
    REJECTED,
    SUSPENDED,
    READY,
    ERROR
}

data class MerchantAccessGateUiState(
    val phase: MerchantAccessPhase = MerchantAccessPhase.LOADING,
    val merchant: Merchant? = null,
    val message: String? = null
)

class MerchantAccessGateViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(MerchantAccessGateUiState())
    val uiState: StateFlow<MerchantAccessGateUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun refresh() {
        load()
    }

    private fun load() {
        _uiState.value = MerchantAccessGateUiState(phase = MerchantAccessPhase.LOADING)
        viewModelScope.launch {
            merchantRepository.getProfile()
                .onSuccess { merchant ->
                    _uiState.value = MerchantAccessGateUiState(
                        phase = merchantAccessPhase(merchant),
                        merchant = merchant
                    )
                }
                .onFailure { error ->
                    val message = error.message.orEmpty()
                    _uiState.value = MerchantAccessGateUiState(
                        phase = if (isRegistrationRequiredMessage(message)) {
                            MerchantAccessPhase.REGISTRATION_REQUIRED
                        } else {
                            MerchantAccessPhase.ERROR
                        },
                        message = message.takeIf { it.isNotBlank() }
                    )
                }
        }
    }
}

internal fun merchantAccessPhase(merchant: Merchant): MerchantAccessPhase {
    if (merchant.isApproved) return MerchantAccessPhase.READY

    return when {
        merchant.onboardingStatus.equals("REJECTED", ignoreCase = true) ||
            merchant.verificationStatus.equals("rejected", ignoreCase = true) -> MerchantAccessPhase.REJECTED
        merchant.onboardingStatus.equals("SUSPENDED", ignoreCase = true) -> MerchantAccessPhase.SUSPENDED
        else -> MerchantAccessPhase.PENDING_REVIEW
    }
}

internal fun isRegistrationRequiredMessage(message: String): Boolean {
    val normalized = message.lowercase()
    return normalized.contains("belum terdaftar sebagai merchant") ||
        normalized.contains("belum terdaftar sebagai mitra")
}
