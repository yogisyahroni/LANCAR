package com.tembus.customer.ui.screens.food

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.tembus.customer.data.model.FoodMenuItem
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.data.model.FoodOrderItemVariantRequest
import com.tembus.customer.data.model.MenuItemVariant
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight
import java.util.Locale

// FOOD-BIKE-056: detail merchant + daftar menu, jam buka/tutup, badge ramah sepeda
@Composable
fun MerchantDetailScreen(
    merchantId: String,
    onBack: () -> Unit,
    onCartClick: () -> Unit,
    viewModel: FoodViewModel = hiltViewModel()
) {
    val merchant by viewModel.merchantDetail.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    val cartSize by viewModel.cartSize.collectAsState()
    val conflict by viewModel.conflictRequest.collectAsState()

    // FB-120: item yang dipilih untuk dilihat detail (bottom sheet).
    var detailItem by remember { mutableStateOf<FoodMenuItem?>(null) }

    LaunchedEffect(merchantId) {
        viewModel.loadMerchantDetail(merchantId)
    }

    Scaffold(
        containerColor = Color(0xFFF7F8FA),
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .background(Color.White)
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = Primary)
                }
                Text(
                    merchant?.name ?: "Detail Merchant",
                    modifier = Modifier.weight(1f),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Primary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Box {
                    IconButton(onClick = onCartClick) {
                        Icon(Icons.Default.ShoppingCart, contentDescription = "Keranjang", tint = Primary)
                    }
                    if (cartSize > 0) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(top = 6.dp, end = 6.dp)
                                .size(18.dp)
                                .clip(CircleShape)
                                .background(Accent),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(cartSize.toString(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        }
                    }
                }
            }
        }
    ) { padding ->
        when {
            loading && merchant == null -> {
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Primary)
                }
            }
            error != null && merchant == null -> {
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    Text(error ?: "Terjadi kesalahan", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold)
                }
            }
            merchant != null -> {
                val m = merchant!!
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Header merchant
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(20.dp))
                                .background(Color.White)
                                .padding(16.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(56.dp)
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(PrimaryLight),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Default.Store, contentDescription = null, tint = Primary, modifier = Modifier.size(30.dp))
                                }
                                Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                                    Text(m.name, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF0F172A))
                                    Text(m.address, fontSize = 12.sp, color = Color(0xFF64748B), maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (m.avgRating != null && m.avgRating > 0) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFF59E0B), modifier = Modifier.size(16.dp))
                                        Text(
                                            String.format(Locale.US, "%.1f", m.avgRating),
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                                Text("•", color = Color(0xFFCBD5E1))
                                Text(
                                    if (m.isOpen) "Buka sekarang" else "Tutup",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (m.isOpen) Color(0xFF16A34A) else Color(0xFFEF4444)
                                )
                                if (m.jamBuka != null && m.jamTutup != null) {
                                    Text("•", color = Color(0xFFCBD5E1))
                                    Text("${m.jamBuka} - ${m.jamTutup}", fontSize = 13.sp, color = Color(0xFF64748B))
                                }
                            }
                            // Badge ramah kurir sepeda
                            Row(
                                modifier = Modifier
                                    .padding(top = 12.dp)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(PrimaryLight)
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Info, contentDescription = null, tint = Primary, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.size(6.dp))
                                Text(
                                    "Ramah Kurir Sepeda",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Primary
                                )
                            }
                        }
                    }

                    // Daftar menu
                    if (m.menuItems.isEmpty()) {
                        item {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(20.dp))
                                    .background(Color.White)
                                    .padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text("Belum ada menu", fontSize = 14.sp, color = Color(0xFF64748B), fontWeight = FontWeight.SemiBold)
                            }
                        }
                    } else {
                        // FB-118: menu dikelompokkan per kategori (sticky header).
                        // Item tanpa kategori dikumpulkan di bawah "Lainnya".
                        val grouped = LinkedHashMap<String, MutableList<FoodMenuItem>>()
                        m.menuItems.forEach { menuItem ->
                            val key = menuItem.kategori?.trim()?.ifEmpty { null } ?: "Lainnya"
                            grouped.getOrPut(key) { mutableListOf() }.add(menuItem)
                        }
                        grouped.forEach { (kategori, items) ->
                            item(key = "header_$kategori") {
                                CategoryHeader(title = kategori)
                            }
                            items(items, key = { it.id }) { item ->
                                MenuItemRow(
                                    item = item,
                                    // FB-108: item ber-varian wajib lewat detail sheet
                                    // (pilih opsi dulu), yang polos langsung add.
                                    onAdd = {
                                        if (item.variants.isNotEmpty()) detailItem = item
                                        else viewModel.addToCart(item, merchantName = merchant?.name)
                                    },
                                    onClick = { detailItem = item }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // FB-102: konfirmasi ganti merchant — cart berisi item dari toko lain.
    conflict?.let { c ->
        AlertDialog(
            onDismissRequest = { viewModel.resolveConflict(proceed = false) },
            title = { Text("Ganti merchant?", fontWeight = FontWeight.ExtraBold) },
            text = {
                Text(
                    "Keranjang kamu berisi item dari ${c.otherMerchantName ?: "merchant lain"}. " +
                        "Mulai order baru dari ${c.newMerchantName ?: "merchant ini"}? " +
                        "Item sebelumnya akan dihapus."
                )
            },
            confirmButton = {
                Button(onClick = { viewModel.resolveConflict(proceed = true) }) {
                    Text("Mulai Order Baru", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.resolveConflict(proceed = false) }) {
                    Text("Batal", color = Color(0xFF64748B))
                }
            }
        )
    }

    // FB-120: bottom sheet detail item — foto besar + quantity stepper.
    // FB-108: bottom sheet juga jadi variant picker (radio/checkbox per grup).
    detailItem?.let { item ->
        ItemDetailSheet(
            item = item,
            onDismiss = { detailItem = null },
            onAdd = { qty, selections, labels ->
                repeat(qty) {
                    viewModel.addToCart(
                        item,
                        merchantName = merchant?.name,
                        selectedVariants = selections,
                        variantLabels = labels
                    )
                }
                detailItem = null
            }
        )
    }
}

/** FB-120+FB-108: detail item menu — foto besar, harga, PICKER VARIAN,
 * stepper qty, tombol tambah. Varian wajib (is_required) harus dipilih dulu
 * sebelum tombol aktif. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ItemDetailSheet(
    item: FoodMenuItem,
    onDismiss: () -> Unit,
    onAdd: (Int, List<FoodOrderItemVariantRequest>, List<String>) -> Unit
) {
    var quantity by remember(item.id) { mutableStateOf(1) }
    // FB-108: variantId → pilihan (optionId) untuk multi-select (max_select > 1)
    var multiSelect by remember(item.id) { mutableStateOf<Map<String, Set<String>>>(emptyMap()) }
    // FB-108: variantId → optionId untuk single-select (radio)
    var singleSelect by remember(item.id) { mutableStateOf<Map<String, String>>(emptyMap()) }

    val variants = item.variants
    // Harga total = harga dasar + delta semua opsi terpilih
    val selectedDelta = variants.sumOf { v ->
        val chosen: List<String> = if (v.maxSelect > 1) multiSelect[v.id].orEmpty().toList() else listOfNotNull(singleSelect[v.id])
        chosen.sumOf { optionId ->
            v.options.firstOrNull { it.id == optionId }?.priceDelta ?: 0L
        }
    }
    val totalPrice = item.price + selectedDelta

    // Validasi: semua grup required sudah terpilih
    val requiredMissing = variants.any { v ->
        v.isRequired && if (v.maxSelect > 1) multiSelect[v.id].isNullOrEmpty() else singleSelect[v.id] == null
    }

    // Label ringkas untuk display (mis. "Level Pedas: Extra Pedas")
    val selectionLabels = remember(singleSelect, multiSelect) {
        variants.mapNotNull { v ->
            val chosen: List<String> = if (v.maxSelect > 1) multiSelect[v.id].orEmpty().toList() else listOfNotNull(singleSelect[v.id])
            if (chosen.isEmpty()) null
            else {
                val names = chosen.mapNotNull { optionId -> v.options.firstOrNull { it.id == optionId }?.nama }
                "${v.nama}: ${names.joinToString(", ")}"
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (!item.foto.isNullOrBlank()) {
                AsyncImage(
                    model = item.foto,
                    contentDescription = item.name,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp)
                        .clip(RoundedCornerShape(20.dp)),
                    contentScale = ContentScale.Crop
                )
                Spacer(modifier = Modifier.height(16.dp))
            }
            Text(
                item.name,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Color(0xFF0F172A),
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                "Rp ${totalPrice.toInt().toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".")}",
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Primary
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "Estimasi siap ±${item.prepTimeMinutes} menit",
                fontSize = 12.sp,
                color = Color(0xFF94A3B8)
            )

            // FB-108: pilihan varian — scrollable kalau banyak
            if (variants.isNotEmpty()) {
                Spacer(modifier = Modifier.height(16.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 300.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    variants.forEach { v ->
                        VariantGroupPicker(
                            variant = v,
                            selectedMulti = multiSelect[v.id].orEmpty(),
                            selectedSingle = singleSelect[v.id],
                            onSingle = { optionId ->
                                singleSelect = singleSelect + (v.id to optionId)
                            },
                            onMultiToggle = { optionId, checked ->
                                val current = multiSelect[v.id].orEmpty().toMutableSet()
                                if (checked) {
                                    // Batasi max_select
                                    if (current.size < v.maxSelect) current.add(optionId)
                                } else current.remove(optionId)
                                multiSelect = multiSelect + (v.id to current)
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Quantity stepper
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                FilledTonalIconButton(
                    onClick = { if (quantity > 1) quantity-- },
                    enabled = quantity > 1
                ) {
                    Icon(Icons.Default.Remove, contentDescription = "Kurangi")
                }
                Text(
                    "$quantity",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF0F172A)
                )
                FilledTonalIconButton(onClick = { if (quantity < 99) quantity++ }) {
                    Icon(Icons.Default.Add, contentDescription = "Tambah")
                }
            }
            Spacer(modifier = Modifier.height(20.dp))
            Button(
                onClick = {
                    // Build request variants: semua grup yang terpilih (required
                    // maupun opsional yang user pilih).
                    val selections = buildList {
                        variants.forEach { v ->
                            val chosen: List<String> = if (v.maxSelect > 1) multiSelect[v.id].orEmpty().toList() else listOfNotNull(singleSelect[v.id])
                            chosen.forEach { optionId ->
                                add(FoodOrderItemVariantRequest(variantId = v.id, optionId = optionId))
                            }
                        }
                    }
                    onAdd(quantity, selections, selectionLabels)
                },
                enabled = !requiredMissing,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                Text(
                    if (requiredMissing) "Pilih varian wajib dulu" else "Tambah $quantity ke Keranjang",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }
        }
    }
}

/** FB-108: satu grup varian — radio (single) atau checkbox (multi). */
@Composable
private fun VariantGroupPicker(
    variant: MenuItemVariant,
    selectedMulti: Set<String>,
    selectedSingle: String?,
    onSingle: (String) -> Unit,
    onMultiToggle: (String, Boolean) -> Unit
) {
    val multi = variant.maxSelect > 1
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                variant.nama,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 14.sp,
                color = Color(0xFF0F172A)
            )
            if (variant.isRequired) {
                Text(
                    " • Wajib",
                    fontSize = 11.sp,
                    color = Color(0xFFEF4444),
                    fontWeight = FontWeight.Bold
                )
            }
            if (multi) {
                Text(
                    " • max ${variant.maxSelect}",
                    fontSize = 11.sp,
                    color = Color(0xFF94A3B8)
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        variant.options.forEach { opt ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (multi) {
                        if (opt.id in selectedMulti) Color(0xFFFFF3E8) else Color(0xFFF8FAFC)
                    } else {
                        if (opt.id == selectedSingle) Color(0xFFFFF3E8) else Color(0xFFF8FAFC)
                    })
                    .clickable {
                        if (multi) onMultiToggle(opt.id, opt.id !in selectedMulti)
                        else onSingle(opt.id)
                    }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (multi) {
                    Checkbox(
                        checked = opt.id in selectedMulti,
                        onCheckedChange = { onMultiToggle(opt.id, it) },
                        modifier = Modifier.scale(0.9f)
                    )
                } else {
                    RadioButton(
                        selected = opt.id == selectedSingle,
                        onClick = { onSingle(opt.id) },
                        modifier = Modifier.scale(0.9f)
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    opt.nama,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF334155),
                    modifier = Modifier.weight(1f)
                )
                if (opt.priceDelta > 0) {
                    Text(
                        "+Rp ${opt.priceDelta.toInt().toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".")}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Primary
                    )
                } else if (opt.priceDelta < 0) {
                    Text(
                        "-Rp ${(-opt.priceDelta).toInt().toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".")}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF16A34A)
                    )
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
        }
    }
}

@Composable
private fun MenuItemRow(item: FoodMenuItem, onAdd: () -> Unit, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White)
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                item.name,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = Color(0xFF0F172A),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                "Rp ${item.price.toInt().toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".")}",
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Primary,
                modifier = Modifier.padding(top = 4.dp)
            )
            Text(
                "±${item.prepTimeMinutes} mnt",
                fontSize = 11.sp,
                color = Color(0xFF94A3B8)
            )
        }
        Button(
            onClick = onAdd,
            modifier = Modifier.size(40.dp),
            shape = CircleShape,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)
        ) {
            Icon(Icons.Default.Add, contentDescription = "Tambah", tint = Color.White, modifier = Modifier.size(20.dp))
        }
    }
}

/** FB-118: header section kategori menu (sticky saat scroll). */
@Composable
private fun CategoryHeader(title: String) {
    Text(
        text = title.replaceFirstChar { c -> c.uppercase(Locale.US) },
        fontSize = 16.sp,
        fontWeight = FontWeight.ExtraBold,
        color = Color(0xFF0F172A),
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFF7F8FA))
            .padding(vertical = 6.dp)
    )
}
