package com.tembus.merchant.ui.screens.ads

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Campaign
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantAd
import com.tembus.merchant.data.model.MerchantAdRequest
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import java.time.Duration
import java.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdsZipScreen(
    onBack: () -> Unit,
    viewModel: AdsViewModel = appViewModel { AdsViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    var name by remember { mutableStateOf("") }
    var headline by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var imageUrl by remember { mutableStateOf("") }
    var totalBudget by remember { mutableStateOf("") }
    var dailyBudget by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(state.createCompleted) {
        if (state.createCompleted) {
            viewModel.clearCreateCompleted()
            name = ""
            headline = ""
            body = ""
            imageUrl = ""
            totalBudget = ""
            dailyBudget = ""
        }
    }

    val total = totalBudget.toLongOrNull() ?: 0L
    val daily = dailyBudget.toLongOrNull() ?: 0L
    val canSubmit = name.trim().length >= 3 && headline.trim().length >= 3 &&
        total >= 10_000L && daily in 1_000L..total

    Scaffold(
        containerColor = PrimaryPale,
        topBar = {
            TopAppBar(
                title = { Text("Iklan", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PrimaryPale)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Campaign, contentDescription = null, tint = Primary)
                            Spacer(Modifier.padding(4.dp))
                            Text("Visibilitas berbayar", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        }
                        Text("Iklan membeli visibilitas di discovery. Iklan tidak mengubah harga, ETA, rating, atau urutan organik.")
                        Text("Saldo merchant akan dipotong saat kampanye dibuat; performa paid dan organik dilaporkan terpisah.", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Buat kampanye Iklan", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        OutlinedTextField(name, { name = it }, label = { Text("Nama kampanye") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(headline, { headline = it }, label = { Text("Headline kreatif") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(body, { body = it }, label = { Text("Teks kreatif (opsional)") }, maxLines = 3, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(imageUrl, { imageUrl = it }, label = { Text("URL gambar HTTPS (opsional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                totalBudget,
                                { totalBudget = it.filter(Char::isDigit) },
                                label = { Text("Total budget") },
                                prefix = { Text("Rp ") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                dailyBudget,
                                { dailyBudget = it.filter(Char::isDigit) },
                                label = { Text("Budget harian") },
                                prefix = { Text("Rp ") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        Button(
                            onClick = {
                                validationError = validateAdForm(name, headline, imageUrl, total, daily)
                                if (validationError == null) {
                                    val start = Instant.now().plusSeconds(60)
                                    viewModel.create(
                                        MerchantAdRequest(
                                            name = name.trim(),
                                            description = body.trim(),
                                            creativeHeadline = headline.trim(),
                                            creativeBody = body.trim(),
                                            creativeImageUrl = imageUrl.trim(),
                                            totalBudgetIdr = total,
                                            dailyBudgetIdr = daily,
                                            startsAt = start.toString(),
                                            endsAt = start.plus(Duration.ofDays(7)).toString()
                                        )
                                    )
                                }
                            },
                            enabled = canSubmit && !state.isLoading,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (state.isLoading) CircularProgressIndicator(strokeWidth = 2.dp)
                            else Text("Buat Iklan")
                        }
                    }
                }
            }
            item { Text("Kampanye saya", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
            if (state.isLoading && state.items.isEmpty()) {
                item { CircularProgressIndicator(Modifier.padding(vertical = 20.dp), color = Primary) }
            } else if (state.items.isEmpty()) {
                item { Text("Belum ada kampanye Iklan.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                items(state.items, key = { it.id }) { ad -> MerchantAdCard(ad, state.actionLoadingId, viewModel::toggleActive) }
            }
            item { Spacer(Modifier.height(20.dp)) }
        }
    }
}

private fun validateAdForm(name: String, headline: String, imageUrl: String, total: Long, daily: Long): String? {
    if (name.trim().length < 3 || headline.trim().length < 3) return "Nama dan headline minimal 3 karakter."
    if (imageUrl.isNotBlank() && !imageUrl.trim().startsWith("https://")) return "URL gambar harus menggunakan HTTPS."
    if (total < 10_000L || daily !in 1_000L..total) return "Total minimal Rp 10.000 dan budget harian harus valid."
    return null
}

@Composable
private fun MerchantAdCard(ad: MerchantAd, actionLoadingId: String?, onToggle: (MerchantAd) -> Unit) {
    val active = ad.status.equals("active", ignoreCase = true) || ad.status.equals("scheduled", ignoreCase = true)
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(ad.name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(ad.creativeHeadline, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Switch(
                    checked = active,
                    onCheckedChange = { onToggle(ad) },
                    enabled = actionLoadingId != ad.id
                )
            }
            Text("Status: ${ad.status.ifBlank { "unknown" }}", style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${ad.impressions} tayangan", style = MaterialTheme.typography.bodySmall)
                Text("${ad.clicks} klik", style = MaterialTheme.typography.bodySmall)
                Text("Spend ${Format.rupiah(ad.chargedAmountIdr)}", style = MaterialTheme.typography.bodySmall, color = Primary)
            }
            Text("Attributed: ${ad.attributedOrders} order · ${Format.rupiah(ad.attributedRevenueIdr)}", style = MaterialTheme.typography.bodySmall)
        }
    }
}
