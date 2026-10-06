package com.tembus.merchant.ui.screens.registration

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.tembus.merchant.data.model.RegisterMerchantRequest
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.localization.MerchantText as LocalizedText
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.TembusRadius
import kotlinx.coroutines.launch
import java.util.Locale

private const val MERCHANT_TERMS_URL = "https://bawain.my.id/bantuan/syarat-dan-ketentuan"
private const val PRIVACY_URL = "https://bawain.my.id/bantuan/kebijakan-privasi"
private const val STEP_COUNT = 5

/** Registration is intentionally split into short, reviewable steps. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegistrationScreen(
    onBack: () -> Unit,
    onRegistered: () -> Unit,
    viewModel: RegistrationViewModel = appViewModel { RegistrationViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var step by rememberSaveable { mutableStateOf(0) }
    var namaToko by rememberSaveable { mutableStateOf("") }
    var alamat by rememberSaveable { mutableStateOf("") }
    var jamBuka by rememberSaveable { mutableStateOf("08:00") }
    var jamTutup by rememberSaveable { mutableStateOf("21:00") }
    var lokasiLat by rememberSaveable { mutableStateOf<Double?>(null) }
    var lokasiLng by rememberSaveable { mutableStateOf<Double?>(null) }

    // These are server URLs returned by multipart upload. There is no URL input in the UI.
    var ktpUrl by rememberSaveable { mutableStateOf("") }
    var fotoTokoUrl by rememberSaveable { mutableStateOf("") }
    var rekeningUrl by rememberSaveable { mutableStateOf("") }
    var halalStatus by rememberSaveable { mutableStateOf("unknown") }
    var halalNumber by rememberSaveable { mutableStateOf("") }
    var halalExpiry by rememberSaveable { mutableStateOf("") }
    var sppIrtNumber by rememberSaveable { mutableStateOf("") }
    var sppIrtExpiry by rememberSaveable { mutableStateOf("") }
    var bpomNumber by rememberSaveable { mutableStateOf("") }
    var bpomExpiry by rememberSaveable { mutableStateOf("") }
    var termsAccepted by rememberSaveable { mutableStateOf(false) }
    var validationMessage by rememberSaveable { mutableStateOf<String?>(null) }
    var locationMessage by rememberSaveable { mutableStateOf<String?>(null) }
    var docUploading by remember { mutableStateOf<String?>(null) }
    var docUploadError by remember { mutableStateOf<String?>(null) }
    var docTarget by remember { mutableStateOf<String?>(null) }

    fun setCurrentLocation() {
        val location = readLastKnownLocation(context)
        if (location == null) {
            locationMessage = "Lokasi belum tersedia. Pastikan GPS aktif lalu coba lagi."
        } else {
            lokasiLat = location.first
            lokasiLng = location.second
            locationMessage = "Lokasi saat ini berhasil dipilih."
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.values.any { it }) setCurrentLocation()
        else locationMessage = "Izin lokasi tidak diberikan. Kamu tetap bisa melanjutkan tanpa lokasi."
    }

    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val target = docTarget ?: return@rememberLauncherForActivityResult
        docUploadError = null
        scope.launch {
            docUploading = target
            val file = uri.toCacheImageFile(context)
            if (file == null) {
                docUploadError = "Foto tidak dapat dibaca dari perangkat. Pilih foto lain."
            } else {
                viewModel.uploadPhoto(file)
                    .onSuccess { url ->
                        when (target) {
                            "ktp" -> ktpUrl = url
                            "toko" -> fotoTokoUrl = url
                            "rekening" -> rekeningUrl = url
                        }
                    }
                    .onFailure { error ->
                        docUploadError = error.message ?: "Foto gagal diunggah. Coba lagi."
                    }
            }
            docUploading = null
        }
    }

    fun pickDoc(target: String) {
        docTarget = target
        photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    fun submit() {
        viewModel.register(
            RegisterMerchantRequest(
                namaToko = namaToko.trim(),
                alamat = alamat.trim(),
                lokasiLat = lokasiLat,
                lokasiLng = lokasiLng,
                jamBuka = jamBuka.trim().ifBlank { null },
                jamTutup = jamTutup.trim().ifBlank { null },
                ktpPemilikUrl = ktpUrl,
                fotoTempatUsahaUrl = fotoTokoUrl,
                rekeningBankUrl = rekeningUrl,
                halalStatus = halalStatus,
                halalCertNumber = if (halalStatus == "halal_certified") halalNumber.trim().ifBlank { null } else null,
                halalExpiryDate = if (halalStatus == "halal_certified") halalExpiry.trim().ifBlank { null } else null,
                sppIrtNumber = sppIrtNumber.trim().ifBlank { null },
                sppIrtExpiryDate = sppIrtExpiry.trim().ifBlank { null },
                bpomNumber = bpomNumber.trim().ifBlank { null },
                bpomExpiryDate = bpomExpiry.trim().ifBlank { null },
                businessType = "perorangan"
            )
        )
    }

    state.errorMessage?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::clearError,
            confirmButton = { TextButton(onClick = viewModel::clearError) { LocalizedText("OK") } },
            title = { LocalizedText("Gagal mendaftar") },
            text = { LocalizedText(message) }
        )
    }

    if (state.success) {
        RegisteredSuccessContent(onDone = onRegistered)
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { LocalizedText("Daftar Merchant") },
                navigationIcon = {
                    IconButton(onClick = { if (step == 0) onBack() else step -= 1 }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = MerchantTextCatalog.translate("Kembali"))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Text("Lengkapi data tokomu", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(4.dp))
            Text("Langkah ${step + 1} dari $STEP_COUNT · Data dikirim setelah kamu selesai meninjau.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(12.dp))
            LinearProgressIndicator(progress = { (step + 1).toFloat() / STEP_COUNT }, modifier = Modifier.fillMaxWidth())
            Spacer(modifier = Modifier.height(20.dp))

            when (step) {
                0 -> BusinessDetailsStep(namaToko, { namaToko = it }, jamBuka, { jamBuka = it }, jamTutup, { jamTutup = it })
                1 -> AddressStep(
                    alamat = alamat,
                    onAlamatChange = { alamat = it },
                    lokasiLat = lokasiLat,
                    lokasiLng = lokasiLng,
                    locationMessage = locationMessage,
                    onUseCurrentLocation = {
                        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                        if (fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED) {
                            setCurrentLocation()
                        } else {
                            locationPermissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                        }
                    }
                )
                2 -> DocumentsStep(ktpUrl, fotoTokoUrl, rekeningUrl, docUploading, docUploadError, ::pickDoc)
                3 -> FoodDocumentsStep(
                    halalStatus, { halalStatus = it }, halalNumber, { halalNumber = it }, halalExpiry, { halalExpiry = it },
                    sppIrtNumber, { sppIrtNumber = it }, sppIrtExpiry, { sppIrtExpiry = it },
                    bpomNumber, { bpomNumber = it }, bpomExpiry, { bpomExpiry = it }
                )
                else -> ReviewStep(
                    namaToko = namaToko,
                    alamat = alamat,
                    jamBuka = jamBuka,
                    jamTutup = jamTutup,
                    hasLocation = lokasiLat != null && lokasiLng != null,
                    hasKtp = ktpUrl.isNotBlank(),
                    hasStorePhoto = fotoTokoUrl.isNotBlank(),
                    hasBankPhoto = rekeningUrl.isNotBlank(),
                    termsAccepted = termsAccepted,
                    onTermsChanged = { termsAccepted = it },
                    onOpenTerms = { openLegalDocument(context, MERCHANT_TERMS_URL) },
                    onOpenPrivacy = { openLegalDocument(context, PRIVACY_URL) }
                )
            }

            validationMessage?.let { message ->
                Spacer(modifier = Modifier.height(12.dp))
                Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(modifier = Modifier.height(24.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (step > 0) {
                    OutlinedButton(onClick = { step -= 1 }, modifier = Modifier.weight(1f)) { LocalizedText("Kembali") }
                }
                Button(
                    onClick = {
                        validationMessage = validateStep(step, namaToko, alamat, ktpUrl, fotoTokoUrl, rekeningUrl, termsAccepted)
                        if (validationMessage == null) {
                            if (step < STEP_COUNT - 1) step += 1 else submit()
                        }
                    },
                    enabled = !state.isLoading && docUploading == null,
                    modifier = Modifier.weight(1f)
                ) {
                    if (state.isLoading) CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                    else LocalizedText(if (step == STEP_COUNT - 1) "Kirim pendaftaran" else "Lanjut")
                }
            }
            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}

@Composable
private fun BusinessDetailsStep(
    namaToko: String,
    onNamaTokoChange: (String) -> Unit,
    jamBuka: String,
    onJamBukaChange: (String) -> Unit,
    jamTutup: String,
    onJamTutupChange: (String) -> Unit
) {
    StepHeading("Data usaha", "Mulai dari informasi dasar toko dan jam operasional.")
    OutlinedTextField(value = namaToko, onValueChange = onNamaTokoChange, label = { LocalizedText("Nama toko *") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Spacer(modifier = Modifier.height(12.dp))
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Pendaftaran merchant perorangan", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(4.dp))
            Text("Form aplikasi ini khusus pemilik usaha perorangan. Pendaftaran PT atau badan usaha dilakukan melalui Portal Mitra.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
    Spacer(modifier = Modifier.height(16.dp))
    Text("Jam operasional", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
    Spacer(modifier = Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(value = jamBuka, onValueChange = onJamBukaChange, label = { LocalizedText("Buka") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text), modifier = Modifier.weight(1f))
        OutlinedTextField(value = jamTutup, onValueChange = onJamTutupChange, label = { LocalizedText("Tutup") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text), modifier = Modifier.weight(1f))
    }
}

@Composable
private fun AddressStep(
    alamat: String,
    onAlamatChange: (String) -> Unit,
    lokasiLat: Double?,
    lokasiLng: Double?,
    locationMessage: String?,
    onUseCurrentLocation: () -> Unit
) {
    StepHeading("Alamat toko", "Tulis alamat yang bisa dipakai kurir. Penentuan lokasi dari GPS bersifat opsional.")
    OutlinedTextField(value = alamat, onValueChange = onAlamatChange, label = { LocalizedText("Alamat lengkap toko *") }, placeholder = { LocalizedText("Contoh: Jl. Mawar No. 10, Kecamatan...") }, minLines = 4, modifier = Modifier.fillMaxWidth())
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedButton(onClick = onUseCurrentLocation, modifier = Modifier.fillMaxWidth()) {
        Icon(Icons.Filled.LocationOn, contentDescription = null)
        Spacer(modifier = Modifier.width(8.dp))
        LocalizedText("Gunakan lokasi saat ini (opsional)")
    }
    Spacer(modifier = Modifier.height(8.dp))
    when {
        lokasiLat != null && lokasiLng != null -> Text(String.format(Locale.US, "Lokasi tersimpan: %.6f, %.6f", lokasiLat, lokasiLng), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
        locationMessage != null -> Text(locationMessage, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        else -> Text("Tanpa lokasi GPS pun kamu tetap bisa mendaftar.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun DocumentsStep(
    ktpUrl: String,
    fotoTokoUrl: String,
    rekeningUrl: String,
    uploading: String?,
    uploadError: String?,
    onPick: (String) -> Unit
) {
    StepHeading("Dokumen verifikasi", "Ambil atau pilih foto dari perangkat. URL tidak perlu ditempel; foto langsung diunggah untuk verifikasi admin.")
    DocumentUploadField("Foto KTP", "KTP pemilik toko *", ktpUrl, uploading == "ktp", { onPick("ktp") })
    Spacer(modifier = Modifier.height(12.dp))
    DocumentUploadField("Foto tempat usaha", "Tampak depan toko *", fotoTokoUrl, uploading == "toko", { onPick("toko") })
    Spacer(modifier = Modifier.height(12.dp))
    DocumentUploadField("Foto rekening bank", "Buku tabungan atau bukti rekening *", rekeningUrl, uploading == "rekening", { onPick("rekening") })
    uploadError?.let {
        Spacer(modifier = Modifier.height(8.dp))
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun FoodDocumentsStep(
    halalStatus: String,
    onHalalStatusChange: (String) -> Unit,
    halalNumber: String,
    onHalalNumberChange: (String) -> Unit,
    halalExpiry: String,
    onHalalExpiryChange: (String) -> Unit,
    sppIrtNumber: String,
    onSppIrtNumberChange: (String) -> Unit,
    sppIrtExpiry: String,
    onSppIrtExpiryChange: (String) -> Unit,
    bpomNumber: String,
    onBpomNumberChange: (String) -> Unit,
    bpomExpiry: String,
    onBpomExpiryChange: (String) -> Unit
) {
    StepHeading("Dokumen pangan (opsional)", "Bagian ini boleh dilewati. Dokumen pangan dapat dilengkapi atau diperbarui setelah toko disetujui.")
    Text("Status halal", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(modifier = Modifier.height(6.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        FilterChip(selected = halalStatus == "unknown", onClick = { onHalalStatusChange("unknown") }, label = { LocalizedText("Belum ditentukan") })
        FilterChip(selected = halalStatus == "halal_certified", onClick = { onHalalStatusChange("halal_certified") }, label = { LocalizedText("Bersertifikat") })
        FilterChip(selected = halalStatus == "non_halal", onClick = { onHalalStatusChange("non_halal") }, label = { LocalizedText("Non-halal") })
    }
    if (halalStatus == "halal_certified") {
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(value = halalNumber, onValueChange = onHalalNumberChange, label = { LocalizedText("Nomor sertifikat halal") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(value = halalExpiry, onValueChange = onHalalExpiryChange, label = { LocalizedText("Masa berlaku halal (YYYY-MM-DD)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    }
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(value = sppIrtNumber, onValueChange = onSppIrtNumberChange, label = { LocalizedText("Nomor SPP-IRT (opsional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(value = sppIrtExpiry, onValueChange = onSppIrtExpiryChange, label = { LocalizedText("Masa berlaku SPP-IRT (YYYY-MM-DD)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(value = bpomNumber, onValueChange = onBpomNumberChange, label = { LocalizedText("Nomor izin edar BPOM (opsional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(value = bpomExpiry, onValueChange = onBpomExpiryChange, label = { LocalizedText("Masa berlaku BPOM (YYYY-MM-DD)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun ReviewStep(
    namaToko: String,
    alamat: String,
    jamBuka: String,
    jamTutup: String,
    hasLocation: Boolean,
    hasKtp: Boolean,
    hasStorePhoto: Boolean,
    hasBankPhoto: Boolean,
    termsAccepted: Boolean,
    onTermsChanged: (Boolean) -> Unit,
    onOpenTerms: () -> Unit,
    onOpenPrivacy: () -> Unit
) {
    StepHeading("Periksa dan kirim", "Pastikan informasi dan tiga foto wajib sudah benar sebelum dikirim ke admin.")
    SummaryRow("Nama toko", namaToko)
    SummaryRow("Alamat", alamat)
    SummaryRow("Jam operasional", "$jamBuka – $jamTutup")
    SummaryRow("Lokasi GPS", if (hasLocation) "Dipilih (opsional)" else "Tidak dipilih")
    Divider(modifier = Modifier.padding(vertical = 8.dp))
    SummaryRow("Foto KTP", if (hasKtp) "Siap diunggah" else "Belum dipilih")
    SummaryRow("Foto tempat usaha", if (hasStorePhoto) "Siap diunggah" else "Belum dipilih")
    SummaryRow("Foto rekening bank", if (hasBankPhoto) "Siap diunggah" else "Belum dipilih")
    Spacer(modifier = Modifier.height(12.dp))
    Row(verticalAlignment = Alignment.Top) {
        Checkbox(checked = termsAccepted, onCheckedChange = onTermsChanged)
        Column(modifier = Modifier.padding(top = 12.dp)) {
            Text("Saya menyetujui Perjanjian Mitra Merchant TEMBUS dan Kebijakan Privasi.", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = onOpenTerms, contentPadding = PaddingValues(0.dp)) { LocalizedText("Baca perjanjian") }
                TextButton(onClick = onOpenPrivacy, contentPadding = PaddingValues(0.dp)) { LocalizedText("Baca privasi") }
            }
        }
    }
}

@Composable
private fun StepHeading(title: String, description: String) {
    Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    Spacer(modifier = Modifier.height(4.dp))
    Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(modifier = Modifier.height(18.dp))
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Column(modifier = Modifier.padding(vertical = 6.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value.ifBlank { "Belum diisi" }, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun DocumentUploadField(
    label: String,
    helper: String,
    value: String,
    uploading: Boolean,
    onPick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(132.dp)
                .clip(RoundedCornerShape(TembusRadius.Input))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable(enabled = !uploading, onClick = onPick),
            contentAlignment = Alignment.Center
        ) {
            when {
                uploading -> CircularProgressIndicator(modifier = Modifier.size(26.dp), strokeWidth = 2.dp)
                value.isNotBlank() -> {
                    AsyncImage(model = value, contentDescription = label, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    Box(modifier = Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.38f)), contentAlignment = Alignment.Center) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Check, contentDescription = null, tint = androidx.compose.ui.graphics.Color.White)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Foto tersimpan · ganti", color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.titleSmall)
                        }
                    }
                }
                else -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.AddPhotoAlternate, contentDescription = null, modifier = Modifier.size(32.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text("Pilih foto $label", style = MaterialTheme.typography.titleSmall)
                    Text(helper, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

private fun validateStep(
    step: Int,
    namaToko: String,
    alamat: String,
    ktpUrl: String,
    fotoTokoUrl: String,
    rekeningUrl: String,
    termsAccepted: Boolean
): String? = when (step) {
    0 -> if (namaToko.isBlank()) "Nama toko wajib diisi." else null
    1 -> if (alamat.isBlank()) "Alamat lengkap toko wajib diisi." else null
    2 -> when {
        ktpUrl.isBlank() -> "Foto KTP wajib dipilih."
        fotoTokoUrl.isBlank() -> "Foto tempat usaha wajib dipilih."
        rekeningUrl.isBlank() -> "Foto rekening bank wajib dipilih."
        else -> null
    }
    4 -> if (!termsAccepted) "Setujui perjanjian mitra dan kebijakan privasi untuk mengirim pendaftaran." else null
    else -> null
}

private fun openLegalDocument(context: Context, url: String) {
    ContextCompat.startActivity(context, Intent(Intent.ACTION_VIEW, Uri.parse(url)), null)
}

@Composable
private fun RegisteredSuccessContent(onDone: () -> Unit) {
    val context = LocalContext.current
    val statusUrl = "https://merchant.bawain.my.id/status"
    Column(modifier = Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(72.dp), tint = Primary)
        Spacer(modifier = Modifier.height(16.dp))
        Text("Pendaftaran merchant perorangan terkirim", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(modifier = Modifier.height(8.dp))
        Text("Data dan dokumenmu sedang diverifikasi admin Tembus. Kamu baru bisa menerima pesanan setelah statusnya disetujui.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(modifier = Modifier.height(24.dp))
        OutlinedButton(onClick = { ContextCompat.startActivity(context, Intent(Intent.ACTION_VIEW, Uri.parse(statusUrl)), null) }, modifier = Modifier.fillMaxWidth()) { Text("Cek status pendaftaran di web") }
        Spacer(modifier = Modifier.height(10.dp))
        Text("Gunakan email atau nomor HP yang sama saat mendaftar untuk melihat status terbaru.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onDone) { Text("Selesai") }
    }
}

private fun readLastKnownLocation(context: Context): Pair<Double, Double>? {
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    if (!hasFine && !hasCoarse) return null
    return manager.getProviders(true)
        .asSequence()
        .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
        .maxByOrNull { it.time }
        ?.let { it.latitude to it.longitude }
}

private fun Uri.toCacheImageFile(context: Context): java.io.File? = runCatching {
    val bytes = context.contentResolver.openInputStream(this)?.use { it.readBytes() } ?: return null
    java.io.File(context.cacheDir, "doc_${System.currentTimeMillis()}.jpg").apply { writeBytes(bytes) }
}.getOrNull()
