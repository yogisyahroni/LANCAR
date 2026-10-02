package com.tembus.merchant.ui.screens.menu

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import coil.compose.AsyncImage
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.rememberMerchantHapticAction
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.AccentSoft
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.PrimarySoft
import com.tembus.merchant.ui.theme.TembusRadius
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import java.io.BufferedReader
import java.io.InputStreamReader

private enum class MenuStatusFilter(val label: String) {
    ALL("Semua"), AVAILABLE("Tersedia"), SOLD_OUT("Stok habis"), DRAFT("Draft"), SCHEDULED("Terjadwal")
}

private enum class MenuSort(val label: String) {
    UPDATED("Terbaru diperbarui"), SALES("Paling sering dipesan"), PRICE_HIGH("Harga tertinggi"), PRICE_LOW("Harga terendah")
}

private data class MenuFilters(
    val status: MenuStatusFilter = MenuStatusFilter.ALL,
    val category: String? = null,
    val sort: MenuSort = MenuSort.UPDATED,
    val minPrice: String = "",
    val maxPrice: String = "",
    val onlyPromoted: Boolean = false
)

/** Menu catalogue shell aligned to the Figma list, filter and operational entry points. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManageMenuZipScreen(
    onOpenAddMenu: () -> Unit,
    onOpenEditMenu: (String) -> Unit,
    onOpenOperatingHours: () -> Unit,
    onOpenCreatePromo: () -> Unit,
    onOpenNotifications: () -> Unit,
    viewModel: MenuViewModel = appViewModel { MenuViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    val openAddMenu = rememberMerchantHapticAction(onOpenAddMenu)
    val context = LocalContext.current
    var importPreview by remember { mutableStateOf<MenuImportParseResult?>(null) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var filters by remember { mutableStateOf(MenuFilters()) }
    var draftFilters by remember { mutableStateOf(MenuFilters()) }
    var showFilters by remember { mutableStateOf(false) }
    var showMenuTools by remember { mutableStateOf(false) }

    val csvPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val result = runCatching {
            context.contentResolver.openInputStream(uri)?.use { input ->
                MenuImportParser.parse(BufferedReader(InputStreamReader(input)).readText())
            } ?: MenuImportParseResult(emptyList(), listOf("File tidak dapat dibaca."))
        }.getOrElse { MenuImportParseResult(emptyList(), listOf("Gagal membaca CSV: ${it.message ?: "error tidak diketahui"}")) }
        importPreview = result
    }

    val activePromoIds = remember(state.promos) { state.promos.filter { it.isActive }.mapNotNull { it.menuItemId }.toSet() }
    val filteredItems = remember(state.items, searchQuery, filters, activePromoIds) {
        val query = searchQuery.trim()
        state.items.asSequence()
            .filter { query.isBlank() || it.nama.contains(query, ignoreCase = true) || it.kategori.contains(query, ignoreCase = true) }
            .filter { filters.category == null || it.kategori.equals(filters.category, ignoreCase = true) }
            .filter { item ->
                when (filters.status) {
                    MenuStatusFilter.ALL -> true
                    MenuStatusFilter.AVAILABLE -> item.isAvailable && item.status != "sold_out"
                    MenuStatusFilter.SOLD_OUT -> !item.isAvailable || item.status == "sold_out" || item.stockQuantity == 0
                    MenuStatusFilter.DRAFT -> item.status == "draft" || item.moderationStatus == "pending"
                    MenuStatusFilter.SCHEDULED -> item.status == "scheduled"
                }
            }
            .filter { filters.minPrice.toLongOrNull()?.let { min -> it.harga >= min } ?: true }
            .filter { filters.maxPrice.toLongOrNull()?.let { max -> it.harga <= max } ?: true }
            .filter { !filters.onlyPromoted || it.id in activePromoIds }
            .let { sequence ->
                when (filters.sort) {
                    MenuSort.UPDATED -> sequence.sortedByDescending { it.updatedAt.orEmpty() }
                    MenuSort.SALES -> sequence.sortedByDescending { it.dailySalesCount }
                    MenuSort.PRICE_HIGH -> sequence.sortedByDescending { it.harga }
                    MenuSort.PRICE_LOW -> sequence.sortedBy { it.harga }
                }
            }.toList()
    }
    val categoryChips = remember(state.items, state.categories) {
        val counts = state.items.groupingBy { it.kategori.ifBlank { "Tanpa kategori" } }.eachCount()
        state.categories
            .filter { it.status == "active" }
            .map { it.name }
            .filter(String::isNotBlank)
            .distinct()
            .map { it to (counts[it] ?: 0) }
            .filter { it.second > 0 }
            .ifEmpty { counts.entries.map { it.key to it.value }.sortedBy { it.first } }
    }

    PullToRefreshBox(isRefreshing = state.isLoading && state.items.isNotEmpty(), onRefresh = viewModel::load, modifier = Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = PrimaryPale,
            // The Menu header owns the single status-bar inset. The default
            // Scaffold inset would otherwise be applied a second time.
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            floatingActionButton = {
                FloatingActionButton(onClick = openAddMenu, containerColor = Accent, contentColor = Color.White) {
                    Icon(Icons.Filled.Add, contentDescription = MerchantTextCatalog.translate("Tambah Menu"))
                }
            }
        ) { padding ->
            when {
                state.isLoading && state.items.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Primary) }
                state.errorMessage != null && state.items.isEmpty() -> MenuLoadError(state.errorMessage.orEmpty(), viewModel::load, Modifier.fillMaxSize().padding(padding))
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 104.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        MenuStoreHeader(state.merchant?.namaToko.orEmpty(), state.merchant?.alamat.orEmpty(), state.merchant?.isOpen == true, onOpenNotifications)
                    }
                    item {
                        MenuPageHeader(
                            menuCount = state.items.size,
                            searchQuery = searchQuery,
                            onSearchChange = { searchQuery = it },
                            activeFilterCount = filters.activeCount(),
                            categories = categoryChips,
                            selectedCategory = filters.category,
                            onSelectCategory = { filters = filters.copy(category = it) },
                            onOpenFilters = {
                                draftFilters = filters
                                showFilters = true
                            }
                        )
                    }
                    item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = openAddMenu, colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color.White), modifier = Modifier.weight(1f)) {
                                Icon(Icons.Filled.Add, contentDescription = "", modifier = Modifier.size(18.dp)); Spacer(Modifier.size(6.dp)); Text("Tambah Menu")
                            }
                            Box(Modifier.weight(1f)) {
                                OutlinedButton(onClick = { showMenuTools = true }, modifier = Modifier.fillMaxWidth()) {
                                    Icon(Icons.Filled.AccessTime, contentDescription = "", modifier = Modifier.size(18.dp)); Spacer(Modifier.size(6.dp)); Text("Jam & Promo")
                                }
                                DropdownMenu(expanded = showMenuTools, onDismissRequest = { showMenuTools = false }) {
                                    DropdownMenuItem(
                                        text = { Text("Jam operasional") },
                                        leadingIcon = { Icon(Icons.Filled.AccessTime, contentDescription = "") },
                                        onClick = { showMenuTools = false; onOpenOperatingHours() }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Promo") },
                                        leadingIcon = { Icon(Icons.Filled.Tune, contentDescription = "") },
                                        onClick = { showMenuTools = false; onOpenCreatePromo() }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Impor menu") },
                                        leadingIcon = { Icon(Icons.Filled.UploadFile, contentDescription = "") },
                                        onClick = {
                                            showMenuTools = false
                                            csvPicker.launch(arrayOf("text/csv", "text/comma-separated-values", "*/*"))
                                        }
                                    )
                                }
                            }
                        }
                    }
                    state.errorMessage?.let { error -> item { MenuInlineError(error, viewModel::load) } }
                    if (filteredItems.isEmpty()) {
                        item { MenuFilteredEmpty(filters != MenuFilters() || searchQuery.isNotBlank(), { filters = MenuFilters(); searchQuery = "" }, onOpenAddMenu) }
                    } else {
                        filteredItems.groupBy { it.kategori.ifBlank { "Tanpa kategori" } }.forEach { (category, itemsInCategory) ->
                            item {
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Text(category, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                    Text("${itemsInCategory.size} menu", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            items(itemsInCategory, key = { it.id }) { item ->
                                MenuCatalogCard(item, item.id in activePromoIds, state.actionLoadingId == item.id, { onOpenEditMenu(item.id) }, { viewModel.toggleAvailability(item) })
                            }
                        }
                    }
                    if (state.isImporting) item { LinearProgressIndicator(progress = { ((state.importCompleted + state.importFailed).toFloat() / state.importTotal.coerceAtLeast(1).toFloat()).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth()) }
                }
            }
        }
    }

    if (showFilters) {
        MenuFilterSheet(
            filters = draftFilters,
            categories = state.categories.filter { it.status == "active" }.map { it.name }.filter(String::isNotBlank).distinct(),
            hasPromos = activePromoIds.isNotEmpty(),
            totalFiltered = filteredItems.size,
            onChange = { draftFilters = it },
            onReset = { draftFilters = MenuFilters() },
            onDismiss = { showFilters = false },
            onApply = { filters = draftFilters; showFilters = false }
        )
    }

    importPreview?.let { preview ->
        MenuImportPreviewDialog(preview, state.isImporting, { importPreview = null }, {
            viewModel.clearImportResult(); viewModel.importItems(preview.rows); importPreview = null
        })
    }
}

