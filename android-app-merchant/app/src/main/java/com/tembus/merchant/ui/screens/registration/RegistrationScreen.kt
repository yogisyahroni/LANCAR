package com.tembus.merchant.ui.screens.registration

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.RegisterMerchantRequest
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary

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
    var ktpUrl by remember { mutableStateOf("") }
    var fotoTokoUrl by remember { mutableStateOf("") }
    var rekeningUrl by remember { mutableStateOf("") }
    // FB-092: dokumen pangan (opsional saat daftar, wajib sebelum buka toko)
    var halalNumber by remember { mutableStateOf("") }
    var halalExpiry by remember { mutableStateOf("") }
    var sppIrtNumber by remember { mutableStateOf("") }
    var sppIrtExpiry by remember { mutableStateOf("") }
    var bpomNumber by remember { mutableStateOf("") }
    var bpomExpiry by remember { mutableStateOf("") }

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
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Kembali")
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

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Dokumen Verifikasi (URL)",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "Unggah dokumen via website admin, lalu tempel URL-nya di sini.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = ktpUrl,
                onValueChange = { ktpUrl = it },
                label = { Text("URL Foto KTP*") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = fotoTokoUrl,
                onValueChange = { fotoTokoUrl = it },
                label = { Text("URL Foto Tempat Usaha*") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = rekeningUrl,
                onValueChange = { rekeningUrl = it },
                label = { Text("URL Rekening Bank*") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))

            // ── FB-092: Dokumen pangan (opsional) ──
            Text(
                text = "Dokumen Pangan (Opsional)",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "Sertifikat halal BPJPH + SPP-IRT atau izin edar BPOM (UU 33/2014, PerBPOM 4/2024). " +
                    "Boleh diisi nanti, tapi wajib lengkap sebelum buka toko.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(12.dp))
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
                            jamBuka = jamBuka.trim().ifBlank { null },
                            jamTutup = jamTutup.trim().ifBlank { null },
                            ktpPemilikUrl = ktpUrl.trim(),
                            fotoTempatUsahaUrl = fotoTokoUrl.trim(),
                            rekeningBankUrl = rekeningUrl.trim(),
                            // FB-092: dokumen pangan opsional saat daftar
                            halalCertNumber = halalNumber.trim().ifBlank { null },
                            halalExpiryDate = halalExpiry.trim().ifBlank { null },
                            sppIrtNumber = sppIrtNumber.trim().ifBlank { null },
                            sppIrtExpiryDate = sppIrtExpiry.trim().ifBlank { null },
                            bpomNumber = bpomNumber.trim().ifBlank { null },
                            bpomExpiryDate = bpomExpiry.trim().ifBlank { null }
                        )
                    )
                },
                enabled = !state.isLoading &&
                    namaToko.isNotBlank() &&
                    alamat.isNotBlank() &&
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
            contentDescription = null,
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
