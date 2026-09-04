package com.tembus.merchant.ui.screens.registration

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.tembus.merchant.data.model.RegisterMerchantRequest
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.components.LocationPickerSection
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.TembusRadius
import kotlinx.coroutines.launch

/**
 * RegistrationScreen — pendaftaran merchant (FOOD-BIKE-045/049).
 * Setelah submit → status pending → tunggu verifikasi admin.
 * Dokumen (KTP, foto toko, rekening) berupa URL (upload via admin/web).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegistrationScreen(
    onBack: () -> Unit,
    onRegistered: () -> Unit,
    viewModel: RegistrationViewModel = appViewModel { RegistrationViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()

    var namaToko by remember { mutableStateOf("") }
    var alamat by remember { mutableStateOf("") }
    var jamBuka by remember { mutableStateOf("08:00") }
    var jamTutup by remember { mutableStateOf("21:00") }
    // FB-093: lokasi toko WAJIB (pin di peta OSM)
    var lokasiLat by remember { mutableStateOf<Double?>(null) }
    var lokasiLng by remember { mutableStateOf<Double?>(null) }
    var ktpUrl by remember { mutableStateOf("") }
    var fotoTokoUrl by remember { mutableStateOf("") }
    var rekeningUrl by remember { mutableStateOf("") }
    // FB-092/ADR 003: dokumen pangan (opsional — soft-gate, bukan syarat buka)
    var halalStatus by remember { mutableStateOf("unknown") }
    var halalNumber by remember { mutableStateOf("") }
    var halalExpiry by remember { mutableStateOf("") }
    var sppIrtNumber by remember { mutableStateOf("") }
    var sppIrtExpiry by remember { mutableStateOf("") }
    var bpomNumber by remember { mutableStateOf("") }
    var bpomExpiry by remember { mutableStateOf("") }
    // X1/M1: jenis usaha — perorangan (tanpa staff) | perusahaan (wajib staff mgmt).
    var businessType by remember { mutableStateOf("perorangan") }

    // FB-045: upload dokumen dari galeri — target field yang lagi di-upload
    var docUploading by remember { mutableStateOf<String?>(null) } // "ktp"|"toko"|"rekening"
    var docUploadError by remember { mutableStateOf<String?>(null) }
    var docTarget by remember { mutableStateOf<String?>(null) }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null) {
            val target = docTarget
            docUploadError = null
            scope.launch {
                docUploading = target
                val file = uri.toCacheImageFile(context)
                if (file == null) {
                    docUploading = null
                    docUploadError = "Gagal membaca foto dari galeri"
                } else {
                    viewModel.uploadPhoto(file)
                        .onSuccess { url ->
                            when (target) {
                                "ktp" -> ktpUrl = url
                                "toko" -> fotoTokoUrl = url
                                "rekening" -> rekeningUrl = url
                            }
                        }
                        .onFailure { e -> docUploadError = e.message ?: "Gagal upload foto" }
                    docUploading = null
                }
            }
        }
    }

    fun pickDoc(target: String) {
        docTarget = target
        photoPicker.launch(
            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
        )
    }

    state.errorMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = viewModel::clearError,
            confirmButton = {
                TextButton(onClick = viewModel::clearError) { Text("OK") }
            },
            title = { Text("Gagal Mendaftar") },
            text = { Text(msg) }
        )
    }

    if (state.success) {
        RegisteredSuccessContent(onDone = onRegistered)
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Daftar Merchant") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
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
                .padding(16.dp)
        ) {
            Text(
                text = "Lengkapi data tokomu",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Setelah mendaftar, admin Tembus akan memverifikasi. Kamu baru bisa menerima pesanan setelah status approved.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(24.dp))

            OutlinedTextField(
                value = namaToko,
                onValueChange = { namaToko = it },
                label = { Text("Nama Toko*") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = alamat,
                onValueChange = { alamat = it },
                label = { Text("Alamat Toko*") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = jamBuka,
                    onValueChange = { jamBuka = it },
                    label = { Text("Jam Buka") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = jamTutup,
                    onValueChange = { jamTutup = it },
                    label = { Text("Jam Tutup") },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // X1/M1: pilihan jenis usaha (conditional staff management).
            Text(
                text = "Jenis Usaha",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "Perusahaan wajib punya manajemen staff (kasir/dapur). Perorangan dikerjakan langsung oleh pemilik.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = businessType == "perorangan",
                    onClick = { businessType = "perorangan" },
                    label = { Text("Perorangan") }
                )
                FilterChip(
                    selected = businessType == "perusahaan",
                    onClick = { businessType = "perusahaan" },
                    label = { Text("Perusahaan") }
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // FB-093: lokasi toko wajib — pin di peta OSM
            LocationPickerSection(
                lat = lokasiLat,
                lng = lokasiLng,
                onChange = { newLat, newLng ->
                    lokasiLat = newLat
                    lokasiLng = newLng
                },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Dokumen Verifikasi",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "Foto KTP, tempat usaha, dan rekening diunggah dari galeri. Admin memakai dokumen ini untuk verifikasi.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(12.dp))
            DocumentUploadField(
                label = "Foto KTP",
                helper = "KTP pemilik toko*",
                value = ktpUrl,
                uploading = docUploading == "ktp",
                onPick = { pickDoc("ktp") },
                onValueChange = { ktpUrl = it }
            )
            Spacer(modifier = Modifier.height(12.dp))
            DocumentUploadField(
                label = "Foto Tempat Usaha",
                helper = "Tampak depan toko*",
                value = fotoTokoUrl,
                uploading = docUploading == "toko",
                onPick = { pickDoc("toko") },
                onValueChange = { fotoTokoUrl = it }
            )
            Spacer(modifier = Modifier.height(12.dp))
            DocumentUploadField(
                label = "Foto Rekening Bank",
                helper = "Buku tabungan / bukti rekening*",
                value = rekeningUrl,
                uploading = docUploading == "rekening",
                onPick = { pickDoc("rekening") },
                onValueChange = { rekeningUrl = it }
            )

            docUploadError?.let { msg ->
                Spacer(modifier = Modifier.height(6.dp))
                Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(modifier = Modifier.height(24.dp))

            // ── FB-092: Dokumen pangan (opsional) ──
            Text(
                text = "Dokumen Pangan (Opsional)",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "Sertifikat halal BPJPH + SPP-IRT atau izin edar BPOM (UU 33/2014, PerBPOM 4/2024). " +
                    "Semua opsional — toko tetap bisa buka tanpa dokumen ini. Status halal dipakai untuk label & filter customer.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(12.dp))

            // ── ADR 003: pilihan status halal ──
            Text(
                text = "Status Halal",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = halalStatus == "unknown",
                    onClick = { halalStatus = "unknown" },
                    label = { Text("Belum ditentukan") }
                )
                FilterChip(
                    selected = halalStatus == "halal_certified",
                    onClick = { halalStatus = "halal_certified" },
                    label = { Text("Bersertifikat") }
                )
                FilterChip(
                    selected = halalStatus == "non_halal",
                    onClick = { halalStatus = "non_halal" },
                    label = { Text("Non-Halal") }
                )
            }
            if (halalStatus == "halal_certified") {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Isi nomor sertifikat & masa berlaku di bawah. Badge Halal otomatis muncul & kedaluwarsa otomatis dihapus.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            if (halalStatus == "non_halal") {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Menjual produk non-halal? Pilih ini — customer bisa filter & melihat label Non-Halal.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.tertiary
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            if (halalStatus == "halal_certified") {
                OutlinedTextField(
                    value = halalNumber,
                    onValueChange = { halalNumber = it },
                    label = { Text("Nomor Sertifikat Halal") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = halalExpiry,
                    onValueChange = { halalExpiry = it },
                    label = { Text("Masa Berlaku Halal (YYYY-MM-DD)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            OutlinedTextField(
                value = sppIrtNumber,
                onValueChange = { sppIrtNumber = it },
                label = { Text("Nomor SPP-IRT (awalan P-IRT)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = sppIrtExpiry,
                onValueChange = { sppIrtExpiry = it },
                label = { Text("Masa Berlaku SPP-IRT (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = bpomNumber,
                onValueChange = { bpomNumber = it },
                label = { Text("Nomor Izin Edar BPOM (awalan MD/ML)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = bpomExpiry,
                onValueChange = { bpomExpiry = it },
                label = { Text("Masa Berlaku BPOM (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    viewModel.register(
                        RegisterMerchantRequest(
                            namaToko = namaToko.trim(),
                            alamat = alamat.trim(),
                            // FB-093: lokasi wajib
                            lokasiLat = lokasiLat,
                            lokasiLng = lokasiLng,
                            jamBuka = jamBuka.trim().ifBlank { null },
                            jamTutup = jamTutup.trim().ifBlank { null },
                            ktpPemilikUrl = ktpUrl.trim(),
                            fotoTempatUsahaUrl = fotoTokoUrl.trim(),
                            rekeningBankUrl = rekeningUrl.trim(),
                            // FB-092: dokumen pangan opsional saat daftar (ADR 003 soft-gate)
                            halalStatus = halalStatus,
                            halalCertNumber = if (halalStatus == "halal_certified") halalNumber.trim().ifBlank { null } else null,
                            halalExpiryDate = if (halalStatus == "halal_certified") halalExpiry.trim().ifBlank { null } else null,
                            sppIrtNumber = sppIrtNumber.trim().ifBlank { null },
                            sppIrtExpiryDate = sppIrtExpiry.trim().ifBlank { null },
                            bpomNumber = bpomNumber.trim().ifBlank { null },
                            bpomExpiryDate = bpomExpiry.trim().ifBlank { null },
                            // X1/M1: jenis usaha (conditional staff mgmt).
                            businessType = businessType
                        )
                    )
                },
                enabled = !state.isLoading &&
                    namaToko.isNotBlank() &&
                    alamat.isNotBlank() &&
                    lokasiLat != null &&
                    lokasiLng != null &&
                    ktpUrl.isNotBlank() &&
                    fotoTokoUrl.isNotBlank() &&
                    rekeningUrl.isNotBlank(),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("Daftar", style = MaterialTheme.typography.titleMedium)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun RegisteredSuccessContent(onDone: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = "",
            modifier = Modifier.size(72.dp),
            tint = Primary
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Pendaftaran Terkirim!",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Tokomu sedang menunggu verifikasi admin Tembus. Kamu akan bisa menerima pesanan setelah disetujui.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onDone) {
            Text("Selesai")
        }
    }
}

// FB-045: field upload dokumen — area tap → galeri + preview + fallback URL.
@Composable
private fun DocumentUploadField(
    label: String,
    helper: String,
    value: String,
    uploading: Boolean,
    onPick: () -> Unit,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(96.dp)
                .clip(RoundedCornerShape(TembusRadius.Input))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable(enabled = !uploading) { onPick() },
            contentAlignment = Alignment.Center
        ) {
            when {
                uploading -> {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                }

                value.isNotBlank() -> {
                    AsyncImage(
                        model = value,
                        contentDescription = label,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                    // Overlay tipis + label "Ganti"
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.30f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "Ganti foto",
                            color = androidx.compose.ui.graphics.Color.White,
                            style = MaterialTheme.typography.titleSmall
                        )
                    }
                }

                else -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Filled.AddPhotoAlternate,
                            contentDescription = "",
                            modifier = Modifier.size(32.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(label, style = MaterialTheme.typography.titleSmall)
                        Text(
                            helper,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text("atau tempel URL $label") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth()
        )
    }
}

// FB-045: salin foto dari galeri (content://) ke file cache supaya bisa di-upload.
private fun Uri.toCacheImageFile(context: Context): java.io.File? = runCatching {
    val bytes = context.contentResolver.openInputStream(this)?.use { it.readBytes() } ?: return null
    val f = java.io.File(context.cacheDir, "doc_${System.currentTimeMillis()}.jpg")
    f.writeBytes(bytes)
    f
}.getOrNull()