@Composable
private fun MenuStoreHeader(merchantName: String, address: String, isOpen: Boolean, onOpenNotifications: () -> Unit) {
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Surface(shape = CircleShape, color = Primary, modifier = Modifier.size(40.dp)) {
            Box(contentAlignment = Alignment.Center) { Text(merchantName.trim().firstOrNull()?.uppercase() ?: "T", color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge) }
        }
        Column(Modifier.weight(1f)) {
            Text(merchantName.ifBlank { "Toko belum tersedia" }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(address.ifBlank { "Alamat toko belum tersedia" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Surface(color = if (isOpen) PrimarySoft else AccentSoft, shape = RoundedCornerShape(TembusRadius.Chip)) {
            Row(Modifier.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(if (isOpen) Primary else Accent)); Spacer(Modifier.size(6.dp))
                Text(if (isOpen) "BUKA" else "TUTUP", style = MaterialTheme.typography.labelMedium, color = if (isOpen) Primary else Accent, fontWeight = FontWeight.Bold)
            }
        }
        IconButton(onClick = onOpenNotifications) { Icon(Icons.Filled.NotificationsNone, contentDescription = MerchantTextCatalog.translate("Notifikasi"), tint = Primary) }
    }
}

@Composable
private fun MenuPageHeader(
    menuCount: Int,
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    activeFilterCount: Int,
    categories: List<Pair<String, Int>>,
    selectedCategory: String?,
    onSelectCategory: (String?) -> Unit,
    onOpenFilters: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchChange,
                modifier = Modifier.weight(1f),
                singleLine = true,
                maxLines = 1,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = "") },
                placeholder = { Text("Cari nama atau kategori menu", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                shape = RoundedCornerShape(24.dp)
            )
            Box(contentAlignment = Alignment.TopEnd) {
                IconButton(onClick = onOpenFilters) { Icon(Icons.Filled.FilterList, contentDescription = MerchantTextCatalog.translate("Filter menu"), tint = Primary) }
                if (activeFilterCount > 0) Surface(color = Accent, shape = CircleShape, modifier = Modifier.size(16.dp)) { Box(contentAlignment = Alignment.Center) { Text("$activeFilterCount", color = Color.White, style = MaterialTheme.typography.labelSmall) } }
            }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(
                selected = selectedCategory == null,
                onClick = { onSelectCategory(null) },
                label = { Text("Semua ($menuCount)", maxLines = 1) },
                shape = RoundedCornerShape(18.dp)
            )
            categories.forEach { (category, count) ->
                FilterChip(
                    selected = selectedCategory == category,
                    onClick = { onSelectCategory(category) },
                    label = { Text("$category ($count)", maxLines = 1) },
                    shape = RoundedCornerShape(18.dp)
                )
            }
        }
    }
}

