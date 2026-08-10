package com.tembus.merchant.ui.screens.menu

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import coil.compose.AsyncImage
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.data.model.MenuItemRequest
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Accent
import kotlinx.coroutines.launch

/**
 * MenuScreen — tab Menu: CRUD menu item + toggle ketersediaan.
 */
@Composable
fun MenuScreen(
    onOpenVariants: (String) -> Unit, // FB-108
    viewModel: MenuViewModel = appViewModel { MenuViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    var editorTarget by remember { mutableStateOf<MenuItem?>(null) }
    var showEditor by remember { mutableStateOf(false) }

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

    if (showEditor || editorTarget != null) {
        MenuItemEditorSheet(
            existing = editorTarget,
            onUploadPhoto = { file -> viewModel.uploadPhoto(file) },
            onDismiss = {
                showEditor = false
                editorTarget = null
            },
            onSave = { request ->
                val target = editorTarget
                if (target == null) {
                    viewModel.createItem(request)
                } else {
                    viewModel.updateItem(target.id, request)
                }
                showEditor = false
                editorTarget = null
            }
        )
    }

    // Layout manual (Box) — tanpa early-return@label (return@Column dari lambda
    // non-inline + recompose = group imbalance Compose → IntStack.peek2 crash,
    // bug report 2026-08). Semua cabang pakai if/else EKSPLISIT biar struktur
    // group statis antar recomposition.
    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
        ) {
            when {
                state.isLoading && state.items.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }

                state.items.isEmpty() -> {
                    EmptyMenuContent(onAdd = { showEditor = true })
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 88.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(state.items, key = { it.id }) { item ->
                            MenuItemCard(
                                item = item,
                                isActionLoading = state.actionLoadingId == item.id,
                                onToggleAvailability = { viewModel.toggleAvailability(item) },
                                onEdit = { editorTarget = item },
                                onVariants = { onOpenVariants(item.id) }, // FB-108
                                onDelete = { viewModel.deleteItem(item.id) }
                            )
                        }
                    }
                }
            }
        }

        // FAB hanya saat menu sudah ada — empty state sudah punya tombol
        // "Tambah Menu" di tengah (duplikat CTA dihindari).
        if (state.items.isNotEmpty()) {
            ExtendedFloatingActionButton(
                onClick = { showEditor = true },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Tambah Menu") },
                containerColor = Accent,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
            )
        }
    }
}

