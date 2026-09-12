package com.tembus.customer.ui.screens.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.UniversalSearchDocument
import com.tembus.customer.ui.designsystem.TembusAppBar
import com.tembus.customer.ui.designsystem.TembusCard
import com.tembus.customer.ui.designsystem.TembusEmptyState
import com.tembus.customer.ui.designsystem.TembusSearchField

internal data class TembusSearchIntent(val code: String, val title: String, val description: String, val icon: ImageVector, val keywords: Set<String>)

private val TEMBUS_SEARCH_INTENTS = listOf(
    TembusSearchIntent("pickup", "Paket Instan", "Kirim barang cepat sesuai rute", Icons.Default.LocalShipping, setOf("paket", "kirim", "pickup", "delivery")),
    TembusSearchIntent("food_delivery", "Food", "Cari makanan dan merchant terdekat", Icons.Default.Restaurant, setOf("food", "makan", "makanan", "resto", "kuliner")),
    TembusSearchIntent("aggregator", "Ekspedisi Antar-Kota", "Bandingkan layanan ekspedisi", Icons.Default.LocalShipping, setOf("ekspedisi", "antar", "kota", "aggregator")),
    TembusSearchIntent("tambal_ban", "Tambal Ban", "Cari teknisi darurat di sekitar lokasi", Icons.Default.Build, setOf("tambal", "ban", "bocor", "darurat")),
    TembusSearchIntent("towing", "Towing", "Bantuan derek untuk kendaraan", Icons.Default.DirectionsCar, setOf("towing", "derek", "mogok", "evakuasi")),
)

internal fun resolveTembusSearchIntents(query: String): List<TembusSearchIntent> {
    val normalized = query.trim().lowercase()
    if (normalized.isBlank()) return TEMBUS_SEARCH_INTENTS
    return TEMBUS_SEARCH_INTENTS.filter { intent ->
        intent.title.lowercase().contains(normalized) || intent.description.lowercase().contains(normalized) || intent.keywords.any { keyword -> keyword.contains(normalized) || normalized.contains(keyword) }
    }
}

@Composable
fun TembusUniversalSearchScreen(
    onBack: () -> Unit,
    onServiceSelected: (String) -> Unit,
    viewModel: UniversalSearchViewModel = hiltViewModel(),
) {
    var query by remember { mutableStateOf("") }
    val remoteState by viewModel.uiState.collectAsState()
    LaunchedEffect(query) { viewModel.search(query) }
    val matches = resolveTembusSearchIntents(query)
    val safeRemoteResults = remoteState.results.filter {
        it.serviceCode != null && it.serviceCode in setOf("pickup", "food_delivery", "aggregator", "tambal_ban", "towing")
    }
    Scaffold(
        topBar = {
            TembusAppBar(
                title = "Cari di TEMBUS",
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            TembusSearchField(value = query, onValueChange = { query = it }, label = "Cari layanan", placeholder = "Contoh: makanan, paket, tambal ban")
            if (remoteState.suggestions.isNotEmpty()) {
                Text("Saran pencarian", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(remoteState.suggestions.joinToString("  · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (remoteState.isLoading) {
                Text("Mencari…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (safeRemoteResults.isNotEmpty()) {
                Text("Hasil pencarian", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    items(safeRemoteResults, key = { it.entityId }) { document ->
                        SearchResultCard(document = document, onServiceSelected = onServiceSelected)
                    }
                }
            } else if (matches.isEmpty()) {
                TembusEmptyState(title = "Pilih layanan dari daftar", message = "TEMBUS belum menemukan layanan yang cocok. Gunakan kata kunci layanan atau pilih salah satu opsi yang tersedia di Beranda.")
            } else {
                Text("Layanan yang cocok", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    items(matches, key = { it.code }) { intent ->
                        TembusCard(onClick = { onServiceSelected(intent.code) }, modifier = Modifier.fillMaxWidth()) {
                            Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Icon(intent.icon, contentDescription = "", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(intent.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                    Text(intent.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
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
private fun SearchResultCard(document: UniversalSearchDocument, onServiceSelected: (String) -> Unit) {
    val serviceCode = document.serviceCode ?: return
    val icon = when (serviceCode) {
        "food_delivery" -> Icons.Default.Restaurant
        "tambal_ban" -> Icons.Default.Build
        "towing" -> Icons.Default.DirectionsCar
        else -> Icons.Default.LocalShipping
    }
    TembusCard(onClick = { onServiceSelected(serviceCode) }, modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(icon, contentDescription = "", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(document.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                val state = when {
                    document.available == false -> document.unavailableReason ?: "Tidak tersedia saat ini"
                    document.openNow == false -> "Sedang tutup"
                    else -> "Tersedia untuk dilihat"
                }
                Text(state, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
