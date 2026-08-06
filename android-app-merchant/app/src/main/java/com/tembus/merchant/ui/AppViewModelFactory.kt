package com.tembus.merchant.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.tembus.merchant.AppContainer
import com.tembus.merchant.TEMBUSApplication

/**
 * AppViewModelFactory — factory generic untuk manual DI (tanpa Hilt).
 * Creator menerima AppContainer sehingga screen bisa inject dependency apapun:
 *   appViewModel { HomeViewModel(it.merchantRepository) }
 */
class AppViewModelFactory<T : ViewModel>(private val creator: () -> T) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <V : ViewModel> create(modelClass: Class<V>): V = creator() as V
}

@Composable
inline fun <reified T : ViewModel> appViewModel(noinline creator: (AppContainer) -> T): T {
    val app = LocalContext.current.applicationContext as TEMBUSApplication
    val factory = AppViewModelFactory { creator(app.container) }
    return viewModel(factory = factory)
}
