package com.tembus.customer.ui.screens.business

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PaymentLinkRequest(
    val title: String,
    val total_amount: Long,
    val drop_address: String,
    val expires_in_minutes: Int = 10,
    val customer_name: String = "",
    val customer_phone: String = ""
)

data class PaymentLinkResponse(
    val id: String,
    val merchant_id: String,
    val title: String,
    val total_amount: Long,
    val drop_address: String,
    val customer_name: String,
    val customer_phone: String,
    val status: String,
    val expired_at: String,
    val created_at: String,
    val updated_at: String
)

sealed class BusinessUiState {
    object Idle : BusinessUiState()
    object Loading : BusinessUiState()
    data class Success(val generatedUrl: String) : BusinessUiState()
    data class Error(val message: String) : BusinessUiState()
}

@HiltViewModel
class BusinessViewModel @Inject constructor(
    private val api: TEMBUSApiService,
    private val sessionManager: AuthSessionManager
) : ViewModel() {

    private val _uiState = MutableStateFlow<BusinessUiState>(BusinessUiState.Idle)
    val uiState: StateFlow<BusinessUiState> = _uiState.asStateFlow()

    fun generatePaymentLink(title: String, amount: Long, destination: String) {
        viewModelScope.launch {
            _uiState.value = BusinessUiState.Loading
            try {
                // To fetch user id from session manager for merchant_id 
                val userId = sessionManager.getUserIdSync()
                if (userId == null) {
                    _uiState.value = BusinessUiState.Error("Sesi berakhir, silakan login kembali.")
                    return@launch
                }
                
                // Construct JSON payload
                // According to phase 3: Title, TotalAmount, DropAddress are required
                val requestBody = mapOf(
                    "title" to title,
                    "total_amount" to amount,
                    "drop_address" to destination,
                    "expires_in_minutes" to 10 // 10 minutes expiry requested by user
                )
                
                // Using API client
                val response = api.createPaymentLink(userId, requestBody)
                
                if (response.isSuccessful && response.body() != null) {
                    val apiResponse = response.body()!!
                    if (apiResponse.success && apiResponse.data != null) {
                        val linkData = apiResponse.data
                        val url = "https://tembus.my.id/pay/${linkData.id}"
                        _uiState.value = BusinessUiState.Success(url)
                    } else {
                        _uiState.value = BusinessUiState.Error("Gagal membuat link: ${apiResponse.message}")
                    }
                } else {
                    val errorMsg = response.errorBody()?.string() ?: "Unknown error"
                    _uiState.value = BusinessUiState.Error("Gagal membuat link: $errorMsg")
                }
            } catch (e: Exception) {
                _uiState.value = BusinessUiState.Error("Koneksi gagal: ${e.localizedMessage}")
            }
        }
    }

    fun resetState() {
        _uiState.value = BusinessUiState.Idle
    }
}
