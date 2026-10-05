package com.tembus.merchant.ui.screens.registration

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.RegisterMerchantRequest
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

data class RegistrationUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val success: Boolean = false
)

class RegistrationViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegistrationUiState())
    val uiState: StateFlow<RegistrationUiState> = _uiState.asStateFlow()
    private val consentAttemptId = UUID.randomUUID().toString()

    fun register(request: RegisterMerchantRequest) {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            val consents = merchantRepository.recordIndividualMerchantLegalConsents(consentAttemptId)
            if (consents.isFailure) {
                val e = consents.exceptionOrNull()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = e?.message ?: "Persetujuan legal belum tercatat. Coba lagi."
                )
                return@launch
            }

            merchantRepository.registerMerchant(request.copy(businessType = "perorangan"))
                .onSuccess {
                    _uiState.value = _uiState.value.copy(isLoading = false, success = true)
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = e.message ?: "Gagal mendaftar"
                    )
                }
        }
    }

    // FB-045: upload dokumen registrasi (KTP/foto toko/rekening) → URL publik.
    suspend fun uploadPhoto(file: java.io.File): Result<String> =
        merchantRepository.uploadPhoto(file)

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
