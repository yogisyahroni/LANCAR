package com.tembus.merchant.ui.screens.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale

/** Dedicated ZIP editor route for add/edit; the form is no longer opened by the legacy menu page. */
@Composable
fun MenuEditorZipScreen(
    menuId: String?,
    onBack: () -> Unit,
    onOpenVariants: (String) -> Unit,
    viewModel: MenuViewModel = appViewModel { MenuViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    val existing = menuId?.let { id -> state.items.firstOrNull { it.id == id } }

    LaunchedEffect(state.saveCompleted) {
        if (state.saveCompleted) {
            viewModel.clearSaveState()
            onBack()
        }
    }

    when {
        menuId != null && state.isLoading && existing == null ->
            Box(Modifier.fillMaxSize().background(PrimaryPale), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
        menuId != null && existing == null ->
            MenuEditorRouteError(message = "Menu tidak ditemukan dari katalog backend.", onRetry = viewModel::load, onBack = onBack)
        else -> {
            MenuItemEditorZipContent(
                existing = existing,
                onUploadPhoto = { file -> viewModel.uploadPhoto(file) },
                isSaving = state.isSaving,
                saveError = state.saveError,
                onClearSaveError = viewModel::clearSaveState,
                onOpenVariants = onOpenVariants,
                onDismiss = onBack,
                onSave = { request ->
                    if (existing == null) viewModel.createItem(request) else viewModel.updateItem(existing.id, request)
                }
            )
        }
    }
}

@Composable
private fun MenuEditorRouteError(message: String, onRetry: () -> Unit, onBack: () -> Unit) {
    Column(
        Modifier.fillMaxSize().background(PrimaryPale).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(message, color = MaterialTheme.colorScheme.error)
        Button(onClick = onRetry, modifier = Modifier.padding(top = 12.dp)) { Text("Coba Lagi") }
        Button(onClick = onBack, modifier = Modifier.padding(top = 4.dp)) { Text("Kembali") }
    }
}
