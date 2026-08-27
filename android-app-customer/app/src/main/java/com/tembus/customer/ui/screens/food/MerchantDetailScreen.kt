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
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import androidx.compose.foundation.Image
import com.tembus.customer.R
import androidx.compose.ui.res.painterResource
import com.tembus.customer.data.model.FoodMenuItem
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.data.model.FoodOrderItemVariantRequest
import com.tembus.customer.data.model.MenuItemVariant
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight
import com.tembus.customer.ui.theme.Success
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.Warning
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
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .background(MaterialTheme.colorScheme.surface)
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
                    Text(error ?: "Terjadi kesalahan", color = Error, fontWeight = FontWeight.Bold)
                }
            }
            merchant != null -> {
                val m = merchant!!
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Header merchant — FOOD-IMG (2026-08-27): full-width hero image.
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(TembusRadius.Card))
                                .background(MaterialTheme.colorScheme.surface)
                        ) {
                            // Hero image (food/store cover) with branded gradient fallback.
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(160.dp)
                                    .background(
                                        Brush.linearGradient(
                                            listOf(PrimaryLight, Primary.copy(alpha = 0.55f))
                                        )
                                    )
                            ) {
                                // Hero image: merchant cover, fallback to first menu item photo (real food), else gradient+icon.
                                val heroUrl = m.imageUrl ?: m.menuItems.firstOrNull()?.foto
                                if (!heroUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = heroUrl,
                                        contentDescription = m.name,
                                        modifier = Modifier.fillMaxSize(),
                                        contentScale = ContentScale.Crop
                                    )
                                } else {
                                    // Brand-gradient placeholder with a food emoji (backend hasn't sent a photo yet).
                                    Box(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .background(Brush.linearGradient(listOf(PrimaryLight, Primary.copy(alpha = 0.55f)))),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(foodEmojiFor(m.id ?: m.name), fontSize = 64.sp)
                                    }
                                }
                            }
                            Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                                Text(m.name, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
                                Text(m.address, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (m.avgRating != null && m.avgRating > 0) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Star, contentDescription = null, tint = Warning, modifier = Modifier.size(16.dp))
                                        Text(
                                            String.format(Locale.US, "%.1f", m.avgRating),
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                                Text("•", color = MaterialTheme.colorScheme.outlineVariant)
                                Text(
                                    if (m.isOpen) "Buka sekarang" else "Tutup",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (m.isOpen) Success else Error
                                )
                                if (m.jamBuka != null && m.jamTutup != null) {
                                    Text("•", color = MaterialTheme.colorScheme.outlineVariant)
                                    Text("${m.jamBuka} - ${m.jamTutup}", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            // ADR 003: badge halal / non-halal
                            if (m.halalStatus == "halal_certified" || m.halalStatus == "non_halal") {
                                Row(
                                    modifier = Modifier
                                        .padding(top = 12.dp)
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(
                                            if (m.halalStatus == "halal_certified") Success.copy(alpha = 0.12f)
                                            else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f)
                                        )
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(CircleShape)
                                            .background(
                                                if (m.halalStatus == "halal_certified") Success
                                                else MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                    )
                                    Spacer(Modifier.size(6.dp))
                                    Text(
                                        if (m.halalStatus == "halal_certified") "Bersertifikat Halal" else "Non-Halal",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = if (m.halalStatus == "halal_certified") Success else MaterialTheme.colorScheme.onSurfaceVariant
                                    )
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
                                    .clip(RoundedCornerShape(TembusRadius.Card))
                                    .background(MaterialTheme.colorScheme.surface)
                                    .padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text("Belum ada menu", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
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
                    Text("Batal", color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                        .clip(RoundedCornerShape(16.dp)),
                    contentScale = ContentScale.Crop
                )
                Spacer(modifier = Modifier.height(16.dp))
            }
            Text(
                item.name,
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurface,
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
                color = MaterialTheme.colorScheme.onSurfaceVariant
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
                    color = MaterialTheme.colorScheme.onSurface
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
                shape = RoundedCornerShape(TembusRadius.Button)
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
                color = MaterialTheme.colorScheme.onSurface
            )
            if (variant.isRequired) {
                Text(
                    " • Wajib",
                    fontSize = 11.sp,
                    color = Error,
                    fontWeight = FontWeight.Bold
                )
            }
            if (multi) {
                Text(
                    " • max ${variant.maxSelect}",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        variant.options.forEach { opt ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(TembusRadius.Chip))
                    .background(if (multi) {
                        if (opt.id in selectedMulti) PrimaryLight else MaterialTheme.colorScheme.surfaceVariant
                    } else {
                        if (opt.id == selectedSingle) PrimaryLight else MaterialTheme.colorScheme.surfaceVariant
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
                    color = MaterialTheme.colorScheme.onSurface,
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
                        color = Success
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
            .clip(RoundedCornerShape(TembusRadius.Card))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                item.name,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.onSurface,
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
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Button(
            onClick = onAdd,
            modifier = Modifier.size(40.dp),
            shape = CircleShape,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)
        ) {
            Icon(Icons.Default.Add, contentDescription = "Tambah", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(20.dp))
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
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .padding(vertical = 6.dp)
    )
}
