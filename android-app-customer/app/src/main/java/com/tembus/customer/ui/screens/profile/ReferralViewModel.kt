package com.tembus.customer.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.ReferralInfo
import com.tembus.customer.data.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// C8: ViewModel referral
@HiltViewModel
class ReferralViewModel @Inject constructor(
    private val repository: ProfileRepository
) : ViewModel() {

    private val _referralInfo = MutableStateFlow<ReferralInfo?>(null)
    val referralInfo: StateFlow<ReferralInfo?> = _referralInfo.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _message = MutableSharedFlow<String>()
    val message = _message.asSharedFlow()

    fun loadReferralInfo() {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            repository.getReferralInfo()
                .onSuccess { info -> _referralInfo.value = info }
                .onFailure { e -> _error.value = e.message ?: "Gagal memuat referral" }
            _loading.value = false
        }
    }

    fun applyReferralCode(code: String) {
        viewModelScope.launch {
            repository.applyReferralCode(code)
                .onSuccess { msg ->
                    _message.emit(msg)
                    loadReferralInfo()
                }
                .onFailure { e -> _message.emit(e.message ?: "Gagal menerapkan kode") }
        }
    }
}
