package com.tembus.merchant.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.GreenText
import com.tembus.merchant.ui.theme.TembusRadius

/**
 * EditOrderScreen — FB-087: layar merchant mengubah qty item order food
 * sebelum konfirmasi (status pending_merchant). Simpan → PUT items →
 * tampilkan total baru → kembali ke daftar order.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditOrderScreen(
    orderId: String,
    onBack: () -> Unit,
    onSaved: () -> Unit,
    viewModel: EditOrderViewModel = appViewModel { EditOrderViewModel(it.merchantRepository, orderId) }
) {
    val state by viewModel.uiState.collectAsState()

    // Dialog hasil PUT sukses — tampilkan total baru, lalu kembali.
    state.result?.let { res ->
        AlertDialog(
            onDismissRequest = { },
            confirmButton = {
                TextButton(onClick = onSaved) { Text("OK") }
            },
            title = { Text("Perubahan Tersimpan") },
            text = {
                Column {
                    Text("Total pesanan sekarang: ${Format.rupiah(res.totalIdr)}")
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Subtotal ${Format.rupiah(res.subtotalIdr)} · Fee layanan ${Format.rupiah(res.platformFeeIdr)}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        )
    }

    // Dialog error aksi (load / save).
    state.errorMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = viewModel::clearError,
            confirmButton = {
                TextButton(onClick = viewModel::clearError) { Text("OK") }
            },
            title = { Text("Gagal") },
            text = { Text(msg) }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit Pesanan") },
                navigationIcon = {
                    IconButton(onClick = onBack, enabled = !state.saving) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = MerchantTextCatalog.translate("Kembali"))
                    }
                }
            )
        },
        bottomBar = {
            if (state.order != null && !state.isLoading) {
                BottomBar(
                    totalEstimate = state.totalEstimate,
                    hasChanges = state.hasChanges,
                    saving = state.saving,
                    onSave = viewModel::save
                )
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.isLoading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                state.order == null -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("Tidak dapat memuat pesanan")
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(onClick = viewModel::load) { Text("Coba Lagi") }
                    }
                }
                else -> {
                    val order = state.order!!
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        item {
                            Text(
                                "Ubah jumlah item. Total baru tidak boleh melebihi total awal.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        itemsIndexed(order.items, key = { _, item -> item.menuItemId.ifBlank { item.itemName } }) { index, item ->
                            EditItemCard(
                                item = item,
                                quantity = state.quantities.getOrElse(index) { item.quantity },
                                onIncrement = { viewModel.increment(index) },
                                onDecrement = { viewModel.decrement(index) }
                            )
                        }

                        item {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(TembusRadius.Card),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row {
                                        Text(
                                            "Total awal",
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Spacer(modifier = Modifier.weight(1f))
                                        Text(
                                            Format.rupiah(order.subtotalOldIdr + order.deliveryFeeIdr + order.platformFeeIdr - order.discountIdr),
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Row {
                                        Text(
                                            "Perkiraan total baru",
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                        Spacer(modifier = Modifier.weight(1f))
                                        Text(
                                            Format.rupiah(state.totalEstimate),
                                            fontWeight = FontWeight.Bold,
                                            color = GreenText
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EditItemCard(
    item: com.tembus.merchant.data.model.FoodOrderItem,
    quantity: Int,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.itemName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                // FB-108-FIX: varian terpilih (mis. "Level: Level 3 Pedas").
                item.variants?.takeIf { it.isNotEmpty() }?.let { variants ->
                    Text(
                        text = variants.joinToString(" · ") { v -> "${v.variantName}: ${v.optionName}" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = Format.rupiah(item.itemPrice) + " / porsi",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.width(8.dp))

            // Stepper qty
            IconButton(onClick = onDecrement, enabled = quantity > 1) {
                Icon(Icons.Filled.Remove, contentDescription = MerchantTextCatalog.translate("Kurangi"))
            }
            Text(
                text = "$quantity",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(32.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            IconButton(onClick = onIncrement) {
                Icon(Icons.Filled.Add, contentDescription = MerchantTextCatalog.translate("Tambah"))
            }
        }
    }
}

@Composable
private fun BottomBar(
    totalEstimate: Long,
    hasChanges: Boolean,
    saving: Boolean,
    onSave: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Total baru",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.weight(1f))
            Text(
                Format.rupiah(totalEstimate),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = GreenText
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Button(
            onClick = onSave,
            enabled = hasChanges && !saving,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (saving) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp
                )
            } else {
                Text("Simpan Perubahan")
            }
        }
    }
}
