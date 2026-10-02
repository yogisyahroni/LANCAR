package com.tembus.merchant.ui.screens.ads

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
    var objective by remember { mutableStateOf("visibility") }
    var placement by remember { mutableStateOf("food_discovery") }
    var branchIds by remember { mutableStateOf("") }
    var audience by remember { mutableStateOf("") }
    var bid by remember { mutableStateOf("100") }
    var daypart by remember { mutableStateOf("Sepanjang hari") }
    var objectiveMenuExpanded by remember { mutableStateOf(false) }
    var placementMenuExpanded by remember { mutableStateOf(false) }
    var startAt by remember { mutableStateOf(Instant.now().plusSeconds(60).toString()) }
    var endAt by remember { mutableStateOf(Instant.now().plus(Duration.ofDays(7)).toString()) }
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
                            Icon(Icons.Filled.Campaign, contentDescription = "", tint = Primary)
                            Spacer(Modifier.padding(4.dp))
                            Text("Visibilitas berbayar", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        }
                        Text("Iklan membantu toko lebih mudah ditemukan. Iklan tidak mengubah harga, waktu antar, rating, atau urutan biasa.")
                        Text("Saldo akan dipotong saat kampanye dibuat; hasil iklan dan hasil biasa ditampilkan terpisah.", style = MaterialTheme.typography.bodySmall)
                        Text("Promo adalah penawaran harga di Menu Promo. Iklan adalah produk visibilitas terpisah.", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
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
                        Box {
                            OutlinedTextField(
                                value = when (objective) {
                                    "new_customer" -> "Menarik pelanggan baru"
                                    else -> "Agar toko lebih mudah ditemukan"
                                },
                                onValueChange = {},
                                label = { Text("Tujuan iklan") },
                                readOnly = true,
                                trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = "Pilih tujuan iklan") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().clickable { objectiveMenuExpanded = true }
                            )
                            DropdownMenu(expanded = objectiveMenuExpanded, onDismissRequest = { objectiveMenuExpanded = false }) {
                                DropdownMenuItem(text = { Text("Agar toko lebih mudah ditemukan") }, onClick = { objective = "visibility"; objectiveMenuExpanded = false })
                                DropdownMenuItem(text = { Text("Menarik pelanggan baru") }, onClick = { objective = "new_customer"; objectiveMenuExpanded = false })
                            }
                        }
                        Box {
                            OutlinedTextField(
                                value = when (placement) {
                                    "food_search" -> "Hasil pencarian makanan"
                                    else -> "Beranda pelanggan"
                                },
                                onValueChange = {},
                                label = { Text("Lokasi penayangan") },
                                readOnly = true,
                                trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = "Pilih lokasi penayangan") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().clickable { placementMenuExpanded = true }
                            )
                            DropdownMenu(expanded = placementMenuExpanded, onDismissRequest = { placementMenuExpanded = false }) {
                                DropdownMenuItem(text = { Text("Beranda pelanggan") }, onClick = { placement = "food_discovery"; placementMenuExpanded = false })
                                DropdownMenuItem(text = { Text("Hasil pencarian makanan") }, onClick = { placement = "food_search"; placementMenuExpanded = false })
                            }
                        }
                        OutlinedTextField(branchIds, { branchIds = it }, label = { Text("Cabang toko (opsional)") }, supportingText = { Text("Pisahkan beberapa cabang dengan koma") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(audience, { audience = it }, label = { Text("Sasaran pelanggan (opsional)") }, supportingText = { Text("Contoh: pelanggan di area tertentu atau pencarian makanan") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(headline, { headline = it }, label = { Text("Judul iklan") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(body, { body = it }, label = { Text("Deskripsi iklan (opsional)") }, maxLines = 3, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(imageUrl, { imageUrl = it }, label = { Text("Tautan gambar (opsional)") }, supportingText = { Text("Gunakan alamat gambar yang aman") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(daypart, { daypart = it }, label = { Text("Jam tayang") }, supportingText = { Text("Gunakan waktu setempat toko") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(startAt, { startAt = it }, label = { Text("Mulai kampanye") }, supportingText = { Text("Masukkan tanggal dan waktu mulai") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(endAt, { endAt = it }, label = { Text("Selesai kampanye") }, supportingText = { Text("Masukkan tanggal dan waktu selesai") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                totalBudget,
                                { totalBudget = it.filter(Char::isDigit) },
                                label = { Text("Total biaya") },
                                prefix = { Text("Rp ") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                dailyBudget,
                                { dailyBudget = it.filter(Char::isDigit) },
                                label = { Text("Biaya harian") },
                                prefix = { Text("Rp ") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                bid,
                                { bid = it.filter(Char::isDigit) },
                                label = { Text("Batas biaya per klik") },
                                prefix = { Text("Rp ") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer), modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("Preview Iklan", fontWeight = FontWeight.Bold)
                                Text(headline.ifBlank { "Headline kreatif tampil di sini" }, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text("Iklan · Perkiraan jangkauan, bukan jaminan pesanan", style = MaterialTheme.typography.bodySmall)
                                Text("Batas biaya: ${Format.rupiah(total)} · Biaya per klik · Jam tayang: $daypart", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        Button(
                            onClick = {
                                validationError = validateAdForm(name, headline, imageUrl, total, daily)
                                if (validationError == null) {
                                    val branchList = branchIds.split(',').map(String::trim).filter(String::isNotBlank)
                                    viewModel.create(
                                        MerchantAdRequest(
                                            name = name.trim(),
                                            description = body.trim(),
                                            creativeHeadline = headline.trim(),
                                            creativeBody = body.trim(),
                                            creativeImageUrl = imageUrl.trim(),
                                            totalBudgetIdr = total,
                                            dailyBudgetIdr = daily,
                                            startsAt = startAt,
                                            endsAt = endAt,
                                            marketCode = "id-jk",
                                            objective = objective.trim().ifBlank { "visibility" },
                                            placements = listOf(placement.trim().ifBlank { "food_discovery" }),
                                            branchIds = branchList,
                                            audience = com.tembus.merchant.data.model.AdsAudience(intentCategories = listOf(placement.trim()).filter(String::isNotBlank)),
                                            bidMaxMinor = bid.toLongOrNull() ?: 100L,
                                            creativeAltText = "Merchant sponsored food advertisement"
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
            item {
                state.performance?.let { performance ->
                    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Performa Iklan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text("${performance.paid.impressions} tayangan · ${performance.paid.clicks} klik · ${performance.paid.attributedOrders} pesanan dari iklan")
                            Text("Biaya iklan: ${Format.rupiah(performance.paid.spendIdr)} · hasil biasa tetap terpisah", style = MaterialTheme.typography.bodySmall)
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
                items(state.items, key = { it.id }) { ad -> MerchantAdCard(ad, state.actionLoadingId, viewModel::toggleActive, viewModel::clone, viewModel::end) }
            }
            item { Spacer(Modifier.height(20.dp)) }
        }
    }
}

private fun validateAdForm(name: String, headline: String, imageUrl: String, total: Long, daily: Long): String? {
    if (name.trim().length < 3 || headline.trim().length < 3) return "Nama dan headline minimal 3 karakter."
    if (imageUrl.isNotBlank() && !imageUrl.trim().startsWith("https://")) return "Tautan gambar harus menggunakan alamat yang aman."
    if (total < 10_000L || daily !in 1_000L..total) return "Total minimal Rp 10.000 dan budget harian harus valid."
    return null
}

@Composable
private fun MerchantAdCard(ad: MerchantAd, actionLoadingId: String?, onToggle: (MerchantAd) -> Unit, onClone: (MerchantAd) -> Unit, onEnd: (MerchantAd) -> Unit) {
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
                    enabled = actionLoadingId != ad.id && !ad.status.equals("rejected", true) && !ad.status.equals("suspended", true)
                )
            }
            Text("Status: ${ad.statusLabel()}", style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${ad.impressions} tayangan", style = MaterialTheme.typography.bodySmall)
                Text("${ad.clicks} klik", style = MaterialTheme.typography.bodySmall)
                Text("Biaya ${Format.rupiah(ad.chargedAmountIdr)}", style = MaterialTheme.typography.bodySmall, color = Primary)
            }
            Text("Pesanan dari iklan: ${ad.attributedOrders} · ${Format.rupiah(ad.attributedRevenueIdr)}", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (ad.status.equals("draft", true)) {
                    OutlinedButton(onClick = { onToggle(ad) }, enabled = actionLoadingId != ad.id) { Text("Ajukan tayang") }
                }
                OutlinedButton(onClick = { onClone(ad) }, enabled = actionLoadingId != ad.id) { Text("Duplikat") }
                OutlinedButton(onClick = { onEnd(ad) }, enabled = actionLoadingId != ad.id && !ad.status.equals("ended", true)) { Text("Akhiri") }
            }
            if (ad.rejectionReason.isNotBlank()) Text("Ditolak: ${ad.rejectionReason}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            if (ad.suspensionReason.isNotBlank()) Text("Ditangguhkan: ${ad.suspensionReason}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun MerchantAd.statusLabel(): String = when (status.lowercase()) {
    "draft" -> "Draf"
    "validating" -> "Sedang diperiksa"
    "scheduled" -> "Terjadwal"
    "active" -> "Aktif"
    "ended" -> "Selesai"
    "rejected" -> "Ditolak"
    "suspended" -> "Ditangguhkan"
    else -> "Belum tersedia"
}
