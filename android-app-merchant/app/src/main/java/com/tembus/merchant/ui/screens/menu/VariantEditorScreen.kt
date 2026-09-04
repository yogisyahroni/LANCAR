package com.tembus.merchant.ui.screens.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.TembusRadius
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale

/**
 * VariantEditorScreen — FB-108: editor grup varian menu item.
 * ViewModel di-pass dari AppNavHost (pola ChatScreen). Simpan = PUT replace atomik.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VariantEditorScreen(
    viewModel: VariantEditorViewModel,
    onBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    state.errorMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = viewModel::clearError,
                confirmButton = { TextButton(onClick = viewModel::clearError) { Text("OK") } },
                dismissButton = { TextButton(onClick = viewModel::load) { Text("Coba Lagi") } },
            title = { Text("Perhatian") },
            text = { Text(msg) }
        )
    }

    Scaffold(
        containerColor = PrimaryPale,
        topBar = {
            TopAppBar(
                title = { Text("Atur Varian Menu", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = MerchantTextCatalog.translate("Kembali"))
                    }
                },
                actions = {
                    TextButton(onClick = viewModel::save, enabled = !state.saving) {
                        if (state.saving) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Text("Simpan", fontWeight = FontWeight.Bold, color = Primary)
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = viewModel::addGroup,
                icon = { Icon(Icons.Filled.Add, contentDescription = "") },
                text = { Text("Tambah Grup") },
                containerColor = Accent
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(PrimaryPale)
                .padding(padding)
        ) {
            when {
                state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                state.saved -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = "", tint = Primary, modifier = Modifier.size(48.dp))
                            Spacer(Modifier.height(8.dp))
                            Text("Varian berhasil disimpan", fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Kembali untuk melihat daftar menu",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                state.groups.isEmpty() -> {
                    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                            Text("Belum ada varian", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Contoh: Ukuran (Kecil/Besar), Level Pedas, Tambahan Topping.\n" +
                                    "Ketuk \"Tambah Grup\" untuk mulai.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
                else -> PullToRefreshBox(
                    isRefreshing = state.isLoading && state.groups.isNotEmpty(),
                    onRefresh = viewModel::load,
                    modifier = Modifier.fillMaxSize()
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        itemsIndexed(state.groups) { gi, group ->
                            VariantGroupCard(
                                group = group,
                                groupIndex = gi,
                                onName = { viewModel.updateGroupName(gi, it) },
                                onRequired = { viewModel.updateGroupRequired(gi, it) },
                                onMaxSelect = { viewModel.updateGroupMaxSelect(gi, it) },
                                onAddOption = { viewModel.addOption(gi) },
                                onRemoveOption = { oi -> viewModel.removeOption(gi, oi) },
                                onOptionName = { oi, v -> viewModel.updateOptionName(gi, oi, v) },
                                onOptionDelta = { oi, v -> viewModel.updateOptionDelta(gi, oi, v) },
                                onRemoveGroup = { viewModel.removeGroup(gi) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VariantGroupCard(
    group: VariantEditorViewModel.DraftGroup,
    groupIndex: Int,
    onName: (String) -> Unit,
    onRequired: (Boolean) -> Unit,
    onMaxSelect: (String) -> Unit,
    onAddOption: () -> Unit,
    onRemoveOption: (Int) -> Unit,
    onOptionName: (Int, String) -> Unit,
    onOptionDelta: (Int, String) -> Unit,
    onRemoveGroup: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Grup ${groupIndex + 1}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onRemoveGroup, modifier = Modifier.size(28.dp)) {
                    Icon(
                        Icons.Filled.Delete,
                        contentDescription = MerchantTextCatalog.translate("Hapus grup"),
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            OutlinedTextField(
                value = group.nama,
                onValueChange = onName,
                label = { Text("Nama grup (cth: Level Pedas)*") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = group.isRequired, onCheckedChange = onRequired, modifier = Modifier.scale(0.8f))
                    Text("Wajib pilih", style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.weight(1f))
                OutlinedTextField(
                    value = group.maxSelect,
                    onValueChange = onMaxSelect,
                    label = { Text("Max pilih") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.width(90.dp)
                )
            }
            Spacer(Modifier.height(8.dp))
            group.options.forEachIndexed { oi, opt ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = opt.nama,
                        onValueChange = { onOptionName(oi, it) },
                        label = { Text("Opsi") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.width(8.dp))
                    OutlinedTextField(
                        value = opt.priceDelta,
                        onValueChange = { onOptionDelta(oi, it) },
                        label = { Text("+Rp") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.width(110.dp)
                    )
                    IconButton(onClick = { onRemoveOption(oi) }) {
                        Icon(
                            Icons.Filled.Delete,
                            contentDescription = MerchantTextCatalog.translate("Hapus opsi"),
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
            TextButton(onClick = onAddOption) {
                Icon(Icons.Filled.Add, contentDescription = "", modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Tambah opsi")
            }
        }
    }
}
