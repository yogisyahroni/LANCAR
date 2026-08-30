package com.tembus.merchant.ui.screens.menu

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.Accent

/** ZIP ManageMenu port. All menu values and availability states are API-backed. */
@Composable
fun ManageMenuZipScreen(
    onOpenAddMenu: () -> Unit,
    onOpenEditMenu: (String) -> Unit,
    viewModel: MenuViewModel = appViewModel { MenuViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        containerColor = PrimaryPale,
        floatingActionButton = {
            FloatingActionButton(
                onClick = onOpenAddMenu,
                containerColor = Accent,
                contentColor = MaterialTheme.colorScheme.onTertiary
            ) { Icon(Icons.Filled.Add, contentDescription = "Tambah Menu") }
        }
    ) { padding ->
        when {
            state.isLoading && state.items.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Primary) }
            state.errorMessage != null && state.items.isEmpty() -> MenuLoadError(state.errorMessage.orEmpty(), viewModel::load, Modifier.fillMaxSize().padding(padding))
            state.items.isEmpty() -> EmptyMenuZipState(onOpenAddMenu, Modifier.fillMaxSize().padding(padding))
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Column(Modifier.padding(bottom = 4.dp)) {
                            Text("Daftar Menu", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold, color = Primary)
                            Text("Kelola item yang tampil di aplikasi pelanggan.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    state.items.groupBy { it.kategori.ifBlank { "Lainnya" } }.forEach { (category, menuItems) ->
                        item { Text(category, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
                        items(menuItems, key = { it.id }) { item ->
                            ManageMenuItemZipCard(
                                item = item,
                                isActionLoading = state.actionLoadingId == item.id,
                                onEdit = { onOpenEditMenu(item.id) },
                                onToggle = { viewModel.toggleAvailability(item) }
                            )
                        }
                    }
                    state.errorMessage?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
                }
            }
        }
    }
}

@Composable
private fun ManageMenuItemZipCard(
    item: MenuItem,
    isActionLoading: Boolean,
    onEdit: () -> Unit,
    onToggle: () -> Unit
) {
    Card(
        onClick = onEdit,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(item.nama.ifBlank { "Nama menu belum tersedia" }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.size(4.dp))
                item.deskripsi?.takeIf { it.isNotBlank() }?.let { description ->
                    Text(
                        description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.size(4.dp))
                }
                Text(Format.rupiah(item.harga), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (item.foto.isNullOrBlank()) {
                    Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(64.dp)) {
                        Icon(Icons.Filled.RestaurantMenu, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(18.dp))
                    }
                } else {
                    AsyncImage(model = item.foto, contentDescription = item.nama, contentScale = ContentScale.Crop, modifier = Modifier.size(64.dp).clip(RoundedCornerShape(8.dp)))
                }
                Switch(
                    checked = item.isAvailable,
                    onCheckedChange = { onToggle() },
                    enabled = !isActionLoading,
                    thumbContent = null
                )
            }
        }
    }
}

@Composable
private fun EmptyMenuZipState(onAdd: () -> Unit, modifier: Modifier) {
    Column(modifier.padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Filled.RestaurantMenu, contentDescription = null, tint = Primary, modifier = Modifier.size(56.dp))
        Spacer(Modifier.size(16.dp))
        Text("Belum ada menu", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text("Tambahkan menu dari katalog backend untuk mulai menerima pesanan.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.size(16.dp))
        Button(onClick = onAdd) { Text("Tambah Menu") }
    }
}

@Composable
private fun MenuLoadError(message: String, onRetry: () -> Unit, modifier: Modifier) {
    Column(modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(message, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
        Spacer(Modifier.size(12.dp))
        Button(onClick = onRetry) { Text("Coba Lagi") }
    }
}