@Composable
private fun MenuCatalogCard(item: MenuItem, isPromoted: Boolean, isActionLoading: Boolean, onEdit: () -> Unit, onToggle: () -> Unit) {
    Card(onClick = onEdit, modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shape = RoundedCornerShape(TembusRadius.Card)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            MenuImage(item)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                    Text(item.nama.ifBlank { "Nama menu belum tersedia" }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    IconButton(onClick = onEdit, modifier = Modifier.size(32.dp)) { Icon(Icons.Filled.Edit, contentDescription = MerchantTextCatalog.translate("Edit ${item.nama}"), modifier = Modifier.size(18.dp), tint = Primary) }
                }
                Text(Format.rupiah(item.harga), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = Primary)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    MenuStatusPill(item)
                    if (isPromoted) Surface(color = AccentSoft, shape = RoundedCornerShape(TembusRadius.Chip)) { Text("Promo aktif", modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall, color = Accent, fontWeight = FontWeight.SemiBold) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Terjual hari ini ${item.dailySalesCount}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(stockLabel(item), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Switch(checked = item.isAvailable, onCheckedChange = { onToggle() }, enabled = !isActionLoading)
                if (isActionLoading) CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = Primary)
            }
        }
    }
}

@Composable
private fun MenuImage(item: MenuItem) {
    if (item.foto.isNullOrBlank()) Surface(shape = RoundedCornerShape(12.dp), color = PrimarySoft, modifier = Modifier.size(76.dp)) {
        Icon(Icons.Filled.RestaurantMenu, contentDescription = "", tint = Primary, modifier = Modifier.padding(22.dp))
    } else AsyncImage(model = item.foto, contentDescription = item.nama, contentScale = ContentScale.Crop, modifier = Modifier.size(76.dp).clip(RoundedCornerShape(12.dp)))
}

