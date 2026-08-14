package com.tembus.customer.ui.localization

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.localization.LocaleManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// C7: ViewModel pilihan bahasa
@HiltViewModel
class LanguageViewModel @Inject constructor(
    private val localeManager: LocaleManager,
    private val localeApplier: LocaleApplier
) : ViewModel() {

    private val _currentCode = MutableStateFlow(LocaleManager.DEFAULT_LANG)
    val currentCode: StateFlow<String> = _currentCode.asStateFlow()

    init {
        viewModelScope.launch {
            _currentCode.value = localeManager.getLanguageCode()
        }
    }

    fun setLanguage(code: String) {
        viewModelScope.launch {
            localeManager.setLanguageCode(code)
            _currentCode.value = code
            // Terapkan langsung (API 33+ butuh recreate; di bawahnya AppCompatDelegate otomatis)
            localeApplier.applyLanguage(code)
        }
    }
}
