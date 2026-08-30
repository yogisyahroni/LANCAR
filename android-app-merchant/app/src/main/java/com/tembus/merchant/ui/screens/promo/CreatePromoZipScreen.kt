package com.tembus.merchant.ui.screens.promo

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.data.model.MerchantPromoRequest
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.screens.menu.MenuViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.Accent
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreatePromoZipScreen(
    onBack: () -> Unit,
    viewModel: PromoViewModel = appViewModel { PromoViewModel(it.merchantRepository) },
    menuViewModel: MenuViewModel = appViewModel { MenuViewModel(it.merchantRepository) }
) {
    val promoState by viewModel.uiState.collectAsState()
    val menuState by menuViewModel.uiState.collectAsState()
    var discountType by remember { mutableStateOf("percent") }
    var selectedMenu by remember { mutableStateOf<MenuItem?>(null) }
    var search by remember { mutableStateOf("") }
    var discountValue by remember { mutableStateOf("") }
    var maxDiscount by remember { mutableStateOf("") }
    var startsAt by remember { mutableStateOf(defaultPromoStart()) }
    var endsAt by remember { mutableStateOf(defaultPromoEnd()) }
    var validationError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(promoState.createCompleted) {
        if (promoState.createCompleted) {
            viewModel.clearCreateCompleted()
            onBack()
        }
    }

    val filteredMenu = menuState.items.filter { item ->
        search.isBlank() || item.nama.contains(search, ignoreCase = true)
    }
    val selectedPrice = selectedMenu?.harga ?: 0L
    val discount = discountValue.toLongOrNull() ?: 0L
    val discountedPrice = when (discountType) {
        "percent" -> (selectedPrice - (selectedPrice * discount / 100)).coerceAtLeast(0)
        "fixed" -> (selectedPrice - discount).coerceAtLeast(0)
        else -> selectedPrice
    }
    val formValid = discount > 0L &&
        (discountType != "percent" || discount <= 100L) &&
        endsAt > startsAt &&
        (discountType == "total" || selectedMenu != null)

    Scaffold(
        containerColor = PrimaryPale,
        topBar = {
            TopAppBar(
                title = { Text("Buat Promo", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Go back") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PrimaryPale)
            )
        },
        bottomBar = {
            Surface(color = PrimaryPale, shadowElevation = 8.dp) {
                Button(
                    onClick = {
                        val request = buildPromoRequest(discountType, selectedMenu, discountValue, maxDiscount, startsAt, endsAt)
                        if (request == null) validationError = "Cek tipe promo, menu, diskon, dan rentang waktunya."
                        else viewModel.createPromo(request)
                    },
                    enabled = formValid && !promoState.isLoading,
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Accent)
                ) {
                    if (promoState.isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    else {
                        Text("Konfirmasi Promo")
                        Spacer(Modifier.size(8.dp))
                        Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { Spacer(Modifier.height(8.dp)) }
            item {
                PromoTypeSection(discountType) { discountType = it; selectedMenu = if (it == "total") null else selectedMenu }
            }
            item {
                PromoMenuSection(
                    menuState = menuState,
                    search = search,
                    selectedMenu = selectedMenu,
                    filteredMenu = filteredMenu,
                    onSearchChange = { search = it },
                    onSelect = { selectedMenu = it },
                    onClear = { selectedMenu = null },
                    enabled = discountType != "total"
                )
            }
            item {
                PromoCalculationSection(
                    selectedMenu = selectedMenu,
                    discountType = discountType,
                    discountValue = discountValue,
                    discountedPrice = discountedPrice,
                    onDiscountChange = { discountValue = it.filter(Char::isDigit) }
                )
            }
            item {
                PromoAdditionalSettings(
                    startsAt = startsAt,
                    endsAt = endsAt,
                    maxDiscount = maxDiscount,
                    onStartsAtChange = { startsAt = it },
                    onEndsAtChange = { endsAt = it },
                    onMaxDiscountChange = { maxDiscount = it.filter(Char::isDigit) }
                )
            }
            promoState.errorMessage?.let { error ->
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(error, color = MaterialTheme.colorScheme.error)
                        OutlinedButton(onClick = viewModel::load) { Text("Coba Lagi") }
                    }
                }
            }
            validationError?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
            item { Spacer(Modifier.height(80.dp)) }
        }
    }
}

@Composable
private fun PromoTypeSection(selected: String, onSelect: (String) -> Unit) {
    PromoCardSection {
        Text("Tipe Promo", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text("Pilih jenis promosi yang ingin Anda tawarkan.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = selected == "percent", onClick = { onSelect("percent") }, label = { Text("Diskon Menu") })
            FilterChip(selected = selected == "total", onClick = { onSelect("total") }, label = { Text("Diskon Total") })
        }
    }
}

@Composable
private fun PromoMenuSection(
    menuState: com.tembus.merchant.ui.screens.menu.MenuUiState,
    search: String,
    selectedMenu: MenuItem?,
    filteredMenu: List<MenuItem>,
    onSearchChange: (String) -> Unit,
    onSelect: (MenuItem) -> Unit,
    onClear: () -> Unit,
    enabled: Boolean
) {
    PromoCardSection {
        Text("Menu Pilihan", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(
            if (enabled) "Pilih menu yang akan didiskon." else "Diskon total berlaku saat checkout; pemilihan menu tidak diperlukan.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (enabled) {
            OutlinedTextField(
                value = search,
                onValueChange = onSearchChange,
                placeholder = { Text("Cari menu...") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !menuState.isLoading
            )
            if (selectedMenu != null) {
                SelectedMenuCard(selectedMenu, onClear)
            } else if (menuState.isLoading) {
                CircularProgressIndicator(color = Primary)
            } else if (menuState.errorMessage != null) {
                Text(menuState.errorMessage, color = MaterialTheme.colorScheme.error)
            } else if (filteredMenu.isEmpty()) {
                Text("Menu tidak tersedia dari backend.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                filteredMenu.take(8).forEach { menu ->
                    MenuChoiceRow(menu, onClick = { onSelect(menu) })
                }
            }
        } else {
            Text("Harga promo dihitung saat customer checkout; breakdown nominal belum disediakan API.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SelectedMenuCard(menu: MenuItem, onClear: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), border = BorderStroke(1.dp, Primary), shape = RoundedCornerShape(8.dp)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(menu.nama, fontWeight = FontWeight.Bold)
                Text(Format.rupiah(menu.harga), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onClear) { Icon(Icons.Filled.Close, contentDescription = "Hapus menu") }
        }
    }
}

@Composable
private fun MenuChoiceRow(menu: MenuItem, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(menu.nama, fontWeight = FontWeight.SemiBold)
                Text(Format.rupiah(menu.harga), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Filled.CheckCircle, contentDescription = "Pilih menu", tint = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

@Composable
private fun PromoCalculationSection(
    selectedMenu: MenuItem?,
    discountType: String,
    discountValue: String,
    discountedPrice: Long,
    onDiscountChange: (String) -> Unit
) {
    PromoCardSection {
        Text("Kalkulasi Diskon", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        if (selectedMenu == null) {
            Text("Kalkulasi nominal menunggu data harga saat checkout.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(value = Format.rupiah(selectedMenu.harga), onValueChange = {}, readOnly = true, label = { Text("Harga Awal") }, modifier = Modifier.weight(1f))
                OutlinedTextField(value = discountValue, onValueChange = onDiscountChange, label = { Text(if (discountType == "percent") "Diskon (%)" else "Diskon (Rp)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f), singleLine = true)
            }
            Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("RINCIAN PERHITUNGAN", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    PaymentCalculationRow("Harga setelah diskon", Format.rupiah(discountedPrice), emphasize = true)
                    Text("Biaya layanan platform belum dikirim oleh API promo.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun PromoAdditionalSettings(
    startsAt: String,
    endsAt: String,
    maxDiscount: String,
    onStartsAtChange: (String) -> Unit,
    onEndsAtChange: (String) -> Unit,
    onMaxDiscountChange: (String) -> Unit
) {
    PromoCardSection {
        Text("Pengaturan Tambahan", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(value = startsAt, onValueChange = onStartsAtChange, label = { Text("Mulai (UTC)") }, trailingIcon = { Icon(Icons.Filled.CalendarToday, contentDescription = null) }, modifier = Modifier.weight(1f), singleLine = true)
            OutlinedTextField(value = endsAt, onValueChange = onEndsAtChange, label = { Text("Berakhir (UTC)") }, trailingIcon = { Icon(Icons.Filled.CalendarToday, contentDescription = null) }, modifier = Modifier.weight(1f), singleLine = true)
        }
        OutlinedTextField(value = maxDiscount, onValueChange = onMaxDiscountChange, label = { Text("Maks diskon (Rp, opsional)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth(), singleLine = true)
    }
}

@Composable
private fun PromoCardSection(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
private fun PaymentCalculationRow(label: String, value: String, emphasize: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontWeight = if (emphasize) FontWeight.Bold else FontWeight.Normal)
        Text(value, fontWeight = if (emphasize) FontWeight.Bold else FontWeight.Normal, color = if (emphasize) Primary else MaterialTheme.colorScheme.onSurface)
    }
}

private fun buildPromoRequest(type: String, menu: MenuItem?, value: String, max: String, starts: String, ends: String): MerchantPromoRequest? {
    val discount = value.toLongOrNull() ?: 0L
    if (discount <= 0L) return null
    if (type == "percent" && discount > 100L) return null
    if (type != "total" && menu == null) return null
    if (parsePromoDate(starts) == null || parsePromoDate(ends) == null || parsePromoDate(ends)!! <= parsePromoDate(starts)!!) return null
    return MerchantPromoRequest(
        menuItemId = menu?.id,
        discountType = if (type == "total") "percent" else type,
        discountValue = discount,
        maxDiscountIdr = max.toLongOrNull(),
        startsAt = starts,
        endsAt = ends
    )
}

private fun parsePromoDate(value: String) = runCatching {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
        isLenient = false
    }.parse(value)
}.getOrNull()

private fun defaultPromoStart(): String = promoDate(0)
private fun defaultPromoEnd(): String = promoDate(7, endOfDay = true)

private fun promoDate(days: Int, endOfDay: Boolean = false): String {
    val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    calendar.add(Calendar.DAY_OF_YEAR, days)
    calendar.set(Calendar.HOUR_OF_DAY, if (endOfDay) 23 else 0)
    calendar.set(Calendar.MINUTE, if (endOfDay) 59 else 0)
    calendar.set(Calendar.SECOND, if (endOfDay) 59 else 0)
    calendar.set(Calendar.MILLISECOND, 0)
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(calendar.time)
}