@Composable
private fun MenuItemCard(
    item: MenuItem,
    isActionLoading: Boolean,
    onToggleAvailability: () -> Unit,
    onEdit: () -> Unit,
    onVariants: () -> Unit, // FB-108
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.nama,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = item.kategori.ifBlank { "Tanpa kategori" },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = Format.rupiah(item.harga),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = "Prep: ${item.prepTimeMinutes} menit",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Switch(
                    checked = item.isAvailable,
                    onCheckedChange = { onToggleAvailability() },
                    enabled = !isActionLoading
                )
                Text(
                    text = if (item.isAvailable) "Tersedia" else "Habis",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (item.isAvailable) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            IconButton(onClick = onVariants, enabled = !isActionLoading) {
                Icon(Icons.Filled.Tune, contentDescription = "Varian", modifier = Modifier.size(20.dp))
            }
            IconButton(onClick = onEdit, enabled = !isActionLoading) {
                Icon(Icons.Filled.Edit, contentDescription = "Edit", modifier = Modifier.size(20.dp))
            }
            IconButton(onClick = onDelete, enabled = !isActionLoading) {
                Icon(
                    Icons.Filled.Delete,
                    contentDescription = "Hapus",
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun MenuItemEditorSheet(
    existing: MenuItem?,
    onUploadPhoto: suspend (java.io.File) -> Result<String>,
    onDismiss: () -> Unit,
    onSave: (MenuItemRequest) -> Unit
) {
    var nama by remember(existing?.id) { mutableStateOf(existing?.nama ?: "") }
    var harga by remember(existing?.id) { mutableStateOf(existing?.harga?.toString() ?: "") }
    var kategori by remember(existing?.id) { mutableStateOf(existing?.kategori ?: "") }
    var prepTime by remember(existing?.id) { mutableStateOf(existing?.prepTimeMinutes?.toString() ?: "15") }
    var foto by remember(existing?.id) { mutableStateOf(existing?.foto ?: "") }
    var uploading by remember { mutableStateOf(false) }
    var uploadError by remember { mutableStateOf<String?>(null) }
    var kategoriExpanded by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // FB-110: PhotoPicker galeri → copy ke cache → upload → URL diisi ke field foto.
    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            uploadError = null
            scope.launch {
                uploading = true
                val file = uri.toCacheImageFile(context)
                if (file == null) {
                    uploading = false
                    uploadError = "Gagal membaca foto dari galeri"
                } else {
                    onUploadPhoto(file)
                        .onSuccess { url -> foto = url }
                        .onFailure { e -> uploadError = e.message ?: "Gagal upload foto" }
                    uploading = false
                }
            }
        }
    }

    // Opsi kategori & waktu siap — nilai existing (data lama) ikut dimasukkan
    // kalau custom, biar saat edit dropdown/chip tetap menampilkan nilai lama.
    val kategoriList = remember(existing?.id) {
        val base = listOf("Makanan", "Minuman", "Snack", "Dessert", "Lainnya")
        val existingKategori = existing?.kategori?.trim()
        if (!existingKategori.isNullOrBlank() && existingKategori !in base) base + existingKategori else base
    }
    val prepOptions = remember(existing?.id) {
        val base = listOf("5", "10", "15", "20", "30")
        val existingPrep = existing?.prepTimeMinutes?.toString()
        if (!existingPrep.isNullOrBlank() && existingPrep !in base) base + existingPrep else base
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = if (existing == null) "Tambah Menu" else "Edit Menu",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            // ── Foto menu: area besar, tap untuk upload dari galeri ──
            if (uploading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(modifier = Modifier.size(32.dp), strokeWidth = 3.dp)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Mengunggah foto...",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable {
                            photoPicker.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        },
                    contentAlignment = Alignment.Center
                ) {
                    if (foto.isNotBlank()) {
                        AsyncImage(
                            model = foto,
                            contentDescription = "Foto menu",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                        // Overlay gelap + label "Ganti foto"
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color.Black.copy(alpha = 0.35f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null, tint = Color.White)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Ganti foto", color = Color.White, style = MaterialTheme.typography.titleSmall)
                            }
                        }
                    } else {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = Icons.Filled.AddPhotoAlternate,
                                contentDescription = null,
                                modifier = Modifier.size(44.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Upload foto menu", style = MaterialTheme.typography.titleMedium)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                "JPG/PNG/WebP maks 2MB — dari galeri",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            uploadError?.let { msg ->
                Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            OutlinedTextField(
                value = nama,
                onValueChange = { nama = it },
                label = { Text("Nama menu*") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
                value = harga,
                onValueChange = { harga = it.filter { c -> c.isDigit() } },
                label = { Text("Harga") },
                prefix = { Text("Rp ") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )

            // ── Kategori: dropdown standar ──
            ExposedDropdownMenuBox(
                expanded = kategoriExpanded,
                onExpandedChange = { kategoriExpanded = it }
            ) {
                OutlinedTextField(
                    value = kategori,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Kategori") },
                    placeholder = { Text("Pilih kategori") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = kategoriExpanded) },
                    singleLine = true,
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = kategoriExpanded,
                    onDismissRequest = { kategoriExpanded = false }
                ) {
                    kategoriList.forEach { k ->
                        DropdownMenuItem(
                            text = { Text(k) },
                            onClick = {
                                kategori = k
                                kategoriExpanded = false
                            }
                        )
                    }
                }
            }

            // ── Waktu siap: preset cepat (chip) ──
            Text(
                text = "Waktu siap",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                prepOptions.forEach { p ->
                    FilterChip(
                        selected = prepTime == p,
                        onClick = { prepTime = p },
                        label = { Text("$p mnt") }
                    )
                }
            }

            // ── Alternatif: tempel URL (opsional, power user) ──
            OutlinedTextField(
                value = foto,
                onValueChange = { foto = it },
                label = { Text("atau tempel URL foto (opsional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Button(
                onClick = {
                    onSave(
                        MenuItemRequest(
                            nama = nama.trim(),
                            harga = harga.toLongOrNull() ?: 0,
                            kategori = kategori.trim(),
                            prepTimeMinutes = prepTime.toIntOrNull() ?: 15,
                            foto = foto.trim().ifBlank { null },
                            isAvailable = existing?.isAvailable
                        )
                    )
                },
                enabled = nama.isNotBlank() && (harga.toLongOrNull() ?: 0) > 0,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                Text(
                    if (existing == null) "Simpan Menu" else "Simpan Perubahan",
                    style = MaterialTheme.typography.titleMedium
                )
            }
        }
    }
}

// FB-110: salin foto dari galeri (content://) ke file cache supaya bisa di-upload.
private fun Uri.toCacheImageFile(context: Context): java.io.File? = runCatching {
    val bytes = context.contentResolver.openInputStream(this)?.use { it.readBytes() } ?: return null
    val f = java.io.File(context.cacheDir, "menu_${System.currentTimeMillis()}.jpg")
    f.writeBytes(bytes)
    f
}.getOrNull()

@Composable
private fun EmptyMenuContent(onAdd: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Filled.RestaurantMenu,
            contentDescription = null,
            modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Menu masih kosong",
            style = MaterialTheme.typography.titleMedium
        )
        Text(
            text = "Tambahkan menu pertamamu agar customer bisa memesan.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onAdd) {
            Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text("Tambah Menu")
        }
    }
}
