package com.tembus.customer.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.WalletBalance
import com.tembus.customer.data.model.WalletTopUpSession
import com.tembus.customer.data.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class WalletTopUpUiState(
    val balance: WalletBalance? = null,
    val amountText: String = "",
    val isLoading: Boolean = true,
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val session: WalletTopUpSession? = null
)

@HiltViewModel
class WalletTopUpViewModel @Inject constructor(
    private val repository: ProfileRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(WalletTopUpUiState())
    val uiState: StateFlow<WalletTopUpUiState> = _uiState.asStateFlow()

    init {
        refreshBalance()
    }

    fun refreshBalance() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            repository.getWalletBalance().fold(
                onSuccess = { balance ->
                    _uiState.value = _uiState.value.copy(
                        balance = balance,
                        isLoading = false,
                        error = null,
                        notice = null
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.localizedMessage ?: "Saldo belum dapat dimuat."
                    )
                }
            )
        }
    }

    fun setAmount(value: String) {
        _uiState.value = _uiState.value.copy(
            amountText = value.filter(Char::isDigit).take(12),
            error = null,
            notice = null,
            session = null
        )
    }

    fun submit() {
        val amount = _uiState.value.amountText.toLongOrNull()
        if (amount == null || amount < MIN_TOP_UP_IDR) {
            _uiState.value = _uiState.value.copy(
                error = "Minimum top-up adalah ${formatRupiah(MIN_TOP_UP_IDR)}."
            )
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSubmitting = true, error = null, notice = null)
            repository.createWalletTopUp(amount, UUID.randomUUID().toString()).fold(
                onSuccess = { session ->
                    _uiState.value = _uiState.value.copy(
                        isSubmitting = false,
                        session = session,
                        notice = "Pembayaran top-up siap dilanjutkan."
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isSubmitting = false,
                        error = error.localizedMessage ?: "Top-up belum dapat dimulai."
                    )
                }
            )
        }
    }

    fun clearSession() {
        _uiState.value = _uiState.value.copy(session = null, notice = null)
    }

    companion object {
        const val MIN_TOP_UP_IDR = 10_000L

        fun formatRupiah(value: Long): String =
            java.text.NumberFormat.getCurrencyInstance(java.util.Locale("id", "ID"))
                .apply { maximumFractionDigits = 0 }
                .format(value)
                .replace("Rp", "Rp ")
                .replace(",00", "")
    }
}

private fun formatRupiah(value: Long): String = WalletTopUpViewModel.formatRupiah(value)
