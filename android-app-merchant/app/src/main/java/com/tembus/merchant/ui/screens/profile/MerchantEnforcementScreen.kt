package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MerchantEnforcementAction
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.ui.appViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MerchantEnforcementUiState(
    val isLoading: Boolean = true,
    val actions: List<MerchantEnforcementAction> = emptyList(),
    val errorMessage: String? = null,
    val submittedActionId: String? = null,
    val submitting: Boolean = false
)

class MerchantEnforcementViewModel(
    private val repository: MerchantRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(MerchantEnforcementUiState())
    val uiState: StateFlow<MerchantEnforcementUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            repository.getEnforcementStatus()
                .onSuccess { status ->
                    _uiState.value = _uiState.value.copy(isLoading = false, actions = status.actions)
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = error.message ?: "Gagal memuat status kebijakan")
                }
        }
    }

    fun submitAppeal(actionId: String, reason: String) {
        if (reason.trim().length < 10) {
            _uiState.value = _uiState.value.copy(errorMessage = "Alasan appeal minimal 10 karakter")
            return
        }
        _uiState.value = _uiState.value.copy(submitting = true, errorMessage = null)
        viewModelScope.launch {
            repository.submitEnforcementAppeal(actionId, reason.trim())
                .onSuccess {
                    _uiState.value = _uiState.value.copy(submitting = false, submittedActionId = actionId)
                    load()
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(submitting = false, errorMessage = error.message ?: "Gagal mengirim appeal")
                }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MerchantEnforcementScreen(
    onBack: () -> Unit,
    viewModel: MerchantEnforcementViewModel = appViewModel { MerchantEnforcementViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Status Kebijakan Toko") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                }
            )
        }
    ) { padding ->
        when {
            state.isLoading -> Column(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator(modifier = Modifier.padding(24.dp))
            }
            state.errorMessage != null && state.actions.isEmpty() -> Column(Modifier.fillMaxSize().padding(padding).padding(24.dp)) {
                Text(state.errorMessage ?: "Gagal memuat status", color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = viewModel::load) { Text("Coba lagi") }
            }
            state.actions.isEmpty() -> Column(Modifier.fillMaxSize().padding(padding).padding(24.dp)) {
                Icon(Icons.Filled.Info, contentDescription = null)
                Spacer(Modifier.height(12.dp))
                Text("Tidak ada enforcement aktif.", style = MaterialTheme.typography.titleMedium)
                Text("Jika ada peninjauan baru, status dan jalur remediation akan muncul di halaman ini.")
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item {
                    Text("Tindakan kebijakan aktif", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
                    Text("Order yang sedang berjalan tetap diproses sesuai kebijakan safe completion.", style = MaterialTheme.typography.bodyMedium)
                }
                items(state.actions, key = { it.id }) { action ->
                    EnforcementActionCard(action, state, viewModel::submitAppeal)
                }
                if (state.errorMessage != null) {
                    item { Text(state.errorMessage ?: "", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
}

@Composable
private fun EnforcementActionCard(
    action: MerchantEnforcementAction,
    state: MerchantEnforcementUiState,
    onSubmitAppeal: (String, String) -> Unit
) {
    var reason by remember(action.id) { mutableStateOf("") }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(action.scope.uppercase(), style = MaterialTheme.typography.titleMedium)
                Text(action.status, color = MaterialTheme.colorScheme.error)
            }
            val target = action.targetBranchName.ifBlank { action.targetMenuItemName }.ifBlank { action.capability }
            if (target.isNotBlank()) Text("Target: $target")
            Text("Alasan: ${action.reasonDetail}")
            if (action.activeOrderCount > 0) Text("Order aktif yang dijaga: ${action.activeOrderCount}")
            Text(action.remediationMessage, style = MaterialTheme.typography.bodyMedium)
            if (action.appealEligible) {
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Alasan remediation / appeal") },
                    minLines = 3
                )
                Button(
                    onClick = { onSubmitAppeal(action.id, reason) },
                    enabled = !state.submitting && reason.trim().length >= 10
                ) { Text(if (state.submittedActionId == action.id) "Terkirim" else "Kirim appeal") }
            }
        }
    }
}
