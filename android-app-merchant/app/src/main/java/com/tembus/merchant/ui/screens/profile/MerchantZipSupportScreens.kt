package com.tembus.merchant.ui.screens.profile

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarOutline
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.HorizontalDivider
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantOperatingHour
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.AccentSoft
import com.tembus.merchant.ui.theme.Success
import com.tembus.merchant.ui.theme.TembusRadius
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import java.util.Locale

@Composable
fun OperatingHoursScreen(
    onBack: () -> Unit,
    viewModel: OperatingHoursViewModel = appViewModel { OperatingHoursViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    var draft by remember(state.hours) { mutableStateOf(state.hours) }
    var showClosureDialog by remember { mutableStateOf(false) }
    var closureDate by remember { mutableStateOf("") }
    var closureLabel by remember { mutableStateOf("") }

    MerchantZipDetailScaffold(title = "Atur Jam Operasional", onBack = onBack) {
        when {
            state.isLoading -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
            state.errorMessage != null && state.hours.isEmpty() -> MerchantZipEmptyState(
                message = state.errorMessage ?: "Jam operasional belum tersedia.",
                onRetry = viewModel::load
            )
            else -> {
                Text(
                    "Atur jadwal buka toko. Pelanggan hanya dapat membuat pesanan saat toko sedang buka.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(20.dp))
                MerchantZipInfoCard {
                    weeklyDays.forEachIndexed { index, day ->
                        val hour = draft.firstOrNull { it.weekday == day.weekday }
                            ?: MerchantOperatingHour(weekday = day.weekday, isOpen = false)
                        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(day.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                Switch(
                                    checked = hour.isOpen,
                                    enabled = !state.isSaving,
                                    onCheckedChange = { isOpen ->
                                        draft = draft.replaceOperatingHour(hour.copy(isOpen = isOpen, opensAt = if (isOpen) hour.opensAt ?: "09:00" else null, closesAt = if (isOpen) hour.closesAt ?: "21:00" else null))
                                    }
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(
                                    value = hour.opensAt.orEmpty(),
                                    onValueChange = { value -> draft = draft.replaceOperatingHour(hour.copy(opensAt = value.take(5))) },
                                    label = { Text("Buka") },
                                    enabled = hour.isOpen && !state.isSaving,
                                    singleLine = true,
                                    supportingText = { Text(if (hour.isOpen) "JJ:MM" else "Tutup") },
                                    modifier = Modifier.weight(1f)
                                )
                                Spacer(Modifier.width(8.dp))
                                Text("–")
                                Spacer(Modifier.width(8.dp))
                                OutlinedTextField(
                                    value = hour.closesAt.orEmpty(),
                                    onValueChange = { value -> draft = draft.replaceOperatingHour(hour.copy(closesAt = value.take(5))) },
                                    label = { Text("Tutup") },
                                    enabled = hour.isOpen && !state.isSaving,
                                    singleLine = true,
                                    supportingText = { Text(if (hour.isOpen) "JJ:MM" else "Tutup") },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = hour.lastOrderMinutesBeforeClose.toString(),
                                onValueChange = { value ->
                                    val minutes = value.filter(Char::isDigit).take(3).toIntOrNull() ?: 0
                                    draft = draft.replaceOperatingHour(hour.copy(lastOrderMinutesBeforeClose = minutes))
                                },
                                label = { Text("Batas pesanan (menit sebelum tutup)") },
                                supportingText = { Text(if (hour.isOpen) "0–180 menit; 0 = sampai jam tutup" else "Tutup") },
                                enabled = hour.isOpen && !state.isSaving,
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                        if (index < weeklyDays.lastIndex) HorizontalDivider()
                    }
                }
                Spacer(Modifier.height(24.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Penutupan khusus terjadwal", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    TextButton(onClick = { showClosureDialog = true }, enabled = !state.isSaving) { Text("Tambah tanggal") }
                }
                if (state.closures.isEmpty()) {
                    Text("Belum ada penutupan khusus.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    MerchantZipInfoCard {
                        state.closures.forEachIndexed { index, closure ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Column {
                                    Text(closure.label, fontWeight = FontWeight.SemiBold)
                                    Text(closure.closureDate, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                TextButton(onClick = { viewModel.deleteClosure(closure.id) }, enabled = !state.isSaving) { Text("Hapus") }
                            }
                            if (index < state.closures.lastIndex) HorizontalDivider()
                        }
                    }
                }
                state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                state.saveMessage?.let { Text(it, color = Color(0xFF16A34A), style = MaterialTheme.typography.bodySmall) }
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = { viewModel.save(draft.normalizedOperatingHours()) },
                    enabled = !state.isSaving && draft.size == 7,
                    modifier = Modifier.fillMaxWidth()
                ) { Text(if (state.isSaving) "Menyimpan…" else "Simpan jadwal") }
            }
        }
    }

    if (showClosureDialog) {
        AlertDialog(
            onDismissRequest = { if (!state.isSaving) showClosureDialog = false },
            title = { Text("Tambah penutupan khusus") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Toko akan tutup pada tanggal lokal ini.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedTextField(value = closureLabel, onValueChange = { closureLabel = it.take(120) }, label = { Text("Nama penutupan") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    OutlinedTextField(value = closureDate, onValueChange = { closureDate = it.take(10) }, label = { Text("Tanggal (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                }
            },
            dismissButton = { TextButton(onClick = { showClosureDialog = false }, enabled = !state.isSaving) { Text("Batal") } },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.addClosure(closureDate.trim(), closureLabel.trim()); showClosureDialog = false },
                    enabled = !state.isSaving && closureLabel.isNotBlank() && closureDate.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))
                ) { Text("Tambah") }
            }
        )
    }
}

private data class OperatingDay(val weekday: Int, val label: String)
private val weeklyDays = listOf(
    OperatingDay(1, "Senin"), OperatingDay(2, "Selasa"), OperatingDay(3, "Rabu"),
    OperatingDay(4, "Kamis"), OperatingDay(5, "Jumat"), OperatingDay(6, "Sabtu"), OperatingDay(0, "Minggu")
)

private fun List<MerchantOperatingHour>.replaceOperatingHour(updated: MerchantOperatingHour): List<MerchantOperatingHour> =
    (filterNot { it.weekday == updated.weekday } + updated).sortedBy { weeklyDays.indexOfFirst { day -> day.weekday == it.weekday } }

private fun List<MerchantOperatingHour>.normalizedOperatingHours(): List<MerchantOperatingHour> =
    weeklyDays.map { day -> firstOrNull { it.weekday == day.weekday } ?: MerchantOperatingHour(day.weekday, false) }

/** ZIP Edit Public Profile route — visual parity with the Figma edit profile frame. */
@Composable
@OptIn(ExperimentalLayoutApi::class)
fun EditPublicProfileScreen(
    onBack: () -> Unit,
    viewModel: ProfileViewModel = appViewModel {
        ProfileViewModel(it.merchantRepository, it.authRepository, it.sessionManager)
    }
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var storeName by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var outletName by remember { mutableStateOf("") }
    var shortDescription by remember { mutableStateOf("") }
    var categories by remember { mutableStateOf(emptyList<String>()) }
    var bannerUrl by remember { mutableStateOf("") }
    var logoUrl by remember { mutableStateOf("") }
    var uploadTarget by remember { mutableStateOf<String?>(null) }
    var uploadError by remember { mutableStateOf<String?>(null) }
    var categoryDialogOpen by remember { mutableStateOf(false) }
    var categoryDraft by remember { mutableStateOf("") }

    LaunchedEffect(state.merchant?.id) {
        state.merchant?.let {
            storeName = it.namaToko
            address = it.alamat
            outletName = it.outletName.ifBlank { it.namaToko }
            shortDescription = it.shortDescription
            categories = it.primaryCategories
            bannerUrl = it.bannerUrl
            logoUrl = it.logoUrl
        }
    }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val target = uploadTarget
        if (uri != null && target != null) {
            scope.launch {
                uploadError = null
                val file = uri.toProfileCacheImageFile(context)
                if (file == null) {
                    uploadError = "Gagal membaca gambar dari galeri."
                } else {
                    viewModel.uploadProfileImage(file)
                        .onSuccess { url -> if (target == "banner") bannerUrl = url else logoUrl = url }
                        .onFailure { error -> uploadError = error.message ?: "Gagal mengunggah gambar." }
                }
                uploadTarget = null
            }
        } else {
            uploadTarget = null
        }
    }

    fun pickImage(target: String) {
        uploadTarget = target
        imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    MerchantZipDetailScaffold(
        title = "Ubah Profil Toko",
        onBack = onBack,
        trailing = {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.Close, contentDescription = MerchantTextCatalog.translate("Tutup"))
            }
        }
    ) {
        when {
            state.isLoading -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
            state.merchant == null -> MerchantZipEmptyState(
                message = state.errorMessage ?: "Profil toko belum tersedia.",
                onRetry = viewModel::load
            )
            else -> {
                val merchant = state.merchant!!
                EditProfileHero(
                    bannerUrl = bannerUrl,
                    logoUrl = logoUrl,
                    merchantName = merchant.namaToko,
                    isUploading = uploadTarget != null,
                    onChangeBanner = { pickImage("banner") },
                    onChangeLogo = { pickImage("logo") }
                )
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Profil & informasi toko", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Surface(color = if (merchant.isApproved) PrimaryPale else AccentSoft, shape = RoundedCornerShape(50)) {
                        Text(if (merchant.isApproved) "Aktif" else merchant.verificationStatus.ifBlank { "Menunggu verifikasi" }, color = if (merchant.isApproved) Primary else Accent, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
                    }
                }
                Text("${merchant.branchCode.ifBlank { "Cabang utama" }} • Informasi toko", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.width(5.dp).height(24.dp).background(Primary, RoundedCornerShape(4.dp)))
                            Spacer(Modifier.width(10.dp))
                            Text("Informasi dasar usaha", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            Surface(color = PrimaryPale, shape = RoundedCornerShape(50)) {
                                Text("WAJIB", color = Primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp))
                            }
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Nama resmi usaha / resto", fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.width(4.dp))
                                Icon(Icons.Filled.Verified, contentDescription = "Terverifikasi", tint = Primary, modifier = Modifier.size(17.dp))
                            }
                            Text(if (merchant.isApproved) "Terverifikasi" else "Menunggu verifikasi", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        OutlinedTextField(
                            value = storeName,
                            onValueChange = { if (!merchant.isApproved) storeName = it.take(150) },
                            readOnly = merchant.isApproved,
                            label = { Text("Nama resmi usaha / resto") },
                            trailingIcon = { Icon(Icons.Filled.Lock, contentDescription = "Tidak dapat diubah", tint = Primary) },
                            supportingText = { Text("Perubahan nama utama memerlukan pengajuan verifikasi ulang melalui Pusat Bantuan.") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(focusedContainerColor = PrimaryPale, unfocusedContainerColor = PrimaryPale, disabledContainerColor = PrimaryPale)
                        )
                        OutlinedTextField(value = outletName, onValueChange = { outletName = it.take(120) }, label = { Text("Nama cabang / outlet") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Text("Kategori menu utama (maks. 5)", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        if (categories.isEmpty()) {
                            Text("Belum ada kategori utama. Tambahkan kategori yang paling mewakili menu toko.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        } else {
                            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                categories.forEach { category ->
                                    androidx.compose.material3.InputChip(selected = true, onClick = { categories = categories - category }, label = { Text(category) }, trailingIcon = { Icon(Icons.Filled.Close, contentDescription = "Hapus $category", modifier = Modifier.size(16.dp)) })
                                }
                            }
                        }
                        OutlinedButton(onClick = { categoryDraft = ""; categoryDialogOpen = true }, enabled = categories.size < 5, modifier = Modifier.align(Alignment.Start)) {
                            Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Tambah kategori")
                        }
                        OutlinedTextField(value = shortDescription, onValueChange = { shortDescription = it.take(200) }, label = { Text("Deskripsi singkat restoran") }, minLines = 4, modifier = Modifier.fillMaxWidth(), supportingText = { Text("${shortDescription.length} / 200 karakter") })
                        OutlinedTextField(value = address, onValueChange = { address = it.take(500) }, label = { Text("Alamat toko") }, minLines = 3, modifier = Modifier.fillMaxWidth(), supportingText = { Text("Alamat ini ditampilkan kepada pelanggan dan kurir.") })
                    }
                }
                MerchantZipInfoCard {
                    Text("Jam operasional", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    MerchantZipInfoRow("Jadwal saat ini", "${merchant.jamBuka ?: "-"} – ${merchant.jamTutup ?: "-"}")
                    Text("Atur jadwal buka dan tutup dari menu Jam operasional.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                uploadError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                state.profileSaveError?.let { error -> Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                if (state.profileSaved) Text("Profil toko berhasil disimpan.", color = Success, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                Button(onClick = { viewModel.updatePublicProfile(storeName, address, outletName, shortDescription, categories, bannerUrl, logoUrl) }, enabled = storeName.isNotBlank() && address.isNotBlank() && outletName.isNotBlank() && !state.isSavingProfile && uploadTarget == null, modifier = Modifier.fillMaxWidth(), colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Accent)) {
                    if (state.isSavingProfile) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White) else Text("Simpan perubahan")
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }

    if (categoryDialogOpen) {
        AlertDialog(
            onDismissRequest = { categoryDialogOpen = false },
            title = { Text("Tambah kategori utama") },
            text = { OutlinedTextField(value = categoryDraft, onValueChange = { categoryDraft = it.take(60) }, label = { Text("Nama kategori") }, singleLine = true, modifier = Modifier.fillMaxWidth()) },
            confirmButton = {
                TextButton(onClick = {
                    val value = categoryDraft.trim()
                    if (value.isNotBlank() && categories.none { it.equals(value, ignoreCase = true) } && categories.size < 5) categories = categories + value
                    categoryDialogOpen = false
                }, enabled = categoryDraft.trim().isNotBlank()) { Text("Tambah") }
            },
            dismissButton = { TextButton(onClick = { categoryDialogOpen = false }) { Text("Batal") } }
        )
    }
}

@Composable
private fun EditProfileHero(
    bannerUrl: String,
    logoUrl: String,
    merchantName: String,
    isUploading: Boolean,
    onChangeBanner: () -> Unit,
    onChangeLogo: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.fillMaxWidth().height(168.dp).clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.BottomEnd) {
            if (bannerUrl.isNotBlank()) AsyncImage(model = bannerUrl, contentDescription = "Banner restoran", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            else Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Icon(Icons.Filled.Storefront, contentDescription = null, tint = Primary, modifier = Modifier.size(46.dp))
                Text("Banner restoran belum diatur", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedButton(onClick = onChangeBanner, enabled = !isUploading, modifier = Modifier.padding(12.dp), colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(containerColor = Color.White.copy(alpha = .92f))) {
                Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(6.dp))
                Text("Ganti banner resto")
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(82.dp).clip(CircleShape).background(PrimaryPale), contentAlignment = Alignment.Center) {
                if (logoUrl.isNotBlank()) AsyncImage(model = logoUrl, contentDescription = "Logo restoran", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                else Text(merchantName.trim().firstOrNull()?.uppercase() ?: "T", color = Primary, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                IconButton(onClick = onChangeLogo, enabled = !isUploading, modifier = Modifier.size(30.dp).align(Alignment.BottomEnd)) {
                    Surface(shape = CircleShape, color = Accent) { Icon(Icons.Filled.CameraAlt, contentDescription = "Ganti logo restoran", tint = Color.White, modifier = Modifier.padding(7.dp)) }
                }
            }
            Spacer(Modifier.width(10.dp))
            Text("Foto profil toko • Maks. 2 MB (JPG/PNG/WebP)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** ZIP Customer Reviews route. Individual reviews are shown only when the API exposes them. */
@Composable
fun CustomerReviewsScreen(
    onBack: () -> Unit,
    viewModel: CustomerReviewsViewModel = appViewModel {
        CustomerReviewsViewModel(it.merchantRepository)
    }
) {
    val state by viewModel.uiState.collectAsState()
    var replyingTo by remember { mutableStateOf<com.tembus.merchant.data.model.MerchantReview?>(null) }
    val visibleReviews = when (state.activeFilter) {
        CustomerReviewFilter.ALL -> state.reviews
        CustomerReviewFilter.FIVE_STARS -> state.reviews.filter { it.stars == 5 }
        CustomerReviewFilter.UNREPLIED -> state.reviews.filter { it.reply == null }
    }
    MerchantZipDetailScaffold(title = "Ulasan Pelanggan", onBack = onBack) {
        when {
            state.isLoading -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
            state.errorMessage != null -> MerchantZipEmptyState(
                message = state.errorMessage ?: "Gagal memuat review customer",
                onRetry = viewModel::load
            )
            else -> {
                val merchant = state.merchant
                if (merchant == null) {
                    MerchantZipEmptyState("Profil toko belum tersedia.", onRetry = viewModel::load)
                } else {
                    Text("Ulasan Pelanggan", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(
                        "Pantau kepuasan pelanggan dan tanggapi masukan mereka.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    MerchantReviewSummaryCard(
                        average = merchant.avgRating,
                        total = merchant.ratingCount,
                        distribution = state.ratingDistribution
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ReviewFilterChip("Semua", state.activeFilter == CustomerReviewFilter.ALL) {
                            viewModel.setFilter(CustomerReviewFilter.ALL)
                        }
                        ReviewFilterChip("5 Bintang", state.activeFilter == CustomerReviewFilter.FIVE_STARS) {
                            viewModel.setFilter(CustomerReviewFilter.FIVE_STARS)
                        }
                        ReviewFilterChip("Belum Dibalas", state.activeFilter == CustomerReviewFilter.UNREPLIED) {
                            viewModel.setFilter(CustomerReviewFilter.UNREPLIED)
                        }
                    }
                    state.replyError?.let { error ->
                        MerchantZipInfoCard {
                            Text(error, color = MaterialTheme.colorScheme.error)
                            TextButton(onClick = viewModel::clearReplyError) { Text("Tutup") }
                        }
                    }
                    if (visibleReviews.isEmpty()) {
                        MerchantZipEmptyState(
                            if (state.reviews.isEmpty()) "Belum ada review customer." else "Tidak ada review untuk filter ini."
                        )
                    } else {
                        visibleReviews.forEach { review ->
                            CustomerReviewCard(review, onReply = { replyingTo = review })
                        }
                    }
                }
            }
        }
    }

    replyingTo?.let { review ->
        MerchantReviewReplyDialog(
            review = review,
            isSaving = state.isReplying,
            onDismiss = { if (!state.isReplying) replyingTo = null },
            onSubmit = { body ->
                viewModel.replyToReview(review.id, body)
                replyingTo = null
            }
        )
    }
}

@Composable
private fun MerchantReviewSummaryCard(
    average: Double,
    total: Int,
    distribution: List<com.tembus.merchant.data.model.MerchantRatingBucket>
) {
    MerchantZipInfoCard {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(String.format(Locale.US, "%.1f", average), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = Primary)
            Row {
                repeat(5) { index ->
                    Icon(
                        if (index < average.toInt()) Icons.Filled.Star else Icons.Filled.StarOutline,
                        contentDescription = "",
                        tint = Accent,
                        modifier = Modifier.size(22.dp)
                    )
                }
            }
            Text("Berdasarkan $total ulasan", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        (5 downTo 1).forEach { stars ->
            val count = distribution.firstOrNull { it.stars == stars }?.count ?: 0
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("$stars Bintang", style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(70.dp))
                LinearProgressIndicator(
                    progress = { if (total > 0) count.toFloat() / total else 0f },
                    modifier = Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)),
                    color = Primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
                Text("$count", modifier = Modifier.width(28.dp).padding(start = 8.dp), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun ReviewFilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) }
    )
}

@Composable
private fun CustomerReviewCard(
    review: com.tembus.merchant.data.model.MerchantReview,
    onReply: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.size(40.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(review.reviewerName.initials(), fontWeight = FontWeight.Bold, color = Primary)
                        }
                    }
                    Spacer(Modifier.size(8.dp))
                    Column {
                        Text(review.reviewerName.ifBlank { "Customer" }, fontWeight = FontWeight.Bold)
                        Text(review.createdAt.take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Row {
                    repeat(5) { index ->
                        Icon(
                            if (index < review.stars.coerceIn(0, 5)) Icons.Filled.Star else Icons.Filled.StarOutline,
                            contentDescription = "",
                            tint = if (index < review.stars.coerceIn(0, 5)) Accent else MaterialTheme.colorScheme.outlineVariant,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
            if (review.comment.isNotBlank()) {
                Text(review.comment, style = MaterialTheme.typography.bodyMedium)
            }
            if (review.tags.isNotEmpty()) {
                Text(review.tags.joinToString(" • "), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            review.reply?.let { reply ->
                Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Tanggapan Anda", style = MaterialTheme.typography.labelMedium, color = Primary)
                        Text(reply.body, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OutlinedButton(onClick = onReply) { Text(if (review.reply == null) "Balas" else "Ubah Balasan") }
            }
        }
    }
}

@Composable
private fun MerchantReviewReplyDialog(
    review: com.tembus.merchant.data.model.MerchantReview,
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit
) {
    var body by remember(review.id, review.reply?.body) { mutableStateOf(review.reply?.body.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (review.reply == null) "Balas Ulasan" else "Ubah Balasan") },
        text = {
            OutlinedTextField(
                value = body,
                onValueChange = { body = it.take(1000) },
                label = { Text("Tanggapan Anda") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            Button(onClick = { onSubmit(body.trim()) }, enabled = body.trim().isNotEmpty() && !isSaving) {
                if (isSaving) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                else Text("Simpan")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !isSaving) { Text("Batal") } }
    )
}

private fun String.initials(): String =
    trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifBlank { "C" }

@Composable
private fun MerchantZipDetailScaffold(
    title: String,
    onBack: () -> Unit,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Column(Modifier.fillMaxSize().background(PrimaryPale)) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = MerchantTextCatalog.translate("Kembali"))
            }
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            trailing?.invoke()
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            content()
        }
    }
}

@Composable
private fun MerchantZipInfoCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        content = { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) }
    )
}

@Composable
private fun MerchantZipInfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun MerchantZipReadOnlyField(label: String, value: String) {
    OutlinedTextField(
        value = value.ifBlank { "Belum tersedia" },
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun MerchantZipEmptyState(message: String, onRetry: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Filled.Storefront, contentDescription = "", tint = Primary, modifier = Modifier.size(40.dp))
        Spacer(Modifier.height(8.dp))
        Text(message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        onRetry?.let {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = it) { Text("Coba Lagi") }
        }
    }
}

private fun Uri.toProfileCacheImageFile(context: Context): java.io.File? = runCatching {
    val bytes = context.contentResolver.openInputStream(this)?.use { it.readBytes() } ?: return null
    java.io.File(context.cacheDir, "profile_${System.currentTimeMillis()}.jpg").apply { writeBytes(bytes) }
}.getOrNull()
