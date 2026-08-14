package com.tembus.customer.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.LoyaltyInfo
import com.tembus.customer.data.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// C9: ViewModel loyalty
@HiltViewModel
class LoyaltyViewModel @Inject constructor(
    private val repository: ProfileRepository
) : ViewModel() {

    private val _loyaltyInfo = MutableStateFlow<LoyaltyInfo?>(null)
    val loyaltyInfo: StateFlow<LoyaltyInfo?> = _loyaltyInfo.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun loadLoyaltyInfo() {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            repository.getLoyaltyInfo()
                .onSuccess { info -> _loyaltyInfo.value = info }
                .onFailure { e -> _error.value = e.message ?: "Gagal memuat loyalty" }
            _loading.value = false
        }
    }
}
