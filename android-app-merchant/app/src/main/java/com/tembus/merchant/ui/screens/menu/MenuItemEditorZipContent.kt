package com.tembus.merchant.ui.screens.menu

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.data.model.MenuItemRequest
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.TembusRadius
import kotlinx.coroutines.launch

/** ZIP editor content shared by the dedicated add/edit routes only. */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun MenuItemEditorZipContent(
    existing: MenuItem?,
    onUploadPhoto: suspend (java.io.File) -> Result<String>,
    isSaving: Boolean,
    saveError: String?,
    onClearSaveError: () -> Unit,
    onOpenVariants: ((String) -> Unit)? = null,
    onDismiss: () -> Unit,
    onSave: (MenuItemRequest) -> Unit
) {
    var nama by remember(existing?.id) { mutableStateOf(existing?.nama ?: "") }
    var harga by remember(existing?.id) { mutableStateOf(existing?.harga?.toString() ?: "") }
    var kategori by remember(existing?.id) { mutableStateOf(existing?.kategori ?: "") }
    var deskripsi by remember(existing?.id) { mutableStateOf(existing?.deskripsi.orEmpty()) }
    var prepTime by remember(existing?.id) { mutableStateOf(existing?.prepTimeMinutes?.toString() ?: "15") }
    var foto by remember(existing?.id) { mutableStateOf(existing?.foto ?: "") }
    var uploading by remember { mutableStateOf(false) }
    var uploadError by remember { mutableStateOf<String?>(null) }
    var kategoriExpanded by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            uploadError = null
            scope.launch {
                uploading = true
                uri.toCacheImageFile(context)
                    .onSuccess { file ->
                        onUploadPhoto(file)
                            .onSuccess { url -> foto = url }
                            .onFailure { error -> uploadError = error.message ?: "Gagal upload foto" }
                    }
                    .onFailure { error -> uploadError = error.message ?: "Gagal membaca foto dari galeri" }
                uploading = false
            }
        }
    }
    val kategoriList = remember(existing?.id) {
        val base = listOf("Makanan", "Minuman", "Snack", "Dessert", "Lainnya")
        val current = existing?.kategori?.trim()
        if (!current.isNullOrBlank() && current !in base) base + current else base
    }
    val prepOptions = remember(existing?.id) {
        val base = listOf("5", "10", "15", "20", "30")
        val current = existing?.prepTimeMinutes?.toString()
        if (!current.isNullOrBlank() && current !in base) base + current else base
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = PrimaryPale) {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 36.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onDismiss) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali") }
                    Text(if (existing == null) "Tambah Menu" else "Edit Menu", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    androidx.compose.material3.TextButton(onClick = onDismiss, enabled = !isSaving) { Text("Batal") }
                }

                if (uploading) {
                    Box(Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(TembusRadius.Card)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(modifier = Modifier.size(32.dp), strokeWidth = 3.dp)
                            Spacer(Modifier.height(8.dp))
                            Text("Mengunggah foto...", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(TembusRadius.Card)).background(MaterialTheme.colorScheme.surfaceVariant).clickable {
                            photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                        contentAlignment = Alignment.Center
                    ) {
                        if (foto.isNotBlank()) {
                            AsyncImage(model = foto, contentDescription = "Foto menu", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null, tint = Color.White)
                                    Spacer(Modifier.size(6.dp))
                                    Text("Ganti foto", color = Color.White)
                                }
                            }
                        } else {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null, modifier = Modifier.size(44.dp), tint = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.size(8.dp))
                                Text("Tambah foto menu", style = MaterialTheme.typography.titleMedium)
                                Text("JPG/PNG/WebP maks 2MB — dari galeri", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                uploadError?.let { Text(it, color = MaterialTheme.colorScheme.error) }

                OutlinedTextField(value = nama, onValueChange = { nama = it }, label = { Text("Nama menu*") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                ExposedDropdownMenuBox(expanded = kategoriExpanded, onExpandedChange = { kategoriExpanded = it }) {
                    OutlinedTextField(value = kategori, onValueChange = {}, readOnly = true, label = { Text("Kategori") }, placeholder = { Text("Pilih kategori") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(kategoriExpanded) }, singleLine = true, modifier = Modifier.menuAnchor().fillMaxWidth())
                    ExposedDropdownMenu(expanded = kategoriExpanded, onDismissRequest = { kategoriExpanded = false }) {
                        kategoriList.forEach { value -> DropdownMenuItem(text = { Text(value) }, onClick = { kategori = value; kategoriExpanded = false }) }
                    }
                }
                OutlinedTextField(value = harga, onValueChange = { harga = it.filter(Char::isDigit) }, label = { Text("Harga") }, prefix = { Text("Rp ") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = deskripsi, onValueChange = { deskripsi = it }, label = { Text("Deskripsi menu") }, minLines = 3, maxLines = 5, modifier = Modifier.fillMaxWidth())

                Text("Waktu siap", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    prepOptions.forEach { value -> FilterChip(selected = prepTime == value, onClick = { prepTime = value }, label = { Text("$value mnt") }) }
                }
                OutlinedTextField(value = foto, onValueChange = { foto = it }, label = { Text("atau tempel URL foto (opsional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())

                if (existing != null && onOpenVariants != null) {
                    OutlinedButton(onClick = { onOpenVariants(existing.id) }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.Tune, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text("Kelola varian menu")
                    }
                }
                saveError?.let { message ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.error)
                        androidx.compose.material3.TextButton(onClick = onClearSaveError) { Text("Tutup") }
                    }
                }
                Button(
                    onClick = {
                        onSave(MenuItemRequest(nama = nama.trim(), harga = harga.toLongOrNull() ?: 0, deskripsi = deskripsi.trim().ifBlank { null }, kategori = kategori.trim(), prepTimeMinutes = prepTime.toIntOrNull() ?: 15, foto = foto.trim().ifBlank { null }, isAvailable = existing?.isAvailable))
                    },
                    enabled = !isSaving && nama.isNotBlank() && (harga.toLongOrNull() ?: 0) > 0,
                    modifier = Modifier.fillMaxWidth().height(52.dp)
                ) {
                    if (isSaving) CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                    else Text(if (existing == null) "Simpan Menu" else "Simpan Perubahan", style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}

private fun Uri.toCacheImageFile(context: Context): Result<java.io.File> = runCatching {
    val bytes = context.contentResolver.openInputStream(this)?.use { it.readBytes() } ?: error("Gagal membaca foto dari galeri")
    require(bytes.size <= 2 * 1024 * 1024) { "Ukuran foto maksimal 2MB" }
    java.io.File(context.cacheDir, "menu_${System.currentTimeMillis()}.jpg").apply { writeBytes(bytes) }
}