@Composable
private fun MenuStatusPill(item: MenuItem) {
    val (label, color, container) = when {
        !item.isAvailable || item.status == "sold_out" || item.stockQuantity == 0 -> Triple("Stok habis", Accent, AccentSoft)
        item.status == "draft" || item.moderationStatus == "pending" -> Triple("Menunggu review", MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
        item.status == "scheduled" -> Triple("Terjadwal", Primary, PrimarySoft)
        else -> Triple("Tersedia", Primary, PrimarySoft)
    }
    Surface(color = container, shape = RoundedCornerShape(TembusRadius.Chip)) { Text(label, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall, color = color, fontWeight = FontWeight.SemiBold) }
}

private fun stockLabel(item: MenuItem): String = when {
    item.stockQuantity == null -> "Stok tanpa batas"
    item.stockQuantity == 0 -> "Stok 0"
    else -> "Stok ${item.stockQuantity}"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MenuFilterSheet(filters: MenuFilters, categories: List<String>, hasPromos: Boolean, totalFiltered: Int, onChange: (MenuFilters) -> Unit, onReset: () -> Unit, onDismiss: () -> Unit, onApply: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = PrimaryPale) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("Filter & kelola menu", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Primary); Text("Atur tampilan katalog dari data server", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                TextButton(onClick = onReset) { Text("Atur ulang") }
                IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = MerchantTextCatalog.translate("Tutup filter")) }
            }
            Text("Status ketersediaan", fontWeight = FontWeight.Bold)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { MenuStatusFilter.values().forEach { status -> FilterChip(selected = filters.status == status, onClick = { onChange(filters.copy(status = status)) }, label = { Text(status.label) }) } }
            if (categories.isNotEmpty()) {
                Text("Kategori menu", fontWeight = FontWeight.Bold)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = filters.category == null, onClick = { onChange(filters.copy(category = null)) }, label = { Text("Semua") })
                    categories.forEach { category -> FilterChip(selected = filters.category == category, onClick = { onChange(filters.copy(category = category)) }, label = { Text(category) }) }
                }
            }
            Text("Urutkan tampilan menu", fontWeight = FontWeight.Bold)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { MenuSort.values().forEach { sort -> FilterChip(selected = filters.sort == sort, onClick = { onChange(filters.copy(sort = sort)) }, label = { Text(sort.label) }) } }
            Text("Rentang harga menu", fontWeight = FontWeight.Bold)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = filters.minPrice, onValueChange = { onChange(filters.copy(minPrice = it.filter(Char::isDigit))) }, label = { Text("Minimum") }, prefix = { Text("Rp ") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                OutlinedTextField(value = filters.maxPrice, onValueChange = { onChange(filters.copy(maxPrice = it.filter(Char::isDigit))) }, label = { Text("Maksimum") }, prefix = { Text("Rp ") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("Hanya menu dengan promo aktif", fontWeight = FontWeight.SemiBold); Text(if (hasPromos) "Status promo dibaca dari modul Promo" else "Belum ada promo aktif dari server", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Switch(checked = filters.onlyPromoted, onCheckedChange = { onChange(filters.copy(onlyPromoted = it)) }, enabled = hasPromos)
            }
            Button(onClick = onApply, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Primary)) { Text("Terapkan filter ($totalFiltered menu)") }
        }
    }
}

