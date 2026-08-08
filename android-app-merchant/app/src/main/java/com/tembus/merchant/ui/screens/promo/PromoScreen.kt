package com.tembus.merchant.ui.screens.promo

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantPromo
import com.tembus.merchant.data.model.MerchantPromoRequest
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.Primary

/**
 * PromoScreen — tab Promo (FB-100): kelola promo merchant self-serve.
 * Merchant buat diskon menu sendiri (percent/fixed/buy1get1) — bukan duit PT,
 * jadi tanpa approval admin.
 */
@Composable
fun PromoScreen(
    viewModel: PromoViewModel = appViewModel { PromoViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    var showCreate by remember { mutableStateOf(false) }

    state.errorMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = viewModel::clearError,
            confirmButton = {
                TextButton(onClick = viewModel::clearError) { Text("OK") }
            },
            title = { Text("Perhatian") },
            text = { Text(msg) }
        )
    }

    if (showCreate) {
        PromoCreateDialog(
            onDismiss = { showCreate = false },
            onSave = { request ->
                viewModel.createPromo(request)
                showCreate = false
            }
        )
    }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showCreate = true },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Buat Promo") },
                containerColor = Accent
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (state.isLoading && state.items.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Column
            }

            if (state.items.isEmpty()) {
                EmptyPromoContent(onAdd = { showCreate = true })
                return@Column
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 88.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(state.items, key = { it.id }) { promo ->
                    PromoCard(
                        promo = promo,
                        isActionLoading = state.actionLoadingId == promo.id,
                        onToggleActive = { viewModel.toggleActive(promo) },
                        onDelete = { viewModel.deletePromo(promo.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyPromoContent(onAdd: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Filled.LocalOffer,
            contentDescription = null,
            tint = Primary,
            modifier = Modifier.size(56.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            "Belum ada promo. Buat diskon menu pertama kamu — " +
                "dibiayai toko sendiri, langsung aktif tanpa persetujuan admin.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onAdd) { Text("Buat Promo Pertama") }
    }
}

@Composable
private fun PromoCard(
    promo: MerchantPromo,
    isActionLoading: Boolean,
    onToggleActive: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = discountLabel(promo),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = if (promo.isActive) Primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = promoPeriod(promo),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (isActionLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text(
                        text = if (promo.isActive) "AKTIF" else "PAUSE",
                        color = if (promo.isActive) Primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Maks diskon: " +
                    (promo.maxDiscountIdr?.let { Format.rupiah(it) } ?: "—"),
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onToggleActive,
                    enabled = !isActionLoading,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (promo.isActive) "Pause" else "Aktifkan")
                }
                OutlinedButton(
                    onClick = onDelete,
                    enabled = !isActionLoading,
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Icon(Icons.Filled.Delete, contentDescription = "Hapus", modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Hapus")
                }
            }
        }
    }
}

private fun promoPeriod(promo: MerchantPromo): String {
    fun short(s: String): String {
        if (s.isBlank()) return "—"
        val date = s.take(10)
        val time = s.substringAfter("T", "").take(5)
        return if (time.isBlank()) date else "$date $time UTC"
    }
    return "${short(promo.startsAt)} → ${short(promo.endsAt)}"
}

private fun discountLabel(promo: MerchantPromo): String = when (promo.discountType) {
    "percent" -> "${promo.discountValue}%"
    "fixed" -> Format.rupiah(promo.discountValue)
    "buy1get1" -> "Beli 1 Gratis 1"
    else -> promo.discountType
}