@Composable
private fun MenuFilteredEmpty(isFiltered: Boolean, onReset: () -> Unit, onAdd: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(if (isFiltered) Icons.Filled.FilterList else Icons.Filled.Inventory2, contentDescription = "", tint = Primary, modifier = Modifier.size(42.dp))
            Text(if (isFiltered) "Tidak ada menu yang cocok" else "Belum ada menu", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(if (isFiltered) "Ubah filter atau cari dengan kata kunci lain." else "Tambahkan menu dari katalog server untuk mulai menerima pesanan.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (isFiltered) OutlinedButton(onClick = onReset) { Text("Hapus filter") } else Button(onClick = onAdd) { Text("Tambah menu") }
        }
    }
}

@Composable
private fun MenuInlineError(message: String, onRetry: () -> Unit) {
    Surface(color = AccentSoft, shape = RoundedCornerShape(TembusRadius.Card), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, modifier = Modifier.weight(1f), color = Accent, style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = onRetry) { Icon(Icons.Filled.Refresh, contentDescription = ""); Spacer(Modifier.size(4.dp)); Text("Coba lagi") }
        }
    }
}

@Composable
private fun MenuImportPreviewDialog(result: MenuImportParseResult, isImporting: Boolean, onDismiss: () -> Unit, onImport: () -> Unit) {
    Dialog(onDismissRequest = { if (!isImporting) onDismiss() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Card(Modifier.fillMaxWidth().padding(24.dp), shape = RoundedCornerShape(20.dp)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Preview impor menu", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("${result.rows.size} baris valid akan dikirim ke server.")
                result.rows.take(5).forEach { row -> Text("Baris ${row.lineNumber}: ${row.request.nama} • ${row.request.kategori} • ${Format.rupiah(row.request.harga)}", style = MaterialTheme.typography.bodySmall) }
                if (result.rows.size > 5) Text("… dan ${result.rows.size - 5} baris lainnya", style = MaterialTheme.typography.bodySmall)
                result.errors.take(8).forEach { error -> Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    OutlinedButton(onClick = onDismiss, enabled = !isImporting) { Text("Batal") }; Spacer(Modifier.size(8.dp))
                    Button(onClick = onImport, enabled = result.rows.isNotEmpty() && !isImporting) { if (isImporting) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Impor ke server") }
                }
            }
        }
    }
}

@Composable
private fun MenuLoadError(message: String, onRetry: () -> Unit, modifier: Modifier) {
    Column(modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(message, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center); Spacer(Modifier.size(12.dp)); Button(onClick = onRetry) { Text("Coba Lagi") }
    }
}

private fun MenuFilters.activeCount(): Int = listOf(status != MenuStatusFilter.ALL, category != null, sort != MenuSort.UPDATED, minPrice.isNotBlank(), maxPrice.isNotBlank(), onlyPromoted).count { it }
